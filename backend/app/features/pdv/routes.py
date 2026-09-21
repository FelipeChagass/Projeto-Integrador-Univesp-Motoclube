"""
Rota especial: Dados Iniciais
GET /api/dados-iniciais → Retorna tudo que o frontend precisa para iniciar. [requer login]

Retorna produtos, membros e configurações de uma só vez.
"""

from flask import Blueprint, jsonify
from app.core.database import session_scope
from app.features.produtos import service as produto_service
from app.features.membros import service as membro_service
from app.models.configuracao import ConfiguracaoSistema
from app.features.auth.middleware import requer_login

bp = Blueprint('dados_iniciais', __name__, url_prefix='/api')


@bp.route('/dados-iniciais', methods=['GET'])
@requer_login
def get_dados_iniciais():
    """
    Retorna dados iniciais para o frontend. Requer autenticação.
    Formato:
    {
        produtos: [{id, nome, preco_atual, estoque_bar, ...}, ...],
        membros: [{id, nome, saldo_devedor, ...}, ...],
        logoUrl: "https://..."
    }
    """
    with session_scope() as db:
        produtos = produto_service.listar_produtos(db)
        membros = membro_service.listar_membros(db)

        config = db.query(ConfiguracaoSistema).filter_by(id=1).first()
        logo_url = config.url_logo if config else ''

        return jsonify({
            'status': 'ok',
            'produtos': produtos,
            'membros': membros,
            'logoUrl': logo_url or '',
        })
