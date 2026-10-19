"""Fase 4: caracterização das funções grandes antes e depois de divididas.

Fixam mensagens, códigos, status, efeitos e ordem de locks, que não podem mudar.
"""
import re
from decimal import Decimal
from uuid import UUID, uuid4

import pytest
from sqlalchemy import event, text

from app.core.errors import ApiError
from app.features.vendas.admin_service import alterar_venda
from app.features.vendas.service import processar_venda, registrar_pagamento_divida
from app.models import Caixa, ItemVenda, Membro, MovimentacaoMembro, Produto, Venda
from test_admin_finance_postgres import criar, edicao
from test_finance_postgres import payment, sale

pytestmark = pytest.mark.postgres


def erro(funcao, *args, **kwargs):
    with pytest.raises(ApiError) as capturado:
        funcao(*args, **kwargs)
    return capturado.value.code, capturado.value.status_code, capturado.value.message


class Locks:
    """Registra, em ordem, as tabelas bloqueadas com FOR UPDATE e o advisory lock."""

    def __init__(self, pg):
        self.engine = pg.kw['bind']
        self.ordem = []

    def _registrar(self, conn, cursor, statement, parameters, context, executemany):
        if 'pg_advisory_xact_lock' in statement:
            self.ordem.append('advisory')
        elif 'FOR UPDATE' in statement:
            self.ordem.append(re.search(r'\bFROM (\w+)', statement)[1])

    def __enter__(self):
        event.listen(self.engine, 'before_cursor_execute', self._registrar)
        return self

    def __exit__(self, *exc):
        event.remove(self.engine, 'before_cursor_execute', self._registrar)


# ─── Etapa 14: alterar_venda ───

def test_alterar_venda_inexistente(pg, seed):
    with pg() as db:
        assert erro(alterar_venda, db, uuid4(), {'versao': 1}, excluir=True) == (
            'VENDA_NAO_ENCONTRADA', 404, 'Venda não encontrada.')


def test_alterar_venda_valida_itens_e_metodo(pg, seed):
    with pg() as db:
        id, _ = criar(db, seed)
        dados = edicao(db, id)
        repetido = {**dados, 'itens': dados['itens'] * 2}
        mensagem_itens = ('ITENS_INVALIDOS', 422, 'Envie cada item da venda uma vez; quantidade zero remove o item.')
        assert erro(alterar_venda, db, id, repetido) == mensagem_itens
        assert erro(alterar_venda, db, id, {**dados, 'itens': []}) == mensagem_itens
        mensagem_metodo = ('METODO_INVALIDO', 422, 'Método incompatível com o tipo da venda.')
        assert erro(alterar_venda, db, id, {**dados, 'metodo_pagamento': 'fiado'}) == mensagem_metodo
        # Itens inválidos têm precedência sobre o método.
        assert erro(alterar_venda, db, id, {**repetido, 'metodo_pagamento': 'fiado'}) == mensagem_itens
        assert erro(alterar_venda, db, id, edicao(db, id, quantidade=0)) == (
            'VENDA_SEM_ITENS', 422, 'Mantenha um item ou exclua a venda.')
        fiado, _ = criar(db, seed, metodo='fiado', membro_id=seed['member'])
        assert erro(alterar_venda, db, fiado, edicao(db, fiado, metodo_pagamento='pix')) == mensagem_metodo
        assert db.get(Produto, seed['product']).estoque_bar == 6


def test_alterar_recebimento_exige_valor_e_atualiza_movimento(pg, seed):
    with pg() as db:
        criar(db, seed, metodo='fiado', membro_id=seed['member'])
        recibo = UUID(registrar_pagamento_divida(db, payment(seed, saldo_esperado='20', valor='8'))['venda_id'])
        assert erro(alterar_venda, db, recibo, edicao(db, recibo)) == (
            'VALOR_OBRIGATORIO', 422, 'Informe o valor do recebimento ou ajuste.')
        resultado = alterar_venda(db, recibo, edicao(db, recibo, valor_total='5', metodo_pagamento='dinheiro',
                                                     nome_cliente='Cliente', observacoes='obs'))
        assert resultado == {'status': 'ok', 'mensagem': 'Venda atualizada; estoque e valores recalculados.'}
        venda = db.get(Venda, recibo)
        assert (venda.valor_total, venda.metodo_pagamento, venda.nome_cliente, venda.observacoes, venda.versao,
                venda.payload_hash) == (5, 'dinheiro', 'Cliente', 'obs', 2, None)
        movimento = db.query(MovimentacaoMembro).filter_by(venda_id=recibo).one()
        assert (movimento.valor, movimento.versao) == (5, 2)
        assert db.get(Membro, seed['member']).saldo_devedor == 15


