from contextlib import contextmanager

from flask import g, has_request_context
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base

# Engine - pool de conexões com o PostgreSQL via Supabase Pooler. Criada por init_db(app).
engine = None
_config_engine = None


# Limite de tempo de consultas. Psycopg2 não usa PREPARE automaticamente.
def _set_pg_options(dbapi_connection, connection_record):
    """Configura timeout de consulta sem registrar credenciais ou parâmetros."""
    cursor = dbapi_connection.cursor()
    cursor.execute("SET statement_timeout = '30s'")
    cursor.close()
    dbapi_connection.commit()


# Fábrica de sessões - cada request cria uma sessão nova; init_db liga a engine.
_fabrica_sessoes = sessionmaker(
    autocommit=False,  # Controle manual de commit
    autoflush=False,   # Flush manual para performance
    expire_on_commit=False,
)
SessionLocal = _fabrica_sessoes


def init_db(app):
    """Cria a engine a partir da configuração do app; reaproveita a atual se nada mudou."""
    global engine, _config_engine
    config = dict(
        url=app.config.get('DATABASE_URL') or 'postgresql+psycopg2://localhost/pdv_test',
        echo=app.config.get('SQLALCHEMY_ECHO', False),  # True = mostra SQL no console (debug)
        pool_size=app.config.get('DB_POOL_SIZE', 3),
        max_overflow=app.config.get('DB_MAX_OVERFLOW', 2),
        pool_timeout=app.config.get('DB_POOL_TIMEOUT', 30),
    )
    if engine is not None and config == _config_engine:
        return engine
    if engine is not None:
        engine.dispose()
    engine = create_engine(
        config['url'],
        echo=config['echo'],
        pool_size=config['pool_size'],
        max_overflow=config['max_overflow'],
        pool_timeout=config['pool_timeout'],
        hide_parameters=True,
        pool_pre_ping=True,                 # Testa conexão antes de usar
        pool_recycle=300,                   # Recicla conexões a cada 5 min
    )
    event.listen(engine, 'connect', _set_pg_options)
    _fabrica_sessoes.configure(bind=engine)
    _config_engine = config
    return engine


# Classe base para os models (todas as tabelas herdam dela)
Base = declarative_base()


def sessao_da_requisicao():
    """Sessão única da requisição HTTP; None fora de uma requisição (scripts e testes de serviço).

    O middleware lê o perfil nela e deixa a conexão aberta para a rota usar a mesma:
    um checkout do pool (e um pre-ping) por requisição, em vez de dois.
    """
    if not has_request_context():
        return None
    db = g.get('_sessao_db')
    if db is None:
        db = g._sessao_db = SessionLocal()
    return db


def encerrar_sessao_da_requisicao(_erro=None):
    """Registrado em teardown_request: devolve a conexão mesmo se a rota não abriu escopo."""
    db = g.pop('_sessao_db', None)
    if db is not None:
        db.close()


@contextmanager
def session_scope():
    """Abre/fecha a sessão; a unidade de trabalho confirma a operação.

    Dentro de uma requisição reaproveita a sessão dela. Só o escopo mais externo
    fecha a sessão, liberando a conexão antes de chamadas externas (Storage, Auth).
    """
    compartilhada = sessao_da_requisicao()
    db = compartilhada if compartilhada is not None else SessionLocal()
    profundidade = db.info.get('profundidade_escopo', 0)
    db.info['profundidade_escopo'] = profundidade + 1
    try:
        yield db
    except BaseException:
        db.rollback()
        raise
    finally:
        db.info['profundidade_escopo'] = profundidade
        if profundidade == 0:
            db.info.pop('profundidade_escopo', None)
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
