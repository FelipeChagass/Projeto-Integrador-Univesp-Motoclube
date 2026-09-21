"""
Bar Moto Clube — Sistema PDV
Backend Flask + PostgreSQL (Supabase)

Factory pattern: create_app() cria e configura o Flask.
Autenticação: Supabase Auth (JWT). Flask não gerencia sessões.
"""

import os
import time
import uuid
from flask import Flask, render_template, g, request
from flask_cors import CORS
from app.core.config import Config, validate_config
from app.core.errors import register_error_handlers


def create_app(test_config=None):
    frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
    templates_dir = os.path.join(frontend_dir, 'templates')
    static_dir = os.path.join(frontend_dir, 'static')

    app = Flask(__name__, static_folder=static_dir, static_url_path='/static', template_folder=templates_dir)
    app.config.from_object(Config)
    if test_config:
        app.config.update(test_config)
    validate_config(app.config)
    register_error_handlers(app)

    @app.before_request
    def start_timer():
        g.start_time = time.perf_counter()
        g.request_id = str(uuid.uuid4())

    @app.after_request
    def add_server_timing(response):
        if hasattr(g, 'start_time'):
            dur = (time.perf_counter() - g.start_time) * 1000
            response.headers['Server-Timing'] = f'app;dur={dur:.2f};desc="Processamento Flask"'
            if request.path.startswith('/api/') and request.path != '/api/health':
                app.logger.info(
                    'request method=%s endpoint=%s status=%s duration_ms=%.2f request_id=%s user_id=%s',
                    request.method, request.endpoint, response.status_code, dur,
                    g.request_id, getattr(g, 'usuario_id', None),
                )
        response.headers['X-Request-ID'] = g.request_id
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Referrer-Policy'] = 'same-origin'
        response.headers['X-Frame-Options'] = 'DENY'
        if request.path.startswith('/api/'):
            response.headers['Cache-Control'] = 'no-store'
        return response


    allowed_origins = app.config['ALLOWED_ORIGINS']
    CORS(app, resources={r"/api/*": {"origins": allowed_origins}})

    # ---------- Blueprints ----------
    from app.features.pdv.routes import bp as dados_bp
    from app.features.produtos.routes import bp as produtos_bp
    from app.features.membros.routes import bp as membros_bp
    from app.features.vendas.routes import bp as vendas_bp
    from app.features.caixa.routes import bp as caixa_bp
    from app.features.relatorios.routes import bp as relatorios_bp
    from app.features.admin.routes import bp as admin_bp
    from app.features.auth.routes import bp as auth_bp

    app.register_blueprint(dados_bp)
    app.register_blueprint(produtos_bp)
    app.register_blueprint(membros_bp)
    app.register_blueprint(vendas_bp)
    app.register_blueprint(caixa_bp)
    app.register_blueprint(relatorios_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(auth_bp)

    # ---------- Servir frontend ----------

    @app.route('/')
    def index():
        """Serve o PDV diretamente. O JS do PDV verifica a sessão Supabase e redireciona para /login se necessário."""
        return render_template('ponto_venda.html')

    @app.route('/login')
    def login_page():
        return render_template('login.html')

    @app.route('/admin')
    def admin_page():
        return render_template('admin.html')


    # ---------- Health ----------
    @app.route('/api/health')
    def health():
        return {'status': 'ok', 'mensagem': 'API Bar Moto Clube funcionando!'}

    return app
