"""Combos: cadastro só com itens do estoque, venda baixando cada item e estorno pela fotografia."""
from uuid import UUID

import pytest

from app.core.errors import ApiError
from app.models import ComboItem, ItemVendaComponente, Produto, Venda
from app.features.produtos.combos import atualizar_itens_combo, criar_combo
from app.features.produtos.service import atualizar_estoque, deletar_produto, editar_produto, listar_produtos
from app.features.vendas.admin_service import alterar_venda
from app.features.vendas.service import processar_venda
from test_finance_postgres import sale, concurrent
from test_auth_postgres import client, headers  # noqa: F401 (fixture)

pytestmark = pytest.mark.postgres


@pytest.fixture
def combo(pg, seed):
    """Água (seed, bar 10) + Porção (bar 4): combo leva 2 águas e 1 porção."""
    with pg() as db:
        porcao = Produto(nome='Porção', preco_atual='30.00', categoria='comida', estoque_bar=4, estoque_deposito=0)
        db.add(porcao)
        db.commit()
        criado = criar_combo(db, {'nome': 'Combo da estrada', 'preco_atual': '40.00',
                                  'itens': [{'produto_id': seed['product'], 'quantidade': 2},
                                            {'produto_id': porcao.id, 'quantidade': 1}]})
        db.commit()
    return {'id': criado['produto']['id'], 'agua': seed['product'], 'porcao': porcao.id}


def estoque(db, produto_id):
    db.expire_all()
    return db.get(Produto, produto_id).estoque_bar


def test_combo_lists_derived_stock_and_composition(pg, combo):
    with pg() as db:
        item = next(p for p in listar_produtos(db) if p['id'] == combo['id'])
    assert item['categoria'] == 'combo'
    assert item['estoque_bar'] == 4  # min(10 // 2, 4 // 1)
    assert [(i['produto_id'], i['quantidade']) for i in item['itens_combo']] == [
        (combo['agua'], 2), (combo['porcao'], 1)]


def test_sale_consumes_every_item_and_snapshots_composition(pg, seed, combo):
    with pg() as db:
        resultado = processar_venda(db, sale(seed, itens=[{'id': combo['id'], 'qtd': 2},
                                                          {'id': combo['agua'], 'qtd': 1}]))
        assert resultado['total_calculado'] == 90.0  # 2 x 40 + 1 x 10
        assert estoque(db, combo['agua']) == 10 - 4 - 1
        assert estoque(db, combo['porcao']) == 4 - 2
        assert estoque(db, combo['id']) == 0
        venda = db.get(Venda, UUID(resultado['venda_id']))
        item_combo = next(i for i in venda.itens if i.produto_id == combo['id'])
        assert sorted((c.produto_id, c.quantidade) for c in item_combo.componentes) == [
            (combo['agua'], 2), (combo['porcao'], 1)]


def test_combo_and_loose_items_share_component_stock(pg, seed, combo):
    with pg() as db:
        # 3 combos pedem 6 águas; com mais 5 avulsas passa das 10 do bar.
        with pytest.raises(ApiError) as erro:
            processar_venda(db, sale(seed, itens=[{'id': combo['id'], 'qtd': 3}, {'id': combo['agua'], 'qtd': 5}]))
        assert erro.value.code == 'ESTOQUE_INSUFICIENTE'
        assert erro.value.details['produto_id'] == combo['agua']
        db.rollback()
        assert estoque(db, combo['agua']) == 10 and estoque(db, combo['porcao']) == 4


def test_inactive_item_blocks_combo_sale_but_combo_stays_active(pg, seed, combo):
    with pg() as db:
        editar_produto(db, {'produto_id': combo['porcao'], 'ativo': False})
        db.commit()
        with pytest.raises(ApiError) as erro:
            processar_venda(db, sale(seed, itens=[{'id': combo['id'], 'qtd': 1}]))
        assert erro.value.code == 'PRODUTO_INATIVO'
        db.rollback()
        assert db.get(Produto, combo['id']).ativo is True


def test_admin_deactivates_combo_and_sale_is_refused(pg, seed, combo):
    with pg() as db:
        editar_produto(db, {'produto_id': combo['id'], 'ativo': False})
        db.commit()
        assert combo['id'] not in {p['id'] for p in listar_produtos(db)}
        with pytest.raises(ApiError) as erro:
            processar_venda(db, sale(seed, itens=[{'id': combo['id'], 'qtd': 1}]))
        assert erro.value.code == 'PRODUTO_INATIVO'


def test_edit_and_delete_return_stock_to_items_sold_even_after_composition_changes(pg, seed, combo):
    with pg() as db:
        venda_id = UUID(processar_venda(db, sale(seed, itens=[{'id': combo['id'], 'qtd': 2}]))['venda_id'])
        atualizar_itens_combo(db, combo['id'], {'itens': [{'produto_id': combo['agua'], 'quantidade': 3}]})
        db.commit()
        venda = db.get(Venda, venda_id)
        item = venda.itens[0]
        alterar_venda(db, venda_id, {'versao': venda.versao, 'metodo_pagamento': 'dinheiro',
                                     'itens': [{'id': str(item.id), 'quantidade': 1, 'preco_unitario': '40.00'}]})
        db.commit()
        assert estoque(db, combo['agua']) == 10 - 4 + 2
        assert estoque(db, combo['porcao']) == 4 - 2 + 1
        alterar_venda(db, venda_id, {'versao': db.get(Venda, venda_id).versao}, excluir=True)
        db.commit()
        assert estoque(db, combo['agua']) == 10 and estoque(db, combo['porcao']) == 4
        assert db.query(ItemVendaComponente).count() == 0


