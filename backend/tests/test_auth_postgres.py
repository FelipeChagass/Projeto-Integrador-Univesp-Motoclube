"""Autenticação, autorização e administração de usuários em PostgreSQL sintético."""

from uuid import uuid4
import pytest
from sqlalchemy import text
from app import create_app
from app.models import Usuario, Produto, AjusteEstoque
import app.features.auth.middleware as auth
import app.features.usuarios.admin_routes as usuarios_admin_routes

pytestmark = pytest.mark.postgres


@pytest.fixture
def client(pg, seed, monkeypatch):
    def identity(token):
        if token == 'invalid':
            return None
        return {'id': token, 'email': f'{token}@example.test', 'metadata': {}}
    monkeypatch.setattr(auth, '_validar_token', identity)
    return create_app({'TESTING': True}).test_client()


def headers(user):
    return {'Authorization': f'Bearer {user}'}


def test_new_profile_can_sync_but_cannot_grant_admin_or_active_access(pg, seed, client):
    user = uuid4()
    with pg.begin() as db:
        db.execute(text('INSERT INTO auth.users(id) VALUES (:id)'), {'id': user})
    assert client.get('/api/auth/me', headers=headers(user)).status_code == 202
    assert client.post('/api/auth/sincronizar', headers=headers(user), json={'nome': 'New', 'perfil': 'admin'}).status_code == 422
    response = client.post('/api/auth/sincronizar', headers=headers(user), json={'nome': 'New'})
    assert response.status_code == 403 and response.json['code'] == 'APROVACAO_PENDENTE'
    with pg() as db:
        profile = db.get(Usuario, user)
        assert profile.perfil == 'operador' and not profile.ativo
    assert client.get('/api/produtos', headers=headers(user)).status_code == 403
    assert client.post('/api/auth/sincronizar', headers=headers(user), json={'nome': 'New'}).status_code == 403


def test_existing_admin_keeps_role_and_invalid_token_fails(seed, client):
    admin = seed['users'][2]
    result = client.post('/api/auth/sincronizar', headers=headers(admin), json={'nome': 'Admin atualizado'})
    assert result.status_code == 200 and result.json['usuario']['perfil'] == 'admin'
    assert client.get('/api/auth/me', headers=headers('invalid')).status_code == 401


def test_stock_permission_stale_write_and_audit(pg, seed, client):
    data = {'produto_id': seed['product'], 'estoque_bar': 11, 'estoque_deposito': 19,
            'estoque_bar_esperado': 10, 'estoque_deposito_esperado': 20}
    assert client.put('/api/produtos/estoque', json=data, headers=headers(seed['users'][0])).status_code == 403
    assert client.put('/api/produtos/estoque', json=data, headers=headers(seed['users'][2])).status_code == 200
    assert client.put('/api/produtos/estoque', json=data, headers=headers(seed['users'][2])).status_code == 409
    with pg() as db:
        assert db.get(Produto, seed['product']).estoque_bar == 11
        assert db.query(AjusteEstoque).count() == 1


def test_route_cannot_spoof_actor_and_use_foreign_cash(seed, client):
    data = {'id_externo': 'spoof', 'usuario_id': str(seed['users'][1]), 'caixa_id': str(seed['boxes'][1]),
            'metodo': 'pix', 'itens': [{'id': seed['product'], 'qtd': 1}]}
    result = client.post('/api/vendas', json=data, headers=headers(seed['users'][0]))
    assert result.status_code == 403
    assert client.get(f"/api/caixa/aberto?caixa_id={seed['boxes'][1]}", headers=headers(seed['users'][0])).status_code == 403
    assert client.post('/api/caixa/fechar', json={'caixa_id': str(seed['boxes'][1])}, headers=headers(seed['users'][0])).status_code == 403


def test_inactive_profile_and_operator_admin_denied(pg, seed, client):
    operator = seed['users'][0]
    assert client.get('/api/admin/usuarios', headers=headers(operator)).status_code == 403
    with pg.begin() as db:
        db.get(Usuario, operator).ativo = False
    assert client.get('/api/auth/me', headers=headers(operator)).status_code == 403
    assert client.post('/api/caixa/abrir', headers=headers(operator), json={}).status_code == 403


def test_admin_user_service_raises_typed_errors_without_result_adapter(seed, client, monkeypatch):
    monkeypatch.setattr(usuarios_admin_routes, 'get_supabase_admin_client', lambda: object())
    admin = seed['users'][2]

    invalid = client.put('/api/admin/usuarios/id-invalido', headers=headers(admin), json={'nome': 'Nome'})
    assert invalid.status_code == 422 and invalid.json['code'] == 'ID_USUARIO_INVALIDO'

    missing = client.put(f'/api/admin/usuarios/{uuid4()}', headers=headers(admin), json={'nome': 'Nome'})
    assert missing.status_code == 404 and missing.json['code'] == 'USUARIO_NAO_ENCONTRADO'

    self_delete = client.delete(f'/api/admin/usuarios/{admin}', headers=headers(admin))
    assert self_delete.status_code == 409 and self_delete.json['code'] == 'AUTOEXCLUSAO_NEGADA'


def test_http_financial_journey_retry_payment_report_close(seed, client):
    user, box, member = str(seed['users'][0]), str(seed['boxes'][0]), str(seed['member'])
    sale = {'id_externo': 'http-sale', 'usuario_origem_id': user, 'caixa_id': box,
            'metodo': 'fiado', 'membro_id': member, 'itens': [{'id': seed['product'], 'qtd': 1}]}
    first = client.post('/api/vendas', json=sale, headers=headers(user))
    assert first.status_code == 200 and first.json['total_calculado'] == 10
    duplicate = client.post('/api/vendas', json=sale, headers=headers(user))
    assert duplicate.json['status'] == 'duplicado' and duplicate.json['venda_id'] == first.json['venda_id']
    pay = {'id_externo': 'http-payment', 'usuario_origem_id': user, 'caixa_id': box,
           'metodo': 'dinheiro', 'membro_id': member, 'saldo_esperado': 10}
    assert client.post('/api/vendas/pagamento', json=pay, headers=headers(user)).json['valor_pago'] == 10
    report = client.post('/api/relatorios', json={'tipo': 'TURNO', 'caixa_id': box}, headers=headers(user))
    assert report.status_code == 200
    assert report.json['totalEntradas'] == report.json['recebimentoDivida'] == 10
    assert report.json['totalGeral'] == 110
    closed = client.post('/api/caixa/fechar', json={'caixa_id': box}, headers=headers(user))
    assert closed.status_code == 200 and closed.json['caixa']['valor_fechamento'] == 110
