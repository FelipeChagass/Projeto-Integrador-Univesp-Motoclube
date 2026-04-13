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

app = create_app()

if __name__ == '__main__':
    print("  API Flask + PostgreSQL (Supabase)")
    print()
    print("  Frontend:  http://localhost:5000")
    print("  Admin:     http://localhost:5000/admin")
    print("  API:       http://localhost:5000/api")
    print("  Health:    http://localhost:5000/api/health")
    print()
    print("  Endpoints:")
    print("    GET  /api/dados-iniciais")
    print("    GET  /api/produtos")
    print("    GET  /api/membros")
    print("    POST /api/vendas")
    print("    POST /api/vendas/pagamento")
    print("    POST /api/caixa/abrir")
    print("    POST /api/caixa/fechar")
    print("    POST /api/relatorios")
    print("    POST /api/admin/verificar-senha")
    print("    CRUD /api/admin/produtos")
    print()
    print("=" * 50)

    app.run(
        host='0.0.0.0',
        port=5000,
        debug=True,
    )
