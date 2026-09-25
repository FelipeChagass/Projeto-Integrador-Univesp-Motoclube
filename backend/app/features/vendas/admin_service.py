"""Edição/exclusão atômica: caixa → venda → membro → produtos em ordem crescente.

A chave externa é bloqueada antes dessas linhas, como no registro original.
Valores contados no fechamento são preservados; fechamentos calculados são refeitos.
"""
import hashlib
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, text

from app.core.database import unit_of_work
from app.core.errors import ApiError
from app.core.schemas import Dinheiro
from app.models import Caixa, Membro, MovimentacaoMembro, Produto, Venda
from app.models.venda import OperacaoExcluida


class VersaoPayload(BaseModel):
    model_config = ConfigDict(extra='forbid')
    versao: int = Field(ge=1)


class ItemEdicao(BaseModel):
    model_config = ConfigDict(extra='forbid')
    id: UUID
    quantidade: int = Field(ge=0, le=100000, strict=True)
    preco_unitario: Dinheiro
    observacoes: str = Field(default='', max_length=1000)


class VendaEdicao(VersaoPayload):
    itens: list[ItemEdicao] = Field(default_factory=list, max_length=500)
    valor_total: Dinheiro | None = None
    metodo_pagamento: Literal['dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'fiado', 'ajuste']
    nome_cliente: str = Field(default='', max_length=200)
    observacoes: str = Field(default='', max_length=2000)


class MovimentoEdicao(VersaoPayload):
    tipo: Literal['debito', 'credito']
    valor: Dinheiro
    descricao: str = Field(default='', max_length=1000)


def conferir_versao(registro, versao):
    if registro.versao != versao:
        raise ApiError('REGISTRO_ALTERADO', 'Registro alterado por outro usuário. Atualize a tela e tente novamente.', 409)


def _saldo(membro, delta):
    novo = Decimal(membro.saldo_devedor) + delta
    if novo < 0:
        raise ApiError('SALDO_NEGATIVO', 'A alteração excede a dívida atual. Corrija os recebimentos vinculados antes de continuar.', 409)
    membro.saldo_devedor = novo


def _efeito(movimento):
    if movimento.tipo_movimentacao not in ('debito', 'credito'):
        raise ApiError('MOVIMENTO_AMBIGUO', 'Movimentação histórica sem direção de saldo. Reconcilie antes de alterar.', 409)
    return Decimal(movimento.valor) * (1 if movimento.tipo_movimentacao == 'debito' else -1)


def alterar_venda(db, venda_id, dados, excluir=False):
    entrada = (VersaoPayload if excluir else VendaEdicao).model_validate(dados)
    with unit_of_work(db):
        original = db.get(Venda, venda_id)
        if not original:
            raise ApiError('VENDA_NAO_ENCONTRADA', 'Venda não encontrada.', 404)
        if original.id_externo:
            chave = int.from_bytes(hashlib.sha256(original.id_externo.encode()).digest()[:8], 'big', signed=True)
            db.execute(text('SELECT pg_advisory_xact_lock(:chave)'), {'chave': chave})
        caixa = db.query(Caixa).filter_by(id=original.caixa_id).populate_existing().with_for_update().first() if original.caixa_id else None
        venda = db.query(Venda).filter_by(id=venda_id).populate_existing().with_for_update().first()
        if not venda:
            raise ApiError('VENDA_NAO_ENCONTRADA', 'Venda já excluída.', 404)
        conferir_versao(venda, entrada.versao)
        membro = db.query(Membro).filter_by(id=venda.membro_id).populate_existing().with_for_update().first() if venda.membro_id else None
        movimentos = db.query(MovimentacaoMembro).filter_by(venda_id=venda.id).populate_existing().with_for_update().all()
        if any(m.membro_id != venda.membro_id for m in movimentos):
            raise ApiError('VINCULO_INCONSISTENTE', 'Venda com vínculos de membros inconsistentes.', 409)
        if venda.tipo_venda in ('fiado', 'recebimento_divida') and (not membro or len(movimentos) != 1):
            raise ApiError('VINCULO_INCONSISTENTE', 'Venda sem uma movimentação financeira correspondente.', 409)
        if movimentos:
            tipo_esperado = 'debito' if venda.tipo_venda == 'fiado' else 'credito' if venda.tipo_venda == 'recebimento_divida' else None
            if any(m.tipo_movimentacao != tipo_esperado or m.valor != venda.valor_total for m in movimentos):
                raise ApiError('VINCULO_INCONSISTENTE', 'Movimentação diverge da venda; reconcilie antes de alterar.', 409)
        db.expire(venda, ['itens'])
        itens = list(venda.itens)
        produtos = {p.id: p for p in db.query(Produto).filter(Produto.id.in_([i.produto_id for i in itens if i.produto_id])).order_by(Produto.id).populate_existing().with_for_update().all()}
        novos = {} if excluir else {i.id: i for i in entrada.itens}
        if not excluir:
            if len(novos) != len(entrada.itens) or set(novos) != {i.id for i in itens}:
                raise ApiError('ITENS_INVALIDOS', 'Envie cada item da venda uma vez; quantidade zero remove o item.', 422)
            metodos = ('fiado',) if venda.tipo_venda == 'fiado' else ('ajuste',) if venda.tipo_venda == 'ajuste' else ('dinheiro', 'pix', 'cartao_credito', 'cartao_debito')
            if entrada.metodo_pagamento not in metodos:
                raise ApiError('METODO_INVALIDO', 'Método incompatível com o tipo da venda.', 422)
        deltas = {}
        for item in itens:
            novo = novos.get(item.id)
            delta = item.quantidade - (novo.quantidade if novo else 0)
            if delta and item.produto_id not in produtos:
                raise ApiError('PRODUTO_AUSENTE', 'Produto histórico ausente; não é possível reconciliar seu estoque.', 409)
            if item.produto_id in produtos:
                deltas[item.produto_id] = deltas.get(item.produto_id, 0) + delta
        for produto_id, delta in deltas.items():
            produto = produtos[produto_id]
            if produto.estoque_bar + delta < 0:
                raise ApiError('ESTOQUE_INSUFICIENTE', 'Estoque insuficiente para aumentar a quantidade.', 409)
            produto.estoque_bar += delta
        total = Decimal('0')
        for item in itens:
            novo = novos.get(item.id)
            quantidade = novo.quantidade if novo else 0
            if not excluir:
                if quantidade == 0:
                    venda.itens.remove(item)
                else:
                    item.quantidade = quantidade
                    item.preco_unitario = novo.preco_unitario
                    item.preco_total = novo.preco_unitario * quantidade
                    item.observacoes = novo.observacoes
                    total += item.preco_total
        if not excluir and not itens:
            if entrada.valor_total is None:
                raise ApiError('VALOR_OBRIGATORIO', 'Informe o valor do recebimento ou ajuste.', 422)
            total = entrada.valor_total
        if not excluir and itens and not any(i.quantidade for i in entrada.itens):
            raise ApiError('VENDA_SEM_ITENS', 'Mantenha um item ou exclua a venda.', 422)
        if membro:
            anterior = sum((_efeito(m) for m in movimentos), Decimal('0'))
            novo_efeito = Decimal('0') if excluir else total * (1 if venda.tipo_venda == 'fiado' else -1)
            _saldo(membro, novo_efeito - anterior)
        for movimento in movimentos:
            if excluir:
                db.delete(movimento)
            else:
                movimento.valor = total
                movimento.versao += 1
        if excluir:
            if venda.id_externo:
                db.add(OperacaoExcluida(id_externo=venda.id_externo))
            db.delete(venda)
        else:
            venda.valor_total = total
            venda.metodo_pagamento = entrada.metodo_pagamento
            venda.nome_cliente = entrada.nome_cliente
            venda.observacoes = entrada.observacoes
            venda.versao += 1
            venda.payload_hash = None  # Reenvio antigo recebe conflito, nunca ACK de conteúdo alterado.
        db.flush()
        if caixa and caixa.status == 'fechado' and caixa.fechamento_calculado:
            recebimentos = db.query(func.coalesce(func.sum(Venda.valor_total), 0)).filter(
                Venda.caixa_id == caixa.id, Venda.metodo_pagamento == 'dinheiro',
                Venda.tipo_venda.in_(['normal', 'recebimento_divida'])).scalar()
            caixa.valor_fechamento = Decimal(caixa.valor_abertura) + recebimentos
        return {'status': 'ok', 'mensagem': 'Venda excluída.' if excluir else 'Venda atualizada; estoque e valores recalculados.'}


def alterar_movimento(db, membro_id, movimento_id, dados, excluir=False):
    entrada = (VersaoPayload if excluir else MovimentoEdicao).model_validate(dados)
    with unit_of_work(db):
        membro = db.query(Membro).filter_by(id=membro_id).populate_existing().with_for_update().first()
        movimento = db.query(MovimentacaoMembro).filter_by(id=movimento_id, membro_id=membro_id).populate_existing().with_for_update().first()
        if not membro or not movimento:
            raise ApiError('MOVIMENTO_NAO_ENCONTRADO', 'Movimentação não encontrada.', 404)
        if movimento.venda_id:
            raise ApiError('MOVIMENTO_VINCULADO', 'Edite ou exclua a venda vinculada para recalcular todos os valores.', 409)
        conferir_versao(movimento, entrada.versao)
        anterior = _efeito(movimento)
        novo = Decimal('0') if excluir else entrada.valor * (1 if entrada.tipo == 'debito' else -1)
        _saldo(membro, novo - anterior)
        if excluir:
            db.delete(movimento)
        else:
            movimento.valor = entrada.valor
            movimento.tipo_movimentacao = entrada.tipo
            movimento.descricao = entrada.descricao
            movimento.versao += 1
        return {'status': 'ok', 'mensagem': 'Movimentação excluída.' if excluir else 'Movimentação atualizada.'}
