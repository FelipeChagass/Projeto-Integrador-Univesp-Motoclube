from contextlib import contextmanager

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base
from app.core.config import Config

# Engine - pool de conexões com o PostgreSQL via Supabase Pooler
engine = create_engine(
    Config.DATABASE_URL or 'postgresql+psycopg2://localhost/pdv_test',
    echo=Config.SQLALCHEMY_ECHO,       # True = mostra SQL no console (debug)
    pool_size=getattr(Config, 'DB_POOL_SIZE', 3),
    max_overflow=getattr(Config, 'DB_MAX_OVERFLOW', 2),
    pool_timeout=getattr(Config, 'DB_POOL_TIMEOUT', 30),
    hide_parameters=True,
    pool_pre_ping=True,                 # Testa conexão antes de usar
    pool_recycle=300,                   # Recicla conexões a cada 5 min
)


# Limite de tempo de consultas. Psycopg2 não usa PREPARE automaticamente.
@event.listens_for(engine, "connect")
def _set_pg_options(dbapi_connection, connection_record):
    """Configura timeout de consulta sem registrar credenciais ou parâmetros."""
    cursor = dbapi_connection.cursor()
    cursor.execute("SET statement_timeout = '30s'")
    cursor.close()
    dbapi_connection.commit()


# Fábrica de sessões - cada request cria uma sessão nova
SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,  # Controle manual de commit
    autoflush=False,   # Flush manual para performance
    expire_on_commit=False,
)

# Classe base para os models (todas as tabelas herdam dela)
Base = declarative_base()


@contextmanager
def session_scope():
    """Abre/fecha a sessão; a unidade de trabalho confirma a operação."""
    db = SessionLocal()
    try:
        yield db
    except BaseException:
        db.rollback()
        raise
    finally:
        db.close()


@contextmanager
def unit_of_work(db):
    """Somente a unidade externa faz commit; composição não confirma cedo.

    Leituras anteriores (autobegin) integram a transação. Uma falha interna
    aborta a unidade mesmo se o chamador interceptar a exceção.
    """
    depth = db.info.get('uow_depth', 0)
    db.info['uow_depth'] = depth + 1
    try:
        yield db
        if depth == 0:
            if db.info.get('uow_failed'):
                raise RuntimeError('Transação abortada por uma operação interna.')
            db.commit()
    except BaseException:
        db.info['uow_failed'] = True
        if depth == 0:
            db.rollback()
        raise
    finally:
        db.info['uow_depth'] = depth
        if depth == 0:
            db.info.pop('uow_depth', None)
            db.info.pop('uow_failed', None)


def get_db():
    """Compatibilidade: novos consumidores devem usar session_scope()."""
    with session_scope() as db:
        yield db
