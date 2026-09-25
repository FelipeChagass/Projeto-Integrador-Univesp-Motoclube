"""Regressões dos efeitos contábeis e de estoque das correções administrativas."""
from decimal import Decimal
from unittest.mock import Mock
from uuid import UUID, uuid4

import pytest
from sqlalchemy import event, text

from app.core.errors import ApiError
from app.models import Caixa, ItemVenda, Membro, MovimentacaoMembro, Produto, Usuario, Venda
from app.features.vendas.admin_service import alterar_venda, alterar_movimento
from app.features.vendas.service import processar_venda, registrar_pagamento_divida
from app.features.caixa.service import fechar_caixa
from app.features.membros.service import ajustar_saldo, excluir_membro
from app.features.produtos.service import deletar_produto
from app.features.usuarios.service import excluir_usuario_admin
from test_finance_postgres import sale, payment, concurrent
from test_auth_postgres import client, headers

pytestmark = pytest.mark.postgres


def criar(db, seed, **kwargs):
    payload = sale(seed, itens=[{'id': seed['product'], 'qtd': 2}], **kwargs)
    resultado = processar_venda(db, payload)
    return UUID(resultado['venda_id']), payload


def edicao(db, id, quantidade=1, preco='10.00', **kwargs):
    v = db.get(Venda, id)
    dados = dict(versao=v.versao, metodo_pagamento=v.metodo_pagamento,
                 nome_cliente=v.nome_cliente or '', observacoes='',
                 itens=[dict(id=str(i.id), quantidade=quantidade, preco_unitario=preco) for i in v.itens])
    dados.update(kwargs)
    return dados


def test_edit_returns_stock_and_recalculates_automatic_closing(pg, seed):
    with pg() as db:
        id, payload = criar(db, seed)
        fechar_caixa(db, {'usuario_id': seed['users'][0], 'caixa_id': seed['boxes'][0]})
        alterar_venda(db, id, edicao(db, id))
        assert db.get(Produto, seed['product']).estoque_bar == 9
        assert db.get(Venda, id).valor_total == 10
        assert db.get(Caixa, seed['boxes'][0]).valor_fechamento == 110
        with pytest.raises(ApiError) as erro:
            processar_venda(db, payload)
        assert erro.value.code == 'IDEMPOTENCIA_CONFLITO'


def test_delete_reverses_stock_cash_and_blocks_offline_replay(pg, seed):
    with pg() as db:
        id, payload = criar(db, seed)
        fechar_caixa(db, {'usuario_id': seed['users'][0], 'caixa_id': seed['boxes'][0]})
        alterar_venda(db, id, {'versao': 1}, excluir=True)
        assert db.get(Venda, id) is None
        assert db.query(ItemVenda).count() == 0
        assert db.get(Produto, seed['product']).estoque_bar == 10
        assert db.get(Caixa, seed['boxes'][0]).valor_fechamento == 100
        with pytest.raises(ApiError) as erro:
            processar_venda(db, payload)
        assert erro.value.code == 'OPERACAO_EXCLUIDA'


def test_fiado_and_receipt_update_and_delete_balance(pg, seed):
    with pg() as db:
        id, _ = criar(db, seed, metodo='fiado', membro_id=seed['member'])
        alterar_venda(db, id, edicao(db, id))
        assert db.get(Membro, seed['member']).saldo_devedor == 10
        recibo = registrar_pagamento_divida(db, payment(seed, valor='5'))
        rid = UUID(recibo['venda_id'])
        alterar_venda(db, rid, edicao(db, rid, valor_total='3'))
        assert db.get(Membro, seed['member']).saldo_devedor == 7
        assert db.get(Produto, seed['product']).estoque_bar == 9
        with pytest.raises(ApiError) as erro:
            alterar_venda(db, id, {'versao': 2}, excluir=True)
        assert erro.value.code == 'SALDO_NEGATIVO'
        assert db.get(Produto, seed['product']).estoque_bar == 9
        alterar_venda(db, rid, {'versao': 2}, excluir=True)
        alterar_venda(db, id, {'versao': 2}, excluir=True)
        assert db.get(Membro, seed['member']).saldo_devedor == 0
        assert db.query(MovimentacaoMembro).count() == 0
        assert db.get(Produto, seed['product']).estoque_bar == 10


def test_insufficient_stock_and_stale_version_change_nothing(pg, seed):
    with pg() as db:
        id, _ = criar(db, seed)
        antigo = edicao(db, id)
        with pytest.raises(ApiError) as erro:
            alterar_venda(db, id, edicao(db, id, quantidade=11))
        assert erro.value.code == 'ESTOQUE_INSUFICIENTE'
        assert db.get(Produto, seed['product']).estoque_bar == 8
        alterar_venda(db, id, antigo)
        with pytest.raises(ApiError) as erro:
            alterar_venda(db, id, antigo)
        assert erro.value.code == 'REGISTRO_ALTERADO'
        assert db.get(Venda, id).valor_total == 10


def test_concurrent_corrections_only_apply_once(pg, seed):
    with pg() as db:
        id, _ = criar(db, seed)
        dados = edicao(db, id)
    resultados = concurrent(pg, [lambda db: alterar_venda(db, id, dados)] * 2)
    assert resultados.count('REGISTRO_ALTERADO') == 1
    with pg() as db:
        assert db.get(Produto, seed['product']).estoque_bar == 9


