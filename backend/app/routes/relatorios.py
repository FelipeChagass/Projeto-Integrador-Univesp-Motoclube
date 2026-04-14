"""
Rotas: Relatórios
POST /api/relatorios → Gera relatório financeiro (turno, dia, período) [requer login]
"""

from flask import Blueprint, request, jsonify, g
from app.database import get_db
from app.services import relatorio_service
from app.auth_middleware import requer_login

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
    db = next(get_db())
    try:
        dados = request.get_json() or {}
        tipo = dados.get('tipo', 'DIA').upper()

        if tipo not in ('TURNO', 'DIA', 'PERIODO'):
            return jsonify({'status': 'erro', 'mensagem': f'Tipo inválido: {tipo}'}), 400

        # Injeta usuario_id do JWT para filtro de turno
        dados['operador_id'] = g.usuario_id

        resultado = relatorio_service.gerar_relatorio(db, tipo, dados)

        if 'erro' in resultado:
            return jsonify(resultado), 400
        return jsonify(resultado)
    finally:
        db.close()
