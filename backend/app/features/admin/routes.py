"""Composição das rotas administrativas, separadas por domínio."""
from flask import Blueprint

bp = Blueprint('admin', __name__, url_prefix='/api/admin')

# Importação após a criação do blueprint registra as rotas sem alterar suas URLs.
from app.features.produtos import admin_routes as admin_produtos  # noqa: E402,F401
from app.features.membros import admin_routes as admin_membros  # noqa: E402,F401
from app.features.usuarios import admin_routes as admin_usuarios  # noqa: E402,F401
from app.features.vendas import admin_routes as admin_vendas  # noqa: E402,F401
from app.features.configuracoes import routes as admin_config  # noqa: E402,F401
