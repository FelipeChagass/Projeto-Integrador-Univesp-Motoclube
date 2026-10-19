"""Garantias do plano de organização: estrutura muda, comportamento não."""
import importlib
import runpy
from pathlib import Path

import pytest
from flask import Flask

ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.parametrize('script', ['backend/run.py', 'wsgi.py'])
def test_pontos_de_entrada_iniciam_servidor_com_debug_da_config(script, monkeypatch, capsys):
    chamadas = []
    monkeypatch.setattr(Flask, 'run', lambda self, **kwargs: chamadas.append((self, kwargs)))
    runpy.run_path(str(ROOT / script), run_name='__main__')
    app, kwargs = chamadas[0]
    assert kwargs == {'host': '0.0.0.0', 'port': 5000, 'debug': app.config['DEBUG']}
    assert 'Health:    http://localhost:5000/api/health' in capsys.readouterr().out


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
