"""Explicit environment URL only: never load .env or autogenerate external auth objects."""
import os
from alembic import context
from sqlalchemy import create_engine, pool


def run(connection):
    context.configure(connection=connection, target_metadata=None, transaction_per_migration=True)
    with context.begin_transaction():
        context.run_migrations()


connection = context.config.attributes.get('connection')
if connection is not None:
    run(connection)
else:
    url = os.environ.get('MIGRATION_DATABASE_URL')
    if not url:
        raise RuntimeError('Defina MIGRATION_DATABASE_URL explicitamente; .env não é carregado.')
    engine = create_engine(url, poolclass=pool.NullPool, hide_parameters=True)
    with engine.connect() as connection:
        run(connection)

