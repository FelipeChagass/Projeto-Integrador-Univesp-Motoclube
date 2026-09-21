import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    """Configurações do Flask e do banco de dados."""

    # --- Flask ---
    SECRET_KEY = os.getenv('SECRET_KEY', '')
    DEBUG = os.getenv('FLASK_DEBUG', 'False').lower() == 'true'

    # --- Banco de Dados (PostgreSQL — Supabase) ---
    DATABASE_URL = os.getenv('DATABASE_URL')

    # SQLAlchemy
    SQLALCHEMY_ECHO = os.getenv('SQLALCHEMY_ECHO', 'False').lower() == 'true'
    DB_POOL_SIZE = int(os.getenv('DB_POOL_SIZE', '5'))
    DB_MAX_OVERFLOW = int(os.getenv('DB_MAX_OVERFLOW', '5'))
    DB_POOL_TIMEOUT = int(os.getenv('DB_POOL_TIMEOUT', '10'))

    # --- Supabase Auth ---
    # Usadas pelo backend para validar JWTs vindos do frontend
    SUPABASE_URL = os.getenv('SUPABASE_URL', '')
    SUPABASE_ANON_KEY = os.getenv('SUPABASE_ANON_KEY', '')
    SUPABASE_SERVICE_ROLE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY', '')

    MAX_CONTENT_LENGTH = 5 * 1024 * 1024
    STORAGE_BUCKET = os.getenv('STORAGE_BUCKET', 'produto-imagens')
    ALLOWED_ORIGINS = [
        origin.strip() for origin in os.getenv('ALLOWED_ORIGINS', 'http://localhost:5000').split(',')
        if origin.strip()
    ]


def validate_config(config):
    if config.get('TESTING'):
        return
    required = ('DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY')
    missing = [name for name in required if not config.get(name)]
    if missing:
        raise RuntimeError('Configuração ausente: ' + ', '.join(missing))
    if not config.get('DEBUG') and not config.get('SECRET_KEY'):
        raise RuntimeError('SECRET_KEY deve ser configurada fora do desenvolvimento.')
