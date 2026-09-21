from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from threading import Barrier
from uuid import uuid4

import pytest
from sqlalchemy import event
from sqlalchemy.exc import IntegrityError

from app.core.errors import ApiError
from app.core.database import unit_of_work
from app.models import Caixa, ItemVenda, Membro, MovimentacaoMembro, Produto, Venda
from app.features.vendas.schemas import VendaNormalPayload
from app.features.vendas.schemas import PagamentoDividaPayload
from app.features.caixa.service import abrir_caixa, fechar_caixa, obter_caixa_aberto
from app.features.vendas.service import processar_venda, registrar_pagamento_divida
from app.features.relatorios.service import gerar_relatorio

pytestmark = pytest.mark.postgres


def sale(seed, index=0, **kwargs):
    data = dict(id_externo=str(uuid4()), usuario_id=seed['users'][index], caixa_id=seed['boxes'][index],
                metodo='dinheiro', itens=[{'id': seed['product'], 'qtd': 1}])
    data.update(kwargs)
    return VendaNormalPayload.model_validate(data)


def payment(seed, index=0, **kwargs):
    data = dict(id_externo=str(uuid4()), usuario_id=seed['users'][index], caixa_id=seed['boxes'][index],
                membro_id=seed['member'], saldo_esperado='10', metodo='pix')
    data.update(kwargs)
    return PagamentoDividaPayload.model_validate(data)


def concurrent(pg, calls):
    barrier = Barrier(len(calls))
    def execute(call):
        with pg() as db:
            barrier.wait(timeout=10)
            try:
                return call(db)
            except ApiError as error:
                return error.code
    with ThreadPoolExecutor(max_workers=len(calls)) as executor:
        return list(executor.map(execute, calls))


@pytest.mark.concurrency
def test_last_stock_two_independent_cash_registers(pg, seed):
    with pg.begin() as db:
        db.get(Produto, seed['product']).estoque_bar = 1
    a, b = sale(seed, 0), sale(seed, 1)
    result = concurrent(pg, [lambda db: processar_venda(db, a), lambda db: processar_venda(db, b)])
    assert result.count('ESTOQUE_INSUFICIENTE') == 1
    with pg() as db:
        assert db.get(Produto, seed['product']).estoque_bar == 0
        assert db.query(Venda).count() == db.query(ItemVenda).count() == 1


@pytest.mark.concurrency
def test_concurrent_duplicate_and_lost_response(pg, seed):
    payload = sale(seed)
    results = concurrent(pg, [lambda db: processar_venda(db, payload)] * 2)
    assert sorted(r['status'] for r in results) == ['duplicado', 'ok']
    assert results[0]['venda_id'] == results[1]['venda_id']
    with pg() as db:
        fechar_caixa(db, {'usuario_id': seed['users'][0], 'caixa_id': seed['boxes'][0]})
        assert processar_venda(db, payload)['status'] == 'duplicado'
        assert db.get(Produto, seed['product']).estoque_bar == 9
        assert db.query(Venda).count() == 1
        changed = payload.model_copy(update={'cliente': 'Diferente'})
        with pytest.raises(ApiError, match='conteúdo diferente'):
            processar_venda(db, changed)


def test_flush_failure_rolls_back_every_financial_effect(pg, seed):
    def fail_item(mapper, connection, target):
        raise RuntimeError('synthetic item persistence failure')
    event.listen(ItemVenda, 'before_insert', fail_item)
    try:
        with pg() as db, pytest.raises(RuntimeError, match='synthetic'):
            processar_venda(db, sale(seed, metodo='fiado', membro_id=seed['member']))
    finally:
        event.remove(ItemVenda, 'before_insert', fail_item)
    with pg() as db:
        assert db.query(Venda).count() == db.query(ItemVenda).count() == db.query(MovimentacaoMembro).count() == 0
        assert db.get(Produto, seed['product']).estoque_bar == 10
        assert db.get(Membro, seed['member']).saldo_devedor == 0


@pytest.mark.concurrency
def test_two_settlements_cannot_receive_same_debt_twice(pg, seed):
    with pg() as db:
        processar_venda(db, sale(seed, metodo='fiado', membro_id=seed['member']))
    a, b = payment(seed, 0), payment(seed, 1)
    results = concurrent(pg, [lambda db: registrar_pagamento_divida(db, a), lambda db: registrar_pagamento_divida(db, b)])
    assert results.count('SALDO_ALTERADO') == 1
    with pg() as db:
        assert db.get(Membro, seed['member']).saldo_devedor == 0
        assert db.query(Venda).filter_by(tipo_venda='recebimento_divida').count() == 1
        assert db.query(MovimentacaoMembro).count() == 2


