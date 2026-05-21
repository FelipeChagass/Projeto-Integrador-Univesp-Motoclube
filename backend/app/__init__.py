"""
Bar Moto Clube — Sistema PDV
Backend Flask + PostgreSQL (Supabase)

Factory pattern: create_app() cria e configura o Flask.
Autenticação: Supabase Auth (JWT). Flask não gerencia sessões.
"""

import os
import time
from flask import Flask, redirect, render_template, g, request
from flask_cors import CORS
from app.config import Config


def create_app():
    frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
    templates_dir = os.path.join(frontend_dir, 'templates')
    static_dir = os.path.join(frontend_dir, 'static')
    
    app = Flask(__name__, static_folder=static_dir, static_url_path='/static', template_folder=templates_dir)
    app.config.from_object(Config)

    @app.before_request
    def start_timer():
        g.start_time = time.time()

    @app.after_request
    def add_server_timing(response):
        if hasattr(g, 'start_time'):
            dur = (time.time() - g.start_time) * 1000
            response.headers['Server-Timing'] = f'app;dur={dur:.2f};desc="Processamento Flask"'
            app.logger.info(f"Performance Metrics: {request.method} {request.path} finalizado em {dur:.2f}ms")
        return response

    # CORS: permite apenas mesma origem em produção.
    # Para desenvolvimento local, adicione a URL do frontend no ALLOWED_ORIGINS do .env.
    allowed_origins = os.getenv('ALLOWED_ORIGINS', 'http://localhost:5000').split(',')
    CORS(app, resources={r"/api/*": {"origins": allowed_origins}})

    # ---------- Blueprints ----------
    from app.routes.dados_iniciais import bp as dados_bp
    from app.routes.produtos import bp as produtos_bp
    from app.routes.membros import bp as membros_bp
    from app.routes.vendas import bp as vendas_bp
    from app.routes.caixa import bp as caixa_bp
    from app.routes.relatorios import bp as relatorios_bp
    from app.routes.admin import bp as admin_bp
    from app.routes.auth import bp as auth_bp

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

    @app.route('/cadastro')
    def cadastro_page():
        """Cadastro público removido — usuários são criados pelo admin."""
        return redirect('/login')

    @app.route('/pdv')
    def pdv_page():
        """Alias mantido para compatibilidade."""
        return redirect('/')

    @app.route('/admin')
    def admin_page():
        return render_template('admin.html')

    # Rota estática nativa do Flask agora lidará com /static/<path:filename>

    # ---------- Health ----------
    @app.route('/api/health')
    def health():
        return {'status': 'ok', 'mensagem': 'API Bar Moto Clube funcionando!'}

    return app
