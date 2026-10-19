"""Garantias do plano de organização: estrutura muda, comportamento não."""
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
