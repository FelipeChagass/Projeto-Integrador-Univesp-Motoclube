"""Garantias do plano de organização: estrutura muda, comportamento não."""
import importlib
import runpy
from pathlib import Path

import pytest
from flask import Flask

from app.core.servidor import BANNER
from test_auth_postgres import client, headers  # noqa: F401 (fixture)

ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.parametrize('script', ['backend/run.py', 'wsgi.py'])
def test_pontos_de_entrada_iniciam_servidor_com_debug_da_config(script, monkeypatch, capsys):
    chamadas = []
    monkeypatch.setattr(Flask, 'run', lambda self, **kwargs: chamadas.append((self, kwargs)))
    runpy.run_path(str(ROOT / script), run_name='__main__')
    app, kwargs = chamadas[0]
    assert kwargs == {'host': '0.0.0.0', 'port': 5000, 'debug': app.config['DEBUG']}
    assert capsys.readouterr().out == BANNER + '\n'


@pytest.mark.parametrize(('modulo', 'nome'), [
    ('app.core.database', 'get_db'),
    ('app.features.auth.middleware', 'usuario_atual'),
    ('app.features.vendas.service', 'criar_venda_normal'),
    ('app.features.vendas.service', 'criar_venda_fiado'),
    ('app.features.usuarios.service', 'listar_operadores'),
    ('app.features.usuarios.service', 'buscar_por_id'),
])
def test_codigo_sem_uso_foi_removido(modulo, nome):
    assert not hasattr(importlib.import_module(modulo), nome)


@pytest.mark.parametrize(('modulo', 'nome'), [
    ('app.core.database', 'session_scope'),
    ('app.core.database', 'unit_of_work'),
    ('app.features.auth.middleware', 'requer_login'),
    ('app.features.auth.middleware', 'requer_admin'),
    ('app.features.vendas.service', 'processar_venda'),
    ('app.features.vendas.service', 'registrar_pagamento_divida'),
    ('app.features.usuarios.service', 'listar_todos'),
])
def test_api_interna_usada_pelas_rotas_permanece(modulo, nome):
    assert callable(getattr(importlib.import_module(modulo), nome))


@pytest.mark.postgres
def test_rotas_de_produtos_mantem_status_de_sucesso_e_de_erro(seed, client):
    admin = headers(seed['users'][2])
    criado = client.post('/api/produtos', headers=admin, json={'nome': 'Refri', 'preco_atual': '5.00'})
    assert criado.status_code == 201 and criado.get_json()['status'] == 'ok'
    produto_id = criado.get_json()['produto']['id']
    assert client.put(f'/api/produtos/{produto_id}', headers=admin, json={'nome': 'Refri lata'}).status_code == 200
    estoque = {'produto_id': produto_id, 'estoque_bar': 3, 'estoque_deposito': 4,
               'estoque_bar_esperado': 0, 'estoque_deposito_esperado': 0}
    assert client.put('/api/produtos/estoque', headers=admin, json=estoque).status_code == 200
    assert client.delete(f'/api/produtos/{produto_id}', headers=admin).status_code == 200
    # Erros continuam vindo do ApiError/ValidationError, não de um ramo 400 nas rotas.
    assert client.post('/api/produtos', headers=admin, json={'nome': ' ', 'preco_atual': '5.00'}).status_code == 422
    assert client.put(f'/api/produtos/{produto_id}', headers=admin, json={'nome': 'X'}).status_code == 404
    assert client.delete(f'/api/produtos/{produto_id}', headers=admin).status_code == 404
    assert client.put('/api/produtos/estoque', headers=admin, json=estoque).status_code == 404


@pytest.mark.postgres
def test_rotas_admin_de_membros_mantem_status_de_sucesso_e_de_erro(seed, client):
    admin = headers(seed['users'][2])
    criado = client.post('/api/admin/membros', headers=admin, json={'nome': 'Novo membro'})
    assert criado.status_code == 201 and criado.get_json()['status'] == 'ok'
    membro_id = criado.get_json()['membro']['id']
    assert client.post('/api/admin/membros', headers=admin, json={'nome': 'novo MEMBRO'}).status_code == 409
    assert client.put(f'/api/admin/membros/{membro_id}', headers=admin, json={'nome': 'Membro editado'}).status_code == 200
    assert client.delete(f'/api/admin/membros/{membro_id}', headers=admin).status_code == 200
    assert client.put(f'/api/admin/membros/{membro_id}', headers=admin, json={'nome': 'X'}).status_code == 404
    assert client.delete(f'/api/admin/membros/{membro_id}', headers=admin).status_code == 404
    ajuste = client.post(f"/api/admin/membros/{seed['member']}/ajuste", headers=admin,
                         json={'valor': '15.00', 'tipo': 'debito'})
    assert ajuste.status_code == 200 and ajuste.get_json()['membro']['saldo_devedor'] == 15
    excesso = client.post(f"/api/admin/membros/{seed['member']}/ajuste", headers=admin,
                          json={'valor': '50.00', 'tipo': 'credito'})
    assert excesso.status_code == 409 and excesso.get_json()['code'] == 'CREDITO_EXCEDE_SALDO'


@pytest.mark.parametrize('pasta', ['routes', 'schemas', 'services'])
def test_estrutura_antiga_por_camada_nao_existe(pasta):
    assert not (ROOT / 'backend' / 'app' / pasta).exists()


def test_gitignore_cobre_bytecode():
    assert '__pycache__' in (ROOT / '.gitignore').read_text(encoding='utf-8').split()
