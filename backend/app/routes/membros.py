"""
Rotas: Membros
GET  /api/membros          → Lista membros ativos (requer login)
GET  /api/membros/extrato  → Busca extrato de pendências de um membro (requer login)
"""

from flask import Blueprint, request, jsonify
from app.database import get_db
from app.services import membro_service
from app.auth_middleware import requer_login

bp = Blueprint('membros', __name__, url_prefix='/api/membros')


@bp.route('', methods=['GET'])
@requer_login
def listar():
    """Lista todos os membros ativos. Requer autenticação."""
    db = next(get_db())
    try:
        membros = membro_service.listar_membros(db)
        return jsonify({'status': 'ok', 'membros': membros})
    finally:
        db.close()


@bp.route('/extrato', methods=['GET'])
@requer_login
def buscar_extrato():
    """
    Busca extrato de pendências de um membro. Requer autenticação.
    Query params: membro_id (UUID) ou nome (string)
    """
    db = next(get_db())
    try:
        membro_id = request.args.get('membro_id')
        nome = request.args.get('nome')

        if not membro_id and not nome:
            return jsonify({'status': 'erro', 'mensagem': 'Informe membro_id ou nome.'}), 400

        resultado = membro_service.buscar_extrato_membro(
            db,
            membro_id=membro_id,
            nome_membro=nome,
        )
        return jsonify(resultado)
    finally:
        db.close()
