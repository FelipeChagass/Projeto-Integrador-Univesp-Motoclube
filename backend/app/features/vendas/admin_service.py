"""Edição/exclusão atômica: caixa → venda → membro → produtos em ordem crescente.

A chave externa é bloqueada antes dessas linhas, como no registro original.
Valores contados no fechamento são preservados; fechamentos calculados são refeitos.
Produtos incluídos na edição baixam o estoque como uma venda nova; trocar um produto é
zerar o item antigo (que volta ao estoque) e incluir o novo.
"""
from decimal import Decimal, ROUND_HALF_UP
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.core.database import unit_of_work
from app.core.errors import ApiError
from app.core.financeiro import VersaoPayload, aplicar_delta_saldo, conferir_versao, efeito_no_saldo
from app.core.locks import bloquear_id_externo
from app.core.schemas import Dinheiro
from app.features.caixa.service import calcular_fechamento
from app.features.membros.admin_service import alterar_movimento  # noqa: F401 (compatibilidade de import)
from app.features.produtos.combos import composicoes
from app.models import Caixa, Membro, MovimentacaoMembro, Produto, Venda
from app.models.venda import ItemVenda, ItemVendaComponente, OperacaoExcluida


class ItemEdicao(BaseModel):
    model_config = ConfigDict(extra='forbid')
    id: UUID
    quantidade: int = Field(ge=0, le=100000, strict=True)
    preco_unitario: Dinheiro
    observacoes: str = Field(default='', max_length=1000)


class ItemNovo(BaseModel):
    model_config = ConfigDict(extra='forbid')
    produto_id: int = Field(gt=0, strict=True)
    quantidade: int = Field(gt=0, le=100000, strict=True)
    preco_unitario: Dinheiro | None = None  # Ausente: preço atual do cadastro.
    observacoes: str = Field(default='', max_length=1000)


