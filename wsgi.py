"""
Ponto de entrada na raiz do projeto.

Executar:
    python wsgi.py

Equivalente a:
    cd backend && python run.py
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from app import create_app
from app.core.servidor import executar_servidor

application = create_app()

if __name__ == '__main__':
    executar_servidor(application)
