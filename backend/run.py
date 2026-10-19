"""
Script de inicialização do servidor.

Modo desenvolvimento:
    cd backend
    python run.py

Modo produção (com Gunicorn):
    cd backend
    gunicorn -w 4 -b 0.0.0.0:5000 "app:create_app()"
"""

from app import create_app
from app.core.servidor import executar_servidor

app = create_app()

if __name__ == '__main__':
    executar_servidor(app)
