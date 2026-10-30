"""Garantias do plano de organização: estrutura muda, comportamento não."""
import importlib
import os
import runpy
import subprocess
import sys
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID

import pytest
from flask import Flask
from pydantic import ValidationError
from sqlalchemy import event, text
from sqlalchemy.engine import make_url

from app.core.errors import ApiError
from app.core.financeiro import VersaoPayload, aplicar_delta_saldo, conferir_versao, efeito_no_saldo
from app.core.locks import bloquear_id_externo, chave_id_externo
from app.core.servidor import BANNER
from app.core.tempo import FUSO
from test_auth_postgres import client, headers  # noqa: F401 (fixture)
from test_finance_postgres import payment, sale

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


def test_chave_do_advisory_lock_permanece_estavel():
    # Valor fixado: mudar a derivação quebraria a serialização com workers em versão anterior.
    assert chave_id_externo('pdv-op-1') == 2861193959473896925


@pytest.mark.postgres
def test_lock_do_id_externo_bloqueia_outra_transacao(pg):
    with pg() as db, pg() as outra:
        bloquear_id_externo(db, 'pdv-op-1')
        livre = outra.execute(text('SELECT pg_try_advisory_xact_lock(:c)'),
                              {'c': chave_id_externo('pdv-op-1')}).scalar()
        assert livre is False
        db.rollback()
        assert outra.execute(text('SELECT pg_try_advisory_xact_lock(:c)'),
                             {'c': chave_id_externo('pdv-op-1')}).scalar() is True


@pytest.mark.postgres
def test_venda_e_edicao_usam_o_lock_compartilhado(pg, seed, monkeypatch):
    import app.features.vendas.admin_service as admin_service
    import app.features.vendas.service as venda_service
    chamadas = []
    for modulo in (venda_service, admin_service):
        monkeypatch.setattr(modulo, 'bloquear_id_externo',
                            lambda db, id_externo: (chamadas.append(id_externo), bloquear_id_externo(db, id_externo)))
    payload = sale(seed)
    with pg() as db:
        venda_id = venda_service.processar_venda(db, payload)['venda_id']
        admin_service.alterar_venda(db, UUID(venda_id), {'versao': 1}, excluir=True)
    assert chamadas == [payload.id_externo, payload.id_externo]


def test_fuso_do_estabelecimento_e_unico():
    from app.features.membros import extrato
    from app.features.relatorios import service as relatorios
    from app.features.vendas import admin_routes
    assert FUSO.key == 'America/Sao_Paulo'
    assert extrato.FUSO is relatorios.FUSO is admin_routes.FUSO is FUSO


def test_vendas_nao_depende_de_relatorios_para_o_fuso():
    fonte = (ROOT / 'backend/app/features/vendas/admin_routes.py').read_text(encoding='utf-8')
    assert 'features.relatorios' not in fonte


@pytest.mark.postgres
def test_fechamento_calculado_soma_abertura_e_recebimentos_em_dinheiro(pg, seed):
    from app.features.caixa.service import calcular_fechamento, fechar_caixa
    from app.features.vendas.service import processar_venda, registrar_pagamento_divida
    from app.models import Caixa
    with pg() as db:
        assert calcular_fechamento(db, db.get(Caixa, seed['boxes'][0])) == Decimal('100')
        processar_venda(db, sale(seed))                                   # conta: 10
        processar_venda(db, sale(seed, metodo='pix'))                     # não conta
        processar_venda(db, sale(seed, metodo='fiado', membro_id=seed['member']))  # não conta
        registrar_pagamento_divida(db, payment(seed, metodo='dinheiro'))  # conta: 10
        assert calcular_fechamento(db, db.get(Caixa, seed['boxes'][0])) == Decimal('120')
        assert calcular_fechamento(db, db.get(Caixa, seed['boxes'][1])) == Decimal('100')
        fechado = fechar_caixa(db, {'usuario_id': seed['users'][0], 'caixa_id': seed['boxes'][0]})
        assert fechado['caixa']['valor_fechamento'] == 120
        assert db.get(Caixa, seed['boxes'][0]).fechamento_calculado is True


@pytest.fixture
def client_supabase_limpo():
    from app.features.auth.admin_client import get_supabase_admin_client
    get_supabase_admin_client.cache_clear()
    yield
    get_supabase_admin_client.cache_clear()


