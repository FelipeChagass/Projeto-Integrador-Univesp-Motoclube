from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base
from app.config import Config

# Engine - pool de conexões com o PostgreSQL via Supabase Pooler
engine = create_engine(
    Config.DATABASE_URL,
    echo=Config.SQLALCHEMY_ECHO,       # True = mostra SQL no console (debug)
    pool_size=5,                        # Conexões mantidas abertas
    max_overflow=10,                    # Extras em pico de uso
    pool_pre_ping=True,                 # Testa conexão antes de usar
    pool_recycle=300,                   # Recicla conexões a cada 5 min
)


# Desabilita prepared statements — necessário para o Supabase Pooler
# O Supavisor em transaction mode não suporta PREPARE/DEALLOCATE
@event.listens_for(engine, "connect")
def _set_pg_options(dbapi_connection, connection_record):
    """Configura opções do psycopg2 para compatibilidade com o pooler."""
    cursor = dbapi_connection.cursor()
    cursor.execute("SET statement_timeout = '30s'")
    cursor.close()
    dbapi_connection.commit()


# Fábrica de sessões - cada request cria uma sessão nova
SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,  # Controle manual de commit
    autoflush=False,   # Flush manual para performance
)

# Classe base para os models (todas as tabelas herdam dela)
Base = declarative_base()


def get_db():
    """
    Gera uma sessão do banco para uso em cada request.
    Garante que a sessão é sempre fechada ao final.

    Uso correto:
        db = next(get_db())
        try:
            # operações...
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
