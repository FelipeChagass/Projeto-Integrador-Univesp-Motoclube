"""Operações financeiras atômicas e idempotentes.

Ordem global de locks: chave externa PostgreSQL → caixa → membro → produtos
em ID crescente. A confirmação somente chega ao chamador após o commit.
"""
import hashlib
import json
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import unit_of_work
from app.core.errors import ApiError
from app.models.membro import Membro
from app.models.movimentacao_membro import MovimentacaoMembro
from app.models.produto import Produto
from app.models.venda import ItemVenda, Venda, OperacaoExcluida
from app.features.vendas.schemas import PagamentoDividaPayload
from app.features.vendas.schemas import VendaNormalPayload
from app.features.caixa.service import bloquear_caixa_autorizado


def _assinatura(dados, tipo: str) -> str:
    conteudo = {
        'usuario_id': str(dados.usuario_id), 'caixa_id': str(dados.caixa_id),
        'membro_id': str(dados.membro_id) if dados.membro_id else None,
        'tipo': tipo, 'metodo': dados.metodo,
    }
    if tipo == 'recebimento_divida':
        conteudo.update(valor=str(dados.valor.quantize(Decimal('.01'))) if dados.valor is not None else None,
                        saldo_esperado=str(dados.saldo_esperado.quantize(Decimal('.01'))))
    else:
        # Nome/preço enviados pelo cliente não são autoridade; obs e quantidade são.
        conteudo['cliente'] = dados.cliente
        itens = {}
        for item in dados.itens:
            chave = (item.id, item.obs)
            itens[chave] = itens.get(chave, 0) + item.qtd
        conteudo['itens'] = [[pid, obs, qtd] for (pid, obs), qtd in sorted(itens.items())]
    serializado = json.dumps(conteudo, sort_keys=True, separators=(',', ':'), ensure_ascii=False)
    return hashlib.sha256(serializado.encode('utf-8')).hexdigest()


def _confirmacao(venda: Venda, status='ok') -> dict:
    resposta = {
        'status': status, 'id_externo': venda.id_externo, 'venda_id': str(venda.id),
        'caixa_id': str(venda.caixa_id), 'usuario_id': str(venda.usuario_id),
        'total_calculado': float(venda.valor_total),
        'mensagem': 'Operação confirmada.' if status == 'ok' else 'Operação já confirmada.',
    }
    if venda.tipo_venda == 'recebimento_divida':
        resposta['valor_pago'] = float(venda.valor_total)
    return resposta


def _operacao_existente(db, dados, assinatura):
    # Lock no servidor, compartilhado entre workers. Colisões somente serializam.
    chave = int.from_bytes(hashlib.sha256(dados.id_externo.encode()).digest()[:8], 'big', signed=True)
    db.execute(text('SELECT pg_advisory_xact_lock(:chave)'), {'chave': chave})
    if db.get(OperacaoExcluida, dados.id_externo):
        raise ApiError('OPERACAO_EXCLUIDA', 'Operação excluída pelo administrador; não pode ser reenviada.', 409)
    existente = db.query(Venda).filter_by(id_externo=dados.id_externo).first()
    if existente:
        if (str(existente.usuario_id) != str(dados.usuario_id)
                or str(existente.caixa_id) != str(dados.caixa_id)
                or existente.payload_hash != assinatura):
            # Históricos sem fingerprint não podem receber ACK cego.
            raise ApiError('IDEMPOTENCIA_CONFLITO',
                           'Identificador já utilizado com conteúdo diferente ou histórico a reconciliar.', 409)
        return _confirmacao(existente, 'duplicado')
    return None


def _bloquear_membro(db, membro_id):
    membro = db.query(Membro).filter_by(id=membro_id).populate_existing().with_for_update().first()
    if not membro:
        raise ApiError('MEMBRO_NAO_ENCONTRADO', 'Membro não encontrado.', 404)
    if not membro.ativo:
        raise ApiError('MEMBRO_INATIVO', 'Membro inativo.', 409)
    return membro