def test_middleware_e_admin_compartilham_um_unico_client_supabase(client_supabase_limpo, monkeypatch):
    import app.features.auth.admin_client as admin_client
    import app.features.auth.middleware as auth
    criados = []
    monkeypatch.setattr(admin_client, 'create_client',
                        lambda url, key, options: criados.append((url, key, options)) or object())
    assert auth._get_supabase_client() is admin_client.get_supabase_admin_client()
    url, key, options = criados[0]
    assert len(criados) == 1 and (url, key) == ('https://example.test', 'synthetic-not-a-secret')
    assert options.auto_refresh_token is False and options.persist_session is False


def test_falta_de_configuracao_do_supabase_continua_resultando_em_503(client_supabase_limpo, monkeypatch):
    import app.features.auth.admin_client as admin_client
    import app.features.auth.middleware as auth
    monkeypatch.setattr(admin_client.Config, 'SUPABASE_SERVICE_ROLE_KEY', '')
    with pytest.raises(ApiError) as erro:
        auth._validar_token('token-sem-cache-' + str(UUID(int=1)))
    assert (erro.value.code, erro.value.status_code) == ('AUTH_INDISPONIVEL', 503)


@pytest.mark.postgres
def test_bloqueios_de_membro_divergem_quanto_a_membro_inativo(pg, seed):
    """Etapa 10 não extraída: as versões diferem em regra de negócio (pendente de decisão)."""
    from app.features.membros import service as membros
    from app.features.vendas import service as vendas
    from app.models import Membro
    with pg() as db:
        db.get(Membro, seed['member']).ativo = False
        db.flush()
        assert membros._bloquear_membro(db, str(seed['member'])).id == seed['member']
        with pytest.raises(ApiError) as erro:
            vendas._bloquear_membro(db, seed['member'])
        assert (erro.value.code, erro.value.status_code) == ('MEMBRO_INATIVO', 409)
        with pytest.raises(ApiError) as erro:
            membros._bloquear_membro(db, 'nao-e-uuid')
        assert (erro.value.code, erro.value.status_code) == ('MEMBRO_INVALIDO', 422)
        for bloquear in (membros._bloquear_membro, vendas._bloquear_membro):
            with pytest.raises(ApiError) as erro:
                bloquear(db, UUID(int=0))
            assert (erro.value.code, erro.value.status_code) == ('MEMBRO_NAO_ENCONTRADO', 404)


def test_conferir_versao_e_versao_payload():
    conferir_versao(SimpleNamespace(versao=3), 3)
    with pytest.raises(ApiError) as erro:
        conferir_versao(SimpleNamespace(versao=3), 2)
    assert (erro.value.code, erro.value.status_code) == ('REGISTRO_ALTERADO', 409)
    assert VersaoPayload.model_validate({'versao': 1}).versao == 1
    for invalido in ({'versao': 0}, {}, {'versao': 1, 'extra': True}):
        with pytest.raises(ValidationError):
            VersaoPayload.model_validate(invalido)


def test_aplicar_delta_saldo_nao_permite_saldo_negativo():
    membro = SimpleNamespace(saldo_devedor=Decimal('10.00'))
    aplicar_delta_saldo(membro, Decimal('-4.50'))
    assert membro.saldo_devedor == Decimal('5.50')
    aplicar_delta_saldo(membro, Decimal('-5.50'))
    assert membro.saldo_devedor == 0
    with pytest.raises(ApiError) as erro:
        aplicar_delta_saldo(membro, Decimal('-0.01'))
    assert (erro.value.code, erro.value.status_code) == ('SALDO_NEGATIVO', 409)
    assert membro.saldo_devedor == 0


def test_efeito_no_saldo_por_tipo_de_movimento():
    assert efeito_no_saldo(SimpleNamespace(tipo_movimentacao='debito', valor='7.25')) == Decimal('7.25')
    assert efeito_no_saldo(SimpleNamespace(tipo_movimentacao='credito', valor='7.25')) == Decimal('-7.25')
    with pytest.raises(ApiError) as erro:
        efeito_no_saldo(SimpleNamespace(tipo_movimentacao='ajuste', valor='1'))
    assert (erro.value.code, erro.value.status_code) == ('MOVIMENTO_AMBIGUO', 409)


def test_core_nao_depende_das_features():
    for arquivo in (ROOT / 'backend/app/core').glob('*.py'):
        assert 'app.features' not in arquivo.read_text(encoding='utf-8'), arquivo.name


