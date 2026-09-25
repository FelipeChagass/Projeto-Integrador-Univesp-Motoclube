from uuid import uuid4
import pytest
from sqlalchemy import inspect, text
from alembic import command
from alembic.config import Config
from conftest import ROOT, migrate

pytestmark = pytest.mark.postgres


def isolated_schema(pg):
    engine = pg.kw['bind']
    schema = 'test_migration_' + uuid4().hex
    with engine.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    return engine, schema


def test_baseline_refuses_existing_tables(pg):
    engine, schema = isolated_schema(pg)
    with engine.begin() as conn:
        conn.execute(text(f'SET LOCAL search_path TO "{schema}"'))
        conn.execute(text('CREATE TABLE existing_history (id integer)'))
        with pytest.raises(RuntimeError, match='Schema não vazio'):
            migrate(conn, '0001_baseline')
        assert inspect(conn).has_table('existing_history')


def test_duplicate_cash_preflight_preserves_records_and_aborts_upgrade(pg):
    engine, schema = isolated_schema(pg)
    user = uuid4()
    with engine.begin() as conn:
        conn.execute(text(f'SET LOCAL search_path TO "{schema}"'))
        migrate(conn, '0001_baseline')
        conn.execute(text('INSERT INTO auth.users VALUES (:id)'), {'id': user})
        conn.execute(text("INSERT INTO usuarios(id,nome,email) VALUES (:id,'Test',:email)"), {'id': user, 'email': f'{user}@example.test'})
        conn.execute(text('INSERT INTO caixas(usuario_abertura_id) VALUES (:id),(:id)'), {'id': user})
    with pytest.raises(RuntimeError, match='duplicados'):
        with engine.begin() as conn:
            conn.execute(text(f'SET LOCAL search_path TO "{schema}"'))
            migrate(conn)
    with engine.connect() as conn:
        conn.execute(text(f'SET LOCAL search_path TO "{schema}"'))
        assert conn.execute(text('SELECT count(*) FROM caixas')).scalar() == 2
        assert conn.execute(text('SELECT version_num FROM alembic_version')).scalar() == '0001_baseline'
        assert 'payload_hash' not in {c['name'] for c in inspect(conn).get_columns('vendas')}


def test_audited_existing_baseline_stamp_and_equivalent_index(pg):
    engine, schema = isolated_schema(pg)
    sql = (ROOT / 'migrations/sql/0001_baseline.sql').read_text(encoding='utf-8')
    with engine.begin() as conn:
        conn.execute(text(f'SET LOCAL search_path TO "{schema}"'))
        conn.exec_driver_sql(sql.replace('__AUTH_USERS__', 'auth.users'))
        conn.execute(text("CREATE UNIQUE INDEX existing_open_cash ON caixas(usuario_abertura_id) WHERE status='aberto'"))
        config = Config(str(ROOT / 'alembic.ini'))
        config.attributes['connection'] = conn
        command.stamp(config, '0001_baseline')
        migrate(conn)
        indexes = inspect(conn).get_indexes('caixas')
        assert [i['name'] for i in indexes] == ['existing_open_cash']
        assert 'payload_hash' in {c['name'] for c in inspect(conn).get_columns('vendas')}
        assert conn.execute(text('SELECT version_num FROM alembic_version')).scalar() == '0003_edicao_admin'