@pytest.mark.parametrize(('itens', 'codigo'), [
    ([{'produto_id': 999999, 'quantidade': 2}], 'PRODUTO_NAO_ENCONTRADO'),
    ('combo', 'COMBO_ANINHADO'),
])
def test_combo_items_must_exist_in_stock_and_not_be_combos(pg, combo, itens, codigo):
    if itens == 'combo':
        itens = [{'produto_id': combo['id'], 'quantidade': 1}, {'produto_id': combo['agua'], 'quantidade': 1}]
    with pg() as db:
        with pytest.raises(ApiError) as erro:
            criar_combo(db, {'nome': 'Inválido', 'preco_atual': '10.00', 'itens': itens})
        assert erro.value.code == codigo


def test_combo_needs_two_or_more_units_and_unique_items(pg, combo):
    from pydantic import ValidationError
    with pg() as db:
        for itens in ([{'produto_id': combo['agua'], 'quantidade': 1}],
                      [{'produto_id': combo['agua'], 'quantidade': 1}, {'produto_id': combo['agua'], 'quantidade': 1}]):
            with pytest.raises(ValidationError):
                criar_combo(db, {'nome': 'Curto', 'preco_atual': '10.00', 'itens': itens})


def test_combo_has_no_own_stock_or_category_switch(pg, seed, combo):
    with pg() as db:
        with pytest.raises(ApiError) as erro:
            atualizar_estoque(db, {'produto_id': combo['id'], 'usuario_id': seed['users'][2], 'delta_bar': 1},
                              exigir_senha=False)
        assert erro.value.code == 'COMBO_SEM_ESTOQUE'
        db.rollback()
        for produto_id, categoria in ((combo['id'], 'bebida'), (combo['agua'], 'combo')):
            with pytest.raises(ApiError) as erro:
                editar_produto(db, {'produto_id': produto_id, 'categoria': categoria})
            assert erro.value.code == 'CATEGORIA_COMBO'
            db.rollback()


def test_delete_guards_items_in_combos_and_combos_with_sales(pg, seed, combo):
    with pg() as db:
        with pytest.raises(ApiError) as erro:
            deletar_produto(db, combo['porcao'])
        assert erro.value.code == 'PRODUTO_EM_COMBO'
        db.rollback()
        processar_venda(db, sale(seed, itens=[{'id': combo['id'], 'qtd': 1}]))
        db.commit()
        with pytest.raises(ApiError) as erro:
            deletar_produto(db, combo['id'])
        assert erro.value.code == 'COMBO_COM_VENDAS'


def test_unsold_combo_delete_removes_composition_only(pg, combo):
    with pg() as db:
        deletar_produto(db, combo['id'])
        db.commit()
        assert db.query(ComboItem).count() == 0
        assert estoque(db, combo['agua']) == 10


@pytest.mark.concurrency
def test_last_combo_between_two_cash_registers(pg, seed, combo):
    with pg() as db:
        editar_produto(db, {'produto_id': combo['porcao'], 'ativo': True})
        db.get(Produto, combo['porcao']).estoque_bar = 1
        db.commit()
    resultados = concurrent(pg, [
        lambda db: processar_venda(db, sale(seed, 0, itens=[{'id': combo['id'], 'qtd': 1}]))['status'],
        lambda db: processar_venda(db, sale(seed, 1, itens=[{'id': combo['id'], 'qtd': 1}]))['status'],
    ])
    assert sorted(resultados) == ['ESTOQUE_INSUFICIENTE', 'ok']
    with pg() as db:
        assert estoque(db, combo['porcao']) == 0 and estoque(db, combo['agua']) == 8


def test_admin_routes_create_and_replace_combo_items(seed, client, combo):
    admin = headers(seed['users'][2])
    criado = client.post('/api/admin/combos', headers=admin, json={
        'nome': 'Balde', 'preco_atual': '45.00', 'itens': [{'produto_id': combo['agua'], 'quantidade': 5}]})
    assert criado.status_code == 201 and criado.get_json()['produto']['estoque_bar'] == 2
    combo_id = criado.get_json()['produto']['id']
    trocado = client.put(f'/api/admin/combos/{combo_id}/itens', headers=admin,
                         json={'itens': [{'produto_id': combo['porcao'], 'quantidade': 2}]})
    assert trocado.status_code == 200 and trocado.get_json()['produto']['estoque_bar'] == 2
    operador = headers(seed['users'][0])
    assert client.post('/api/admin/combos', headers=operador, json={}).status_code == 403
    assert client.put(f"/api/admin/combos/{combo['agua']}/itens", headers=admin,
                      json={'itens': [{'produto_id': combo['porcao'], 'quantidade': 2}]}).status_code == 409
