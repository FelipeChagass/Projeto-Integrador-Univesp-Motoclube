"""
Ponto de entrada na raiz do projeto.

Executar:
    python app.py

Equivalente a:
    cd backend && python run.py
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from app import create_app 

application = create_app()

if __name__ == '__main__':
    print("  API Flask + PostgreSQL (Supabase)")
    print()
    print("  Frontend:  http://localhost:5000")
    print("  Admin:     http://localhost:5000/admin")
    print("  API:       http://localhost:5000/api")
    print("  Health:    http://localhost:5000/api/health")
    print()
    print("=" * 50)

    application.run(
        host='0.0.0.0',
        port=5000,
        debug=True,
    )
