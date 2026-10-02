"""Filtros e FIFO informativo em PostgreSQL sintético; consultas nunca alteram saldo."""
from datetime import datetime
from decimal import Decimal
from uuid import uuid4
from zoneinfo import ZoneInfo

import pytest
from pydantic import ValidationError

from app import create_app
from app.core.errors import ApiError
from app.features.membros.schemas import FiltroExtrato
from app.features.membros.service import buscar_extrato_membro
from app.models import Membro, MovimentacaoMembro


@pytest.mark.parametrize('dados', [
    {'data_inicio': '2026-02-01'}, {'data_fim': '2026-02-28'},
    {'data_inicio': '2026-03-01', 'data_fim': '2026-02-28'},
    {'data_inicio': '2026-02-30', 'data_fim': '2026-03-01'},
    {'data_inicio': '20260101', 'data_fim': '20260131'},
    {'data_inicio': '2026-01-01', 'data_fim': '9999-12-31'},
    {'inesperado': 'x'}, {'limite': 501}, {'offset': -1},
])
def test_filtro_invalido(dados):
    with pytest.raises(ValidationError):
        FiltroExtrato.model_validate(dados)


@pytest.fixture
def historico(pg, seed):
    with pg.begin() as db:
        # Crédito em março quita janeiro e metade de fevereiro. Ajuste é separado de pagamento.
        for data, tipo, origem, valor in [
            ('2026-01-15T12:00', 'debito', 'venda_fiado', '100'),
            ('2026-02-01T00:00', 'debito', 'venda_fiado', '200'),
            ('2026-03-01T00:00', 'debito', 'venda_fiado', '50'),
            ('2026-03-10T12:00', 'credito', 'pagamento', '180'),
            ('2026-03-11T12:00', 'credito', 'ajuste_manual', '20'),
        ]:
            db.add(MovimentacaoMembro(membro_id=seed['member'], tipo_movimentacao=tipo,
                                     origem=origem, valor=Decimal(valor), descricao=data,
                                     criado_em=datetime.fromisoformat(data).replace(tzinfo=ZoneInfo('America/Sao_Paulo'))))
        db.get(Membro, seed['member']).saldo_devedor = Decimal('150')
    return seed['member']


@pytest.mark.postgres
def test_total_atual_fifo_e_pagamento_posterior(pg, historico):
    with pg() as db:
        resultado = buscar_extrato_membro(db, str(historico))
        assert resultado['total'] == 150
        assert resultado['resumo'] == {
            'total_periodo': 350, 'total_pago_periodo': 180, 'total_creditos_ajuste_periodo': 20,
            'total_aberto_periodo': 150, 'total_abatido_periodo': 200, 'divida_total_atual': 150,
        }
        debitos = [i for i in resultado['itens'] if i['tipo'] == 'debito']
        assert [i['situacao'] for i in debitos] == ['em_aberto', 'parcial', 'quitado']
        assert [i['valor_aberto'] for i in debitos] == [50, 100, 0]
        fevereiro = buscar_extrato_membro(db, str(historico), data_inicio='2026-02-01', data_fim='2026-02-28')
        assert len(fevereiro['itens']) == 1
        assert fevereiro['resumo']['total_periodo'] == 200
        assert fevereiro['resumo']['total_pago_periodo'] == 0
        assert fevereiro['resumo']['total_aberto_periodo'] == 100
        assert fevereiro['total'] == 150
        assert db.get(Membro, historico).saldo_devedor == Decimal('150')


@pytest.mark.postgres
def test_intervalo_mes_anterior_vazio_e_paginacao(pg, historico):
    with pg() as db:
        anterior = buscar_extrato_membro(db, str(historico), data_inicio='2026-01-01', data_fim='2026-01-31')
        assert anterior['resumo']['total_periodo'] == 100
        assert anterior['resumo']['total_aberto_periodo'] == 0
        intervalo = buscar_extrato_membro(db, str(historico), data_inicio='2026-01-01', data_fim='2026-02-28', limite=1)
        assert intervalo['resumo']['total_periodo'] == 300
        assert intervalo['paginacao']['tem_mais'] is True
        proxima = buscar_extrato_membro(db, str(historico), data_inicio='2026-01-01', data_fim='2026-02-28', limite=1, offset=1)
        assert proxima['itens'][0]['id'] != intervalo['itens'][0]['id']
        assert proxima['resumo'] == intervalo['resumo']
        vazio = buscar_extrato_membro(db, str(historico), data_inicio='2025-01-01', data_fim='2025-12-31')
        assert vazio['itens'] == [] and vazio['resumo']['total_periodo'] == 0
        assert vazio['total'] == 150


@pytest.mark.postgres
def test_historico_incompleto_nao_inventa_quitacao(pg, historico):
    with pg.begin() as db:
        db.get(Membro, historico).saldo_devedor = Decimal('151')
    with pg() as db:
        resultado = buscar_extrato_membro(db, str(historico))
        assert resultado['total'] == 151
        assert resultado['aviso']
        assert resultado['resumo']['total_aberto_periodo'] is None
        assert all(i['valor_aberto'] is None for i in resultado['itens'])


@pytest.mark.postgres
def test_membro_inexistente(pg):
    with pg() as db, pytest.raises(ApiError) as erro:
        buscar_extrato_membro(db, str(uuid4()))
    assert erro.value.status_code == 404


@pytest.mark.postgres
def test_endpoints_preservam_contrato_validacao_e_permissoes(pg, seed, historico, monkeypatch):
    import app.features.auth.middleware as auth
    monkeypatch.setattr(auth, '_validar_token', lambda token: {'id': token, 'email': '', 'metadata': {}})
    client = create_app({'TESTING': True}).test_client()
    headers = {'Authorization': f"Bearer {seed['users'][2]}"}
    urls = [f'/api/membros/extrato?membro_id={historico}&', f'/api/admin/membros/{historico}/extrato?']
    for url in urls:
        response = client.get(url + 'data_inicio=2026-02-01&data_fim=2026-02-28', headers=headers)
        assert response.status_code == 200
        assert response.json['total'] == 150
        assert response.json['resumo']['total_aberto_periodo'] == 100
        for query in ['data_inicio=2026-02-01', 'inesperado=x', 'data_inicio=2026-03-01&data_fim=2026-02-01']:
            assert client.get(url + query, headers=headers).status_code == 422
    assert client.get(urls[0], headers=headers).status_code == 200
    assert client.get(urls[1], headers={'Authorization': f"Bearer {seed['users'][0]}"}).status_code == 403
    assert client.get(urls[0]).status_code == 401