def test_alterar_movimento_pertence_a_membros_sem_depender_de_vendas():
    from app.features.membros import admin_service as membros_admin
    from app.features.vendas import admin_service as vendas_admin
    assert vendas_admin.alterar_movimento is membros_admin.alterar_movimento
    assert membros_admin.MovimentoEdicao.__module__ == 'app.features.membros.admin_service'
    fonte = (ROOT / 'backend/app/features/membros/admin_service.py').read_text(encoding='utf-8')
    assert 'features.vendas' not in fonte


@pytest.mark.postgres
def test_endpoint_de_movimento_avulso_mantem_contrato(pg, seed, client):
    from app.models import Membro, MovimentacaoMembro
    admin = headers(seed['users'][2])
    membro = seed['member']
    assert client.post(f'/api/admin/membros/{membro}/ajuste', headers=admin,
                       json={'valor': '20', 'tipo': 'debito'}).status_code == 200
    with pg() as db:
        movimento = db.query(MovimentacaoMembro).filter_by(membro_id=membro).one().id
    url = f'/api/admin/membros/{membro}/movimentos/{movimento}'
    editado = client.put(url, headers=admin, json={'versao': 1, 'tipo': 'debito', 'valor': '10'})
    assert editado.status_code == 200
    assert editado.get_json() == {'status': 'ok', 'mensagem': 'Movimentação atualizada.'}
    obsoleto = client.put(url, headers=admin, json={'versao': 1, 'tipo': 'debito', 'valor': '5'})
    assert obsoleto.status_code == 409 and obsoleto.get_json()['code'] == 'REGISTRO_ALTERADO'
    assert client.put(url, headers=admin, json={'versao': 2, 'tipo': 'x', 'valor': '5'}).status_code == 422
    excluido = client.delete(url, headers=admin, json={'versao': 2})
    assert excluido.get_json() == {'status': 'ok', 'mensagem': 'Movimentação excluída.'}
    assert client.delete(url, headers=admin, json={'versao': 2}).status_code == 404
    with pg() as db:
        assert db.get(Membro, membro).saldo_devedor == 0


def test_importar_database_nao_cria_engine():
    codigo = 'import app.core.database as d; assert d.engine is None; import app.models'
    # Interpretador limpo, sem a cobertura do pytest-cov: o subprocesso roda em backend/,
    # onde não acha o pyproject.toml (branch = true), e gravaria um .coverage.* sem
    # branch que o pytest-cov não consegue combinar com o principal (quebrava o CI).
    ambiente = {chave: valor for chave, valor in os.environ.items() if not chave.startswith('COV_CORE_')}
    subprocess.run([sys.executable, '-c', codigo], cwd=ROOT / 'backend', env=ambiente, check=True)


def test_create_app_cria_engine_com_a_configuracao_atual():
    from app import create_app
    from app.core import database
    create_app({'TESTING': True, 'DB_POOL_SIZE': 4, 'DB_MAX_OVERFLOW': 6, 'DB_POOL_TIMEOUT': 9})
    engine = database.engine
    assert database.SessionLocal.kw['bind'] is engine
    assert engine.url.render_as_string(hide_password=False) == 'postgresql+psycopg2://127.0.0.1/pdv_test'
    assert (engine.pool.size(), engine.pool._max_overflow, engine.pool._timeout) == (4, 6, 9)
    assert engine.pool._pre_ping is True and engine.pool._recycle == 300
    assert engine.hide_parameters is True and engine.echo is False
    assert event.contains(engine, 'connect', database._set_pg_options)
    # Mesma configuração reaproveita a engine (uma por processo, como antes).
    create_app({'TESTING': True, 'DB_POOL_SIZE': 4, 'DB_MAX_OVERFLOW': 6, 'DB_POOL_TIMEOUT': 9})
    assert database.engine is engine
    create_app({'TESTING': True})
    assert database.engine is not engine and database.SessionLocal.kw['bind'] is database.engine


@pytest.mark.postgres
def test_create_app_aceita_outro_banco_e_aplica_statement_timeout():
    url = os.environ.get('TEST_DATABASE_URL')
    if not url:
        pytest.skip('Defina TEST_DATABASE_URL para PostgreSQL local isolado.')
    from app import create_app
    from app.core.database import session_scope
    create_app({'TESTING': True, 'DATABASE_URL': url})
    try:
        with session_scope() as db:
            assert db.execute(text('SELECT current_database()')).scalar() == make_url(url).database
            assert db.execute(text('SHOW statement_timeout')).scalar() == '30s'
    finally:
        create_app({'TESTING': True})