def test_failure_rolls_back_delete_and_tombstone(pg, seed):
    with pg() as db:
        id, payload = criar(db, seed)
    def falhar(*args):
        raise RuntimeError('falha sintética')
    event.listen(Venda, 'before_delete', falhar)
    try:
        with pg() as db, pytest.raises(RuntimeError):
            alterar_venda(db, id, {'versao': 1}, excluir=True)
    finally:
        event.remove(Venda, 'before_delete', falhar)
    with pg() as db:
        assert db.get(Produto, seed['product']).estoque_bar == 8
        assert processar_venda(db, payload)['status'] == 'duplicado'


def test_manual_movement_and_linked_movement_guard(pg, seed):
    with pg() as db:
        ajustar_saldo(db, seed['member'], 20, 'debito', usuario_id=seed['users'][2])
        mov = db.query(MovimentacaoMembro).one()
        alterar_movimento(db, seed['member'], mov.id, {'versao': 1, 'tipo': 'debito', 'valor': '10'})
        assert db.get(Membro, seed['member']).saldo_devedor == 10
        alterar_movimento(db, seed['member'], mov.id, {'versao': 2}, excluir=True)
        assert db.get(Membro, seed['member']).saldo_devedor == 0
        criar(db, seed, metodo='fiado', membro_id=seed['member'])
        mov = db.query(MovimentacaoMembro).one()
        with pytest.raises(ApiError) as erro:
            alterar_movimento(db, seed['member'], mov.id, {'versao': 1}, excluir=True)
        assert erro.value.code == 'MOVIMENTO_VINCULADO'


def test_measured_closing_is_preserved(pg, seed):
    with pg() as db:
        id, _ = criar(db, seed)
        fechar_caixa(db, {'usuario_id': seed['users'][0], 'caixa_id': seed['boxes'][0], 'valor_fechamento': '119'})
        alterar_venda(db, id, edicao(db, id, metodo_pagamento='pix'))
        assert db.get(Caixa, seed['boxes'][0]).valor_fechamento == 119


def test_hard_delete_catalogs_and_guard_linked_records(pg, seed):
    with pg() as db:
        id, _ = criar(db, seed, metodo='fiado', membro_id=seed['member'])
        with pytest.raises(ApiError):
            deletar_produto(db, seed['product'])
        with pytest.raises(ApiError):
            excluir_membro(db, seed['member'])
        alterar_venda(db, id, {'versao': 1}, excluir=True)
        deletar_produto(db, seed['product'])
        excluir_membro(db, seed['member'])
        assert db.get(Produto, seed['product']) is None
        assert db.get(Membro, seed['member']) is None


def test_user_is_deleted_and_auth_called_only_after_dependency_validation(pg, seed):
    auth = Mock()
    with pg() as db:
        with pytest.raises(ApiError):
            excluir_usuario_admin(db, auth, str(seed['users'][2]), str(seed['users'][0]))
        auth.auth.admin.delete_user.assert_not_called()
        uid = uuid4()
        db.execute(text('INSERT INTO auth.users(id) VALUES (:id)'), {'id': uid})
        db.add(Usuario(id=uid, nome='Teste', email=f'{uid}@example.test', perfil='operador'))
        db.commit()
        def remover_auth(user_id, **kwargs):
            with pg.begin() as auth_db:
                auth_db.execute(text('DELETE FROM auth.users WHERE id=:id'), {'id': UUID(user_id)})
        auth.auth.admin.delete_user.side_effect = remover_auth
        excluir_usuario_admin(db, auth, str(seed['users'][2]), str(uid))
        assert db.get(Usuario, uid) is None
        auth.auth.admin.delete_user.assert_called_once_with(str(uid), should_soft_delete=False)


def test_auth_failure_restores_deleted_local_profile(pg, seed):
    auth = Mock()
    auth.auth.admin.delete_user.side_effect = RuntimeError('serviço indisponível')
    uid = uuid4()
    with pg() as db:
        db.execute(text('INSERT INTO auth.users(id) VALUES (:id)'), {'id': uid})
        db.add(Usuario(id=uid, nome='Restaurado', email=f'{uid}@example.test', perfil='operador'))
        db.commit()
        with pytest.raises(ApiError):
            excluir_usuario_admin(db, auth, str(seed['users'][2]), str(uid))
        assert db.get(Usuario, uid).nome == 'Restaurado'


def test_admin_routes_authorization_validation_and_mutation(pg, seed, client):
    with pg() as db:
        id, _ = criar(db, seed)
        dados = edicao(db, id)
    url = f'/api/admin/vendas/{id}'
    assert client.put(url, json=dados).status_code == 401
    assert client.put(url, json=dados, headers=headers(seed['users'][0])).status_code == 403
    admin = headers(seed['users'][2])
    assert client.put(url, json={**dados, 'versao': None}, headers=admin).status_code == 422
    assert client.put(url, json=dados, headers=admin).status_code == 200
    assert client.get(url, headers=admin).json['venda']['valor_total'] == 10
    assert client.delete(url, json={'versao': 1}, headers=admin).status_code == 409
    assert client.delete(url, json={'versao': 2}, headers=admin).status_code == 200
    assert client.get(url, headers=admin).status_code == 404


def test_repeated_product_lines_use_net_stock_delta(pg, seed):
    with pg() as db:
        payload = sale(seed, itens=[{'id': seed['product'], 'qtd': 4, 'obs': 'A'}, {'id': seed['product'], 'qtd': 6, 'obs': 'B'}])
        id = UUID(processar_venda(db, payload)['venda_id'])
        dados = edicao(db, id)
        dados['itens'][0]['quantidade'] = 7
        dados['itens'][1]['quantidade'] = 3
        alterar_venda(db, id, dados)
        assert db.get(Produto, seed['product']).estoque_bar == 0
        assert db.get(Venda, id).valor_total == 100