@pytest.mark.concurrency
def test_two_fiado_sales_preserve_both_balance_updates(pg, seed):
    a, b = [sale(seed, i, metodo='fiado', membro_id=seed['member']) for i in (0, 1)]
    concurrent(pg, [lambda db: processar_venda(db, a), lambda db: processar_venda(db, b)])
    with pg() as db:
        assert db.get(Membro, seed['member']).saldo_devedor == Decimal('20')
        assert db.get(Produto, seed['product']).estoque_bar == 8
        assert db.query(MovimentacaoMembro).count() == 2


@pytest.mark.concurrency
def test_simultaneous_open_and_close(pg, seed):
    data = {'usuario_id': seed['users'][2], 'valor_abertura': '50.00'}
    results = concurrent(pg, [lambda db: abrir_caixa(db, data)] * 2)
    assert results[0]['caixa_id'] == results[1]['caixa_id']
    close = {'usuario_id': seed['users'][2], 'caixa_id': results[0]['caixa_id']}
    results = concurrent(pg, [lambda db: fechar_caixa(db, close)] * 2)
    assert results.count('CAIXA_FECHADO') == 1
    with pg() as db:
        assert db.query(Caixa).filter_by(usuario_abertura_id=seed['users'][2]).count() == 1


def test_database_partial_unique_guards_bypassing_services(pg, seed):
    with pg() as db, pytest.raises(IntegrityError):
        db.add(Caixa(usuario_abertura_id=seed['users'][0], valor_abertura=0))
        db.commit()


def test_cash_ownership_and_no_fallback(pg, seed):
    with pg() as db:
        assert obter_caixa_aberto(db, seed['users'][2])['caixa'] is None
        for action in [lambda: obter_caixa_aberto(db, seed['users'][0], seed['boxes'][1]),
                       lambda: processar_venda(db, sale(seed, caixa_id=seed['boxes'][1])),
                       lambda: fechar_caixa(db, {'usuario_id': seed['users'][0], 'caixa_id': seed['boxes'][1]})]:
            with pytest.raises(ApiError) as error:
                action()
            assert error.value.status_code == 403
        assert fechar_caixa(db, {'usuario_id': seed['users'][2], 'caixa_id': seed['boxes'][1]})['status'] == 'ok'


def test_known_financial_totals_partial_full_and_bounded_queries(pg, seed):
    with pg() as db:
        for method in ['dinheiro', 'pix', 'cartao_credito', 'cartao_debito']:
            processar_venda(db, sale(seed, metodo=method))
        processar_venda(db, sale(seed, metodo='fiado', membro_id=seed['member']))
        partial = payment(seed, valor='4', metodo='dinheiro')
        registrar_pagamento_divida(db, partial)
        assert registrar_pagamento_divida(db, partial)['status'] == 'duplicado'
        registrar_pagamento_divida(db, payment(seed, saldo_esperado='6', metodo='pix'))
    queries = []
    engine = pg.kw['bind']
    def count(conn, cursor, statement, parameters, context, executemany):
        queries.append(statement)
    event.listen(engine, 'before_cursor_execute', count)
    try:
        with pg() as db:
            result = gerar_relatorio(db, 'TURNO', {'operador_id': seed['users'][0], 'caixa_id': seed['boxes'][0], 'limite': 2})
    finally:
        event.remove(engine, 'before_cursor_execute', count)
    assert result['dinheiro'] == 14
    assert result['pix'] == 16
    assert result['cartao'] == 20
    assert result['vendasFiado'] == result['recebimentoDivida'] == 10
    assert result['totalEntradas'] == 50
    assert result['totalGeral'] == 150
    assert result['historico_truncado'] and len(result['historico']) == 2
    assert len(queries) <= 5


def test_composed_operations_cannot_commit_before_outer_case(pg, seed):
    with pg() as db, pytest.raises(RuntimeError, match='outer case failed'):
        with unit_of_work(db):
            processar_venda(db, sale(seed, metodo='fiado', membro_id=seed['member']))
            raise RuntimeError('outer case failed')
    with pg() as db:
        assert db.query(Venda).count() == 0
        assert db.get(Produto, seed['product']).estoque_bar == 10
        assert db.get(Membro, seed['member']).saldo_devedor == 0


@pytest.mark.concurrency
def test_sale_and_close_are_serialized(pg, seed):
    payload = sale(seed)
    close = {'usuario_id': seed['users'][0], 'caixa_id': seed['boxes'][0]}
    results = concurrent(pg, [lambda db: processar_venda(db, payload), lambda db: fechar_caixa(db, close)])
    with pg() as db:
        box = db.get(Caixa, seed['boxes'][0])
        assert box.status == 'fechado'
        sold = db.query(Venda).count()
        assert sold == (0 if results[0] == 'CAIXA_FECHADO' else 1)
        assert box.valor_fechamento == 100 + sold * 10
        assert db.get(Produto, seed['product']).estoque_bar == 10 - sold
