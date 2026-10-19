"""Servidor de desenvolvimento compartilhado por wsgi.py e backend/run.py."""

BANNER = """\
  API Flask + PostgreSQL (Supabase)

  Frontend:  http://localhost:5000
  Admin:     http://localhost:5000/admin
  API:       http://localhost:5000/api
  Health:    http://localhost:5000/api/health

  Endpoints:
    GET  /api/dados-iniciais
    GET  /api/produtos
    GET  /api/membros
    POST /api/vendas
    POST /api/vendas/pagamento
    POST /api/caixa/abrir
    POST /api/caixa/fechar
    POST /api/relatorios
    CRUD /api/admin/produtos

""" + "=" * 50


def executar_servidor(app):
    print(BANNER)
    app.run(
        host='0.0.0.0',
        port=5000,
        debug=app.config['DEBUG'],
    )