@pytest.mark.parametrize(('cenario', 'mensagem'), [
    ('membro_divergente', 'Venda com vínculos de membros inconsistentes.'),
    ('sem_movimento', 'Venda sem uma movimentação financeira correspondente.'),
    ('valor_divergente', 'Movimentação diverge da venda; reconcilie antes de alterar.'),
    ('tipo_divergente', 'Movimentação diverge da venda; reconcilie antes de alterar.'),
])
def test_alterar_venda_recusa_vinculos_inconsistentes(pg, seed, cenario, mensagem):
    with pg() as db:
        if cenario == 'membro_divergente':
            id, _ = criar(db, seed)
            db.add(MovimentacaoMembro(membro_id=seed['member'], venda_id=id, tipo_movimentacao='debito',
                                      origem='venda_fiado', valor=20))
        else:
            id, _ = criar(db, seed, metodo='fiado', membro_id=seed['member'])
            movimento = db.query(MovimentacaoMembro).filter_by(venda_id=id).one()
            if cenario == 'sem_movimento':
                db.delete(movimento)
            elif cenario == 'valor_divergente':
                movimento.valor = 19
            else:
                movimento.tipo_movimentacao = 'credito'
        db.commit()
        assert erro(alterar_venda, db, id, {'versao': 1}, excluir=True) == ('VINCULO_INCONSISTENTE', 409, mensagem)
        assert db.get(Venda, id) is not None


def test_alterar_venda_com_produto_historico_ausente(pg, seed):
    with pg() as db:
        id, _ = criar(db, seed)
        db.execute(text('UPDATE itens_venda SET produto_id = NULL WHERE venda_id = :id'), {'id': id})
        db.commit()
        assert erro(alterar_venda, db, id, {'versao': 1}, excluir=True) == (
            'PRODUTO_AUSENTE', 409, 'Produto histórico ausente; não é possível reconciliar seu estoque.')
        # Sem variação de quantidade o item sem produto pode ser editado (preço).
        alterar_venda(db, id, edicao(db, id, quantidade=2, preco='7.50'))
        assert db.get(Venda, id).valor_total == 15
        assert db.get(Produto, seed['product']).estoque_bar == 8


def test_alterar_venda_remove_item_zerado_e_recalcula(pg, seed):
    with pg() as db:
        payload = sale(seed, itens=[{'id': seed['product'], 'qtd': 4, 'obs': 'A'},
                                    {'id': seed['product'], 'qtd': 3, 'obs': 'B'}])
        id = UUID(processar_venda(db, payload)['venda_id'])
        dados = edicao(db, id)
        primeiro = db.query(ItemVenda).filter_by(venda_id=id, observacoes='A').one().id
        for item in dados['itens']:
            item.update(quantidade=0 if item['id'] == str(primeiro) else 5, preco_unitario='2.00',
                        observacoes='nova')
        alterar_venda(db, id, dados)
        itens = db.query(ItemVenda).filter_by(venda_id=id).all()
        assert [(i.quantidade, i.preco_unitario, i.preco_total, i.observacoes) for i in itens] == [(5, 2, 10, 'nova')]
        assert db.get(Venda, id).valor_total == 10
        assert db.get(Produto, seed['product']).estoque_bar == 5


def test_excluir_venda_fiada_respeita_ordem_de_locks(pg, seed):
    tabelas = {modelo: modelo.__tablename__ for modelo in (Caixa, Venda, Membro, MovimentacaoMembro, Produto)}
    with pg() as db:
        id, _ = criar(db, seed, metodo='fiado', membro_id=seed['member'])
        with Locks(pg) as locks:
            resultado = alterar_venda(db, id, {'versao': 1}, excluir=True)
        assert resultado == {'status': 'ok', 'mensagem': 'Venda excluída.'}
        assert locks.ordem == ['advisory', tabelas[Caixa], tabelas[Venda], tabelas[Membro],
                               tabelas[MovimentacaoMembro], tabelas[Produto]]
        assert db.get(Membro, seed['member']).saldo_devedor == Decimal('0')
