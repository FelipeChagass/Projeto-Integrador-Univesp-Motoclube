"""
Configurações centralizadas da aplicação.
Lê variáveis do arquivo .env na raiz do projeto.

Nenhuma dependência externa além de python-dotenv.
"""

import os
from dotenv import load_dotenv

# Carrega o .env que está na pasta raiz do projeto (um nível acima de /backend)
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env'))


class Config:
    """Configurações do Flask e do banco de dados."""

    # --- Flask ---
    SECRET_KEY = os.getenv('SECRET_KEY', 'chave-secreta-dev-trocar-em-prod')
    DEBUG = os.getenv('FLASK_DEBUG', 'True').lower() == 'true'

    # --- Banco de Dados (PostgreSQL — Supabase) ---
    DATABASE_URL = os.getenv('DATABASE_URL')
    if not DATABASE_URL:
        raise ValueError(
            "ERRO: DATABASE_URL não encontrada no arquivo .env.\n"
            "Certifique-se de que o arquivo .env na raiz do projeto contém a variável DATABASE_URL corretamente."
        )

    # SQLAlchemy
    SQLALCHEMY_ECHO = os.getenv('SQLALCHEMY_ECHO', 'False').lower() == 'true'

    # --- Supabase Auth ---
    # Usadas pelo backend para validar JWTs vindos do frontend
    SUPABASE_URL = os.getenv('SUPABASE_URL', '')
    SUPABASE_ANON_KEY = os.getenv('SUPABASE_ANON_KEY', '')
    SUPABASE_SERVICE_ROLE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY', '')

    # --- Senha do modo Estoque ---
    SENHA_ESTOQUE = os.getenv('SENHA_ESTOQUE', '')