class VendaEdicao(VersaoPayload):
    itens: list[ItemEdicao] = Field(default_factory=list, max_length=500)
    novos_itens: list[ItemNovo] = Field(default_factory=list, max_length=200)
    valor_total: Dinheiro | None = None
    metodo_pagamento: Literal['dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'fiado', 'ajuste']
    nome_cliente: str = Field(default='', max_length=200)
    observacoes: str = Field(default='', max_length=2000)


def _bloquear_registros(db, venda_id, versao):
    """Bloqueia chave externa → caixa → venda → membro → movimentações, nesta ordem."""
    original = db.get(Venda, venda_id)
    if not original:
        raise ApiError('VENDA_NAO_ENCONTRADA', 'Venda não encontrada.', 404)
    if original.id_externo:
        bloquear_id_externo(db, original.id_externo)
    caixa = db.query(Caixa).filter_by(id=original.caixa_id).populate_existing().with_for_update().first() if original.caixa_id else None
    venda = db.query(Venda).filter_by(id=venda_id).populate_existing().with_for_update().first()
    if not venda:
        raise ApiError('VENDA_NAO_ENCONTRADA', 'Venda já excluída.', 404)
    conferir_versao(venda, versao)
    membro = db.query(Membro).filter_by(id=venda.membro_id).populate_existing().with_for_update().first() if venda.membro_id else None
    movimentos = db.query(MovimentacaoMembro).filter_by(venda_id=venda.id).populate_existing().with_for_update().all()
    return caixa, venda, membro, movimentos


def _validar_vinculos(venda, membro, movimentos):
    if any(m.membro_id != venda.membro_id for m in movimentos):
        raise ApiError('VINCULO_INCONSISTENTE', 'Venda com vínculos de membros inconsistentes.', 409)
    if venda.tipo_venda in ('fiado', 'recebimento_divida') and (not membro or len(movimentos) != 1):
        raise ApiError('VINCULO_INCONSISTENTE', 'Venda sem uma movimentação financeira correspondente.', 409)
    if movimentos:
        tipo_esperado = 'debito' if venda.tipo_venda == 'fiado' else 'credito' if venda.tipo_venda == 'recebimento_divida' else None
        if any(m.tipo_movimentacao != tipo_esperado or m.valor != venda.valor_total for m in movimentos):
            raise ApiError('VINCULO_INCONSISTENTE', 'Movimentação diverge da venda; reconcilie antes de alterar.', 409)


def _destinos_estoque(item):
    """Combo devolve aos itens fotografados na venda; produto avulso devolve a si mesmo."""
    if item.componentes:
        return [(c.produto_id, c.quantidade) for c in item.componentes]
    return [(item.produto_id, 1)]


def _bloquear_produtos(db, venda, incluidos=()):
    """Recarrega os itens e bloqueia em ID crescente os produtos cujo estoque eles movem.

    Os produtos incluídos e os itens dos combos incluídos entram no mesmo lote; a
    composição é relida após o lock do combo, como no registro da venda.
    """
    db.expire(venda, ['itens'])
    itens = list(venda.itens)
    ids_incluidos = {novo.produto_id for novo in incluidos}
    previstas = composicoes(db, ids_incluidos)
    ids = ({pid for item in itens for pid, _ in _destinos_estoque(item) if pid} | ids_incluidos
           | {pid for receita in previstas.values() for pid in receita})
    produtos = {p.id: p for p in db.query(Produto).filter(Produto.id.in_(ids)).order_by(Produto.id).populate_existing().with_for_update().all()}
    receitas = composicoes(db, ids_incluidos)
    if any(pid not in produtos for receita in receitas.values() for pid in receita):
        raise ApiError('COMBO_ALTERADO', 'Combo alterado durante a edição; tente novamente.', 409, retryable=True)
    return itens, produtos, receitas


def _receita(produto, receitas):
    """Unidades de estoque por unidade vendida: os itens do combo ou o próprio produto."""
    return receitas.get(produto.id, {}) if produto.tem_categoria_combo() else {produto.id: 1}


def _validar_incluidos(incluidos, produtos, receitas):
    for novo in incluidos:
        produto = produtos.get(novo.produto_id)
        if not produto:
            raise ApiError('PRODUTO_NAO_ENCONTRADO', 'Produto não encontrado.', 404, {'produto_id': novo.produto_id})
        if not produto.ativo:
            raise ApiError('PRODUTO_INATIVO', f'"{produto.nome}" está desativado.', 409, {'produto_id': produto.id})
        receita = _receita(produto, receitas)
        if not receita:
            raise ApiError('COMBO_SEM_ITENS', 'Combo sem itens cadastrados.', 409, {'produto_id': produto.id})
        for pid in receita:
            if not produtos[pid].ativo:
                raise ApiError('PRODUTO_INATIVO', f'Item do combo inativo: {produtos[pid].nome}.', 409, {'produto_id': pid})


def _validar_edicao(venda, itens, novos, entrada):
    if len(novos) != len(entrada.itens) or set(novos) != {i.id for i in itens}:
        raise ApiError('ITENS_INVALIDOS', 'Envie cada item da venda uma vez; quantidade zero remove o item.', 422)
    if entrada.novos_itens and not itens:
        raise ApiError('ITENS_INVALIDOS', 'Recebimento e ajuste não têm itens para incluir.', 422)
    metodos = ('fiado',) if venda.tipo_venda == 'fiado' else ('ajuste',) if venda.tipo_venda == 'ajuste' else ('dinheiro', 'pix', 'cartao_credito', 'cartao_debito')
    if entrada.metodo_pagamento not in metodos:
        raise ApiError('METODO_INVALIDO', 'Método incompatível com o tipo da venda.', 422)


def _aplicar_estoque(itens, novos, produtos, incluidos=(), receitas=None):
    """Devolve ao bar a diferença líquida por produto; item ausente em novos volta inteiro.

    Os incluídos entram na mesma conta: trocar um produto por outro que ele mesmo libera
    não falta estoque.
    """
    deltas = {}
    for novo in incluidos:
        for produto_id, fator in _receita(produtos[novo.produto_id], receitas or {}).items():
            deltas[produto_id] = deltas.get(produto_id, 0) - novo.quantidade * fator
    for item in itens:
        novo = novos.get(item.id)
        delta = item.quantidade - (novo.quantidade if novo else 0)
        for produto_id, fator in _destinos_estoque(item):
            if delta and produto_id not in produtos:
                raise ApiError('PRODUTO_AUSENTE', 'Produto histórico ausente; não é possível reconciliar seu estoque.', 409)
            if produto_id in produtos:
                deltas[produto_id] = deltas.get(produto_id, 0) + delta * fator
    for produto_id, delta in deltas.items():
        produto = produtos[produto_id]
        if produto.estoque_bar + delta < 0:
            raise ApiError('ESTOQUE_INSUFICIENTE', f'Estoque insuficiente no bar: {produto.nome}.', 409,
                           {'produto_id': produto.id, 'disponivel': produto.estoque_bar, 'solicitado': -delta})
        produto.estoque_bar += delta


def _incluir_itens(venda, incluidos, produtos, receitas):
    """Cria os itens incluídos, com a composição do combo fotografada; devolve a soma deles."""
    total = Decimal('0')
    for novo in incluidos:
        produto = produtos[novo.produto_id]
        preco = (novo.preco_unitario if novo.preco_unitario is not None
                 else Decimal(produto.preco_atual).quantize(Decimal('.01'), rounding=ROUND_HALF_UP))
        componentes = sorted(receitas.get(produto.id, {}).items()) if produto.tem_categoria_combo() else []
        item = ItemVenda(produto_id=produto.id, nome_produto=produto.nome, quantidade=novo.quantidade,
                         preco_unitario=preco, preco_total=preco * novo.quantidade, observacoes=novo.observacoes,
                         componentes=[ItemVendaComponente(produto_id=pid, quantidade=fator) for pid, fator in componentes])
        venda.itens.append(item)
        total += item.preco_total
    return total


def _aplicar_itens(venda, itens, novos, entrada, produtos, receitas):
    """Aplica a edição aos itens (quantidade zero remove), inclui os novos e devolve o total da venda."""
    total = _incluir_itens(venda, entrada.novos_itens, produtos, receitas)
    for item in itens:
        novo = novos.get(item.id)
        quantidade = novo.quantidade if novo else 0
        if quantidade == 0:
            venda.itens.remove(item)
        else:
            item.quantidade = quantidade
            item.preco_unitario = novo.preco_unitario
            item.preco_total = novo.preco_unitario * quantidade
            item.observacoes = novo.observacoes
            total += item.preco_total
    if not itens:
        if entrada.valor_total is None:
            raise ApiError('VALOR_OBRIGATORIO', 'Informe o valor do recebimento ou ajuste.', 422)
        total = entrada.valor_total
    if itens and not entrada.novos_itens and not any(i.quantidade for i in entrada.itens):
        raise ApiError('VENDA_SEM_ITENS', 'Mantenha um item ou exclua a venda.', 422)
    return total


def _aplicar_saldo_membro(db, venda, membro, movimentos, total, excluir):
    """Substitui o efeito antigo da venda no saldo pelo novo e atualiza as movimentações vinculadas."""
    if membro:
        anterior = sum((efeito_no_saldo(m) for m in movimentos), Decimal('0'))
        novo_efeito = Decimal('0') if excluir else total * (1 if venda.tipo_venda == 'fiado' else -1)
        aplicar_delta_saldo(membro, novo_efeito - anterior)
    for movimento in movimentos:
        if excluir:
            db.delete(movimento)
        else:
            movimento.valor = total
            movimento.versao += 1


def _gravar_venda(db, venda, entrada, total, excluir):
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


def _refazer_fechamento_caixa(db, caixa):
    """Fechamento contado pelo operador é preservado; o calculado é refeito."""
    if caixa and caixa.status == 'fechado' and caixa.fechamento_calculado:
        caixa.valor_fechamento = calcular_fechamento(db, caixa)


def alterar_venda(db, venda_id, dados, excluir=False):
    entrada = (VersaoPayload if excluir else VendaEdicao).model_validate(dados)
    with unit_of_work(db):
        caixa, venda, membro, movimentos = _bloquear_registros(db, venda_id, entrada.versao)
        _validar_vinculos(venda, membro, movimentos)
        incluidos = () if excluir else entrada.novos_itens
        itens, produtos, receitas = _bloquear_produtos(db, venda, incluidos)
        novos = {} if excluir else {i.id: i for i in entrada.itens}
        if not excluir:
            _validar_edicao(venda, itens, novos, entrada)
            _validar_incluidos(incluidos, produtos, receitas)
        _aplicar_estoque(itens, novos, produtos, incluidos, receitas)
        total = Decimal('0') if excluir else _aplicar_itens(venda, itens, novos, entrada, produtos, receitas)
        _aplicar_saldo_membro(db, venda, membro, movimentos, total, excluir)
        _gravar_venda(db, venda, entrada, total, excluir)
        db.flush()
        _refazer_fechamento_caixa(db, caixa)
        return {'status': 'ok', 'mensagem': 'Venda excluída.' if excluir else 'Venda atualizada; estoque e valores recalculados.'}
