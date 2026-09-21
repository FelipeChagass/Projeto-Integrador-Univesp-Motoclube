"""Contratos públicos sem conexão a serviços externos."""
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app import create_app
from app.core.errors import ApiError
from app.features.vendas.schemas import PagamentoDividaPayload
from app.features.vendas.schemas import VendaNormalPayload


@pytest.fixture
def http_app():
    app = create_app({'TESTING': True})

    @app.get('/api/test-error/<int:status>')
    def fail(status):
        raise ApiError('TESTE', 'Mensagem pública.', status, {'campo': 'x'}, status >= 500)

    @app.get('/api/test-internal')
    def internal():
        raise RuntimeError('senha=segredo-nao-expor')

    return app


@pytest.mark.parametrize('status', [400, 401, 403, 404, 409, 422, 500, 503])
def test_error_envelope(http_app, status):
    response = http_app.test_client().get(f'/api/test-error/{status}')
    assert response.status_code == status
    assert response.json['code'] == 'TESTE'
    assert response.json['message'] == 'Mensagem pública.'
    assert response.json['retryable'] == (status >= 500)
    assert response.headers['Cache-Control'] == 'no-store'
    assert response.headers['X-Request-ID'] == response.json['request_id']


def test_internal_error_is_safe(http_app):
    response = http_app.test_client().get('/api/test-internal')
    assert response.status_code == 500
    assert response.json['code'] == 'ERRO_INTERNO'
    assert 'segredo' not in response.get_data(as_text=True)


@pytest.mark.parametrize('path,method', [
    ('/api/admin/verificar-senha', 'post'),
    ('/pdv', 'get'),
    ('/cadastro', 'get'),
])
def test_obsolete_routes_are_not_registered(http_app, path, method):
    response = getattr(http_app.test_client(), method)(path, json={} if method == 'post' else None)
    assert response.status_code == 404


@pytest.mark.parametrize('path,method', [
    ('/api/vendas', 'post'), ('/api/vendas/pagamento', 'post'),
    ('/api/caixa/abrir', 'post'), ('/api/caixa/fechar', 'post'),
    ('/api/produtos/estoque', 'put'), ('/api/admin/usuarios', 'get'),
    ('/api/auth/me', 'get'), ('/api/auth/sincronizar', 'post'),
])
def test_protected_endpoints_require_token(http_app, path, method):
    response = getattr(http_app.test_client(), method)(path, json={})
    assert response.status_code == 401
    assert response.json['code'] == 'TOKEN_AUSENTE'


def sale_payload():
    return dict(usuario_id=str(uuid4()), caixa_id=str(uuid4()), id_externo='operacao-123',
                itens=[{'id': 1, 'qtd': 2}], metodo='DINHEIRO')


@pytest.mark.parametrize('change', [
    {'caixa_id': None}, {'caixa_id': 'invalido'}, {'id_externo': ''},
    {'itens': []}, {'itens': [{'id': 1, 'qtd': -1}]},
    {'itens': [{'id': 1, 'qtd': 1.5}]}, {'itens': [{'id': 1, 'qtd': True}]},
    {'metodo': 'outro'}, {'metodo': 'fiado'}, {'usuario_origem_id': str(uuid4())},
])
def test_sale_rejects_invalid_input(change):
    with pytest.raises(ValidationError):
        VendaNormalPayload.model_validate(sale_payload() | change)


def test_payment_method_normalization():
    data = sale_payload()
    data['metodo'] = 'CARTÃO - CRÉDITO'
    payload = VendaNormalPayload.model_validate(data)
    assert payload.id_externo == 'operacao-123'
    assert payload.metodo == 'cartao_credito'


def test_sale_rejects_obsolete_id_alias():
    data = sale_payload()
    data['id'] = data.pop('id_externo')
    with pytest.raises(ValidationError):
        VendaNormalPayload.model_validate(data)


@pytest.mark.parametrize('change', [{'metodo': 'fiado'}, {'valor': '-1'}, {'valor': 'NaN'},
                                  {'valor': '1.001'}, {'saldo_esperado': None}])
def test_payment_rejects_invalid_money(change):
    data = sale_payload() | dict(membro_id=str(uuid4()), saldo_esperado='30.00', valor='10.00') | change
    with pytest.raises(ValidationError):
        PagamentoDividaPayload.model_validate(data)