def _criar_venda(db: Session, dados: VendaNormalPayload) -> dict:
    tipo = 'fiado' if dados.metodo == 'fiado' else 'normal'
    assinatura = _assinatura(dados, tipo)
    with unit_of_work(db):
        duplicado = _operacao_existente(db, dados, assinatura)
        if duplicado:
            return duplicado
        bloquear_caixa_autorizado(db, dados.caixa_id, dados.usuario_id)
        membro = _bloquear_membro(db, dados.membro_id) if tipo == 'fiado' else None
        quantidades = {}
        for item in dados.itens:
            quantidades[item.id] = quantidades.get(item.id, 0) + item.qtd
        produtos = db.query(Produto).filter(Produto.id.in_(quantidades)).order_by(
            Produto.id).populate_existing().with_for_update().all()
        por_id = {p.id: p for p in produtos}
        for pid, qtd in quantidades.items():
            produto = por_id.get(pid)
            if not produto:
                raise ApiError('PRODUTO_NAO_ENCONTRADO', 'Produto não encontrado.', 404, {'produto_id': pid})
            if not produto.ativo:
                raise ApiError('PRODUTO_INATIVO', 'Produto inativo.', 409, {'produto_id': pid})
            if produto.estoque_bar < qtd:
                raise ApiError('ESTOQUE_INSUFICIENTE', 'Estoque insuficiente.', 409,
                               {'produto_id': pid, 'disponivel': produto.estoque_bar, 'solicitado': qtd})
        precos = {pid: Decimal(p.preco_atual).quantize(Decimal('.01'), rounding=ROUND_HALF_UP)
                  for pid, p in por_id.items()}
        total = sum((precos[pid] * qtd for pid, qtd in quantidades.items()), Decimal('0.00'))
        venda = Venda(id_externo=dados.id_externo, payload_hash=assinatura,
                      usuario_id=dados.usuario_id, caixa_id=dados.caixa_id,
                      membro_id=membro.id if membro else None, tipo_venda=tipo,
                      metodo_pagamento=dados.metodo, nome_cliente=membro.nome if membro else dados.cliente,
                      valor_total=total)
        db.add(venda)
        db.flush()
        for item in dados.itens:
            db.add(ItemVenda(venda_id=venda.id, produto_id=item.id, nome_produto=por_id[item.id].nome,
                             quantidade=item.qtd, preco_unitario=precos[item.id],
                             preco_total=precos[item.id] * item.qtd, observacoes=item.obs))
        for pid, qtd in quantidades.items():
            por_id[pid].estoque_bar -= qtd
        if membro:
            membro.saldo_devedor += total
            db.add(MovimentacaoMembro(membro_id=membro.id, venda_id=venda.id,
                                     usuario_id=dados.usuario_id, tipo_movimentacao='debito',
                                     origem='venda_fiado', descricao='Venda fiado', valor=total))
        db.flush()
        return _confirmacao(venda)


def criar_venda_normal(db: Session, dados: VendaNormalPayload) -> dict:
    return _criar_venda(db, dados)


def criar_venda_fiado(db: Session, dados: VendaNormalPayload) -> dict:
    if dados.metodo != 'fiado':
        raise ApiError('METODO_INVALIDO', 'Venda fiada exige método fiado.', 422)
    return _criar_venda(db, dados)


def processar_venda(db: Session, dados: VendaNormalPayload) -> dict:
    return _criar_venda(db, dados)


def registrar_pagamento_divida(db: Session, dados: PagamentoDividaPayload) -> dict:
    assinatura = _assinatura(dados, 'recebimento_divida')
    with unit_of_work(db):
        duplicado = _operacao_existente(db, dados, assinatura)
        if duplicado:
            return duplicado
        bloquear_caixa_autorizado(db, dados.caixa_id, dados.usuario_id)
        membro = _bloquear_membro(db, dados.membro_id)
        saldo = Decimal(membro.saldo_devedor)
        if saldo != dados.saldo_esperado:
            raise ApiError('SALDO_ALTERADO', 'Saldo mudou; atualize o extrato antes de confirmar.', 409,
                           {'saldo_atual': float(saldo)})
        valor = dados.valor if dados.valor is not None else saldo
        if valor <= 0:
            raise ApiError('SEM_DIVIDA', 'Membro não possui dívida pendente.', 409)
        if valor > saldo:
            raise ApiError('PAGAMENTO_EXCEDE_SALDO', 'Pagamento maior que a dívida atual.', 409)
        venda = Venda(id_externo=dados.id_externo, payload_hash=assinatura,
                      caixa_id=dados.caixa_id, usuario_id=dados.usuario_id, membro_id=membro.id,
                      tipo_venda='recebimento_divida', metodo_pagamento=dados.metodo,
                      nome_cliente=membro.nome, valor_total=valor, observacoes='Recebimento de dívida')
        db.add(venda)
        db.flush()
        db.add(MovimentacaoMembro(membro_id=membro.id, venda_id=venda.id,
                                 usuario_id=dados.usuario_id, tipo_movimentacao='credito',
                                 origem='pagamento', descricao=f'Pagamento via {dados.metodo}', valor=valor))
        membro.saldo_devedor = saldo - valor
        db.flush()
        return _confirmacao(venda)
