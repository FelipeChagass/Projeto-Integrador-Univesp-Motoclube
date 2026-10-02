"""
Rotas: Membros
GET  /api/membros          → Lista membros ativos (requer login)
GET  /api/membros/extrato  → Busca extrato de pendências de um membro (requer login)
"""

from flask import Blueprint, request, jsonify
from app.core.database import session_scope
from app.core.errors import ApiError
from app.features.membros.schemas import FiltroExtrato
from app.features.membros import service as membro_service
from app.features.auth.middleware import requer_login

bp = Blueprint('membros', __name__, url_prefix='/api/membros')


@bp.route('', methods=['GET'])
@requer_login
def listar():
    """Lista todos os membros ativos. Requer autenticação."""
    with session_scope() as db:
        membros = membro_service.listar_membros(db)
        return jsonify({'status': 'ok', 'membros': membros})


@bp.route('/extrato', methods=['GET'])
@requer_login
def buscar_extrato():
    """
    Busca extrato de pendências de um membro. Requer autenticação.
    Query params: membro_id (UUID) ou nome (string)
    """
    with session_scope() as db:
        membro_id = request.args.get('membro_id')
        nome = request.args.get('nome')

        if not membro_id and not nome:
            raise ApiError('MEMBRO_OBRIGATORIO', 'Informe membro_id ou nome.', 400)

        parametros = request.args.to_dict()
        parametros.pop('membro_id', None)
        parametros.pop('nome', None)
        paginacao = FiltroExtrato.model_validate(parametros)
        resultado = membro_service.buscar_extrato_membro(
            db,
            membro_id=membro_id,
            nome_membro=nome,
            limite=paginacao.limite, offset=paginacao.offset,
            data_inicio=paginacao.data_inicio, data_fim=paginacao.data_fim,
        )
        return jsonify(resultado)
