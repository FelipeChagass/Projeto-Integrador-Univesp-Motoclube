"""
Rotas: Relatórios
POST /api/relatorios → Gera relatório financeiro (turno, dia, período) [requer login]
"""

from flask import Blueprint, jsonify, g
from app.core.database import session_scope
from app.core.errors import json_object, ApiError
from app.features.relatorios import service as relatorio_service
from app.features.auth.middleware import requer_login

bp = Blueprint('relatorios', __name__, url_prefix='/api/relatorios')


@bp.route('', methods=['POST'])
@requer_login
def gerar_relatorio():
    """
    Gera relatório de caixa. Requer autenticação.

    Body JSON:
    {
        "tipo": "TURNO" | "DIA" | "PERIODO",
        "operador_nome": "João",
        "inicio": "2025-01-01",
        "fim": "2025-01-31"
    }
    """
    with session_scope() as db:
        dados = json_object()
        tipo = str(dados.get('tipo', 'DIA')).upper()

        if tipo not in ('TURNO', 'DIA', 'PERIODO'):
            raise ApiError('TIPO_INVALIDO', 'Tipo de relatório inválido.', 422)

        # Injeta usuario_id do JWT para filtro de turno
        dados['operador_id'] = g.usuario_id
        dados['perfil'] = g.usuario_dict['perfil']

        resultado = relatorio_service.gerar_relatorio(db, tipo, dados)

        return jsonify(resultado)
