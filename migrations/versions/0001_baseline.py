"""Baseline frozen from the supplied schema; existing databases must be audited/stamped."""
from pathlib import Path
from alembic import op
from sqlalchemy import inspect, text

revision = '0001_baseline'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    connection = op.get_bind()
    tables = set(inspect(connection).get_table_names()) - {'alembic_version'}
    if tables:
        raise RuntimeError('Schema não vazio: compare a referência e faça stamp 0001_baseline somente após auditoria.')
    if not connection.execute(text("SELECT to_regclass('auth.users')")).scalar():
        raise RuntimeError('auth.users deve existir (Supabase; nos testes, stub sintético explícito).')
    sql = (Path(__file__).parents[1] / 'sql' / '0001_baseline.sql').read_text(encoding='utf-8')
    connection.exec_driver_sql(sql.replace('__AUTH_USERS__', 'auth.users'))


def downgrade():
    raise RuntimeError('Downgrade destrutivo bloqueado. Restaure backup validado em ambiente separado.')

