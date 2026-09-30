"""Synthetic PostgreSQL only. Never inherit the application's .env database URL."""
import os
import uuid
from pathlib import Path

os.environ['DATABASE_URL'] = 'postgresql+psycopg2://127.0.0.1/pdv_test'
os.environ.update(SUPABASE_URL='https://example.test', SUPABASE_ANON_KEY='synthetic-public-key',
                  SUPABASE_SERVICE_ROLE_KEY='synthetic-not-a-secret', SECRET_KEY='synthetic-test',
                  FLASK_DEBUG='false', SQLALCHEMY_ECHO='false', SENHA_ESTOQUE='senha-teste')

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

ROOT = Path(__file__).resolve().parents[2]


def migrate(connection, revision='head'):
    config = Config(str(ROOT / 'alembic.ini'))
    config.attributes['connection'] = connection
    command.upgrade(config, revision)


@pytest.fixture
def pg(monkeypatch):
    url = os.environ.get('TEST_DATABASE_URL')
    if not url:
        pytest.skip('Defina TEST_DATABASE_URL para PostgreSQL local isolado.')
    parsed = make_url(url)
    if parsed.host not in ('127.0.0.1', 'localhost') or not parsed.database.startswith('pdv_test'):
        pytest.fail('Somente PostgreSQL loopback com nome de banco pdv_test* é permitido.')
    admin = create_engine(url, hide_parameters=True)
    schema = 'test_' + uuid.uuid4().hex
    with admin.begin() as conn:
        # Minimal external Auth stub exists only in this dedicated synthetic database.
        conn.execute(text('CREATE SCHEMA IF NOT EXISTS auth'))
        conn.execute(text('CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY)'))
        conn.execute(text(f'CREATE SCHEMA "{schema}"'))
    engine = create_engine(url, hide_parameters=True,
                           connect_args={'options': f'-c search_path={schema},public -c statement_timeout=10000'})
    with engine.begin() as conn:
        migrate(conn)
    factory = sessionmaker(bind=engine, expire_on_commit=False, autoflush=False)
    import app.core.database as database
    monkeypatch.setattr(database, 'SessionLocal', factory)
    yield factory
    engine.dispose()
    admin.dispose()
    # Keep synthetic schemas for inspection; never drop an inherited/existing schema.


@pytest.fixture
def seed(pg):
    from app.models import Usuario, Produto, Membro, Caixa
    with pg() as db:
        users = [Usuario(id=uuid.uuid4(), nome=f'Operador {i}', email=f'{uuid.uuid4()}@example.test',
                         perfil='admin' if i == 2 else 'operador') for i in range(3)]
        for user in users:
            db.execute(text('INSERT INTO auth.users(id) VALUES (:id)'), {'id': user.id})
        db.add_all(users)
        db.flush()
        product = Produto(nome='Água', preco_atual='10.00', estoque_bar=10, estoque_deposito=20)
        member = Membro(nome='Membro sintético', saldo_devedor=0)
        boxes = [Caixa(usuario_abertura_id=u.id, valor_abertura=100) for u in users[:2]]
        db.add_all([product, member, *boxes])
        db.commit()
        return {'users': [u.id for u in users], 'boxes': [c.id for c in boxes],
                'product': product.id, 'member': member.id}
