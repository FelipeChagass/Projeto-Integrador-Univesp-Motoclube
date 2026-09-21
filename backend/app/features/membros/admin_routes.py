"""Rotas administrativas do domínio; URL pública preservada."""
from flask import jsonify, request, g
from app.features.admin.routes import bp
from app.features.auth.middleware import requer_admin
from app.core.database import session_scope
from app.core.errors import json_object
from app.core.schemas import Paginacao
from app.features.membros import service as membro_service

@bp.route('/membros', methods=['GET'])
@requer_admin
def listar_membros():
    """Lista TODOS os membros (ativos + inativos) com saldo devedor."""
    with session_scope() as db:
        membros = membro_service.listar_todos_membros(db)
        return jsonify({'status': 'ok', 'membros': membros})


@bp.route('/membros', methods=['POST'])
@requer_admin
def criar_membro():
    """Cria um novo membro."""
    dados = json_object()
    with session_scope() as db:
        resultado = membro_service.criar_membro(db, dados)
        status_code = 201 if resultado.get('status') == 'ok' else 400
        return jsonify(resultado), status_code


@bp.route('/membros/<membro_id>', methods=['PUT'])
@requer_admin
def editar_membro(membro_id):
    """Edita nome e/ou status ativo de um membro."""
    dados = json_object()
    with session_scope() as db:
        resultado = membro_service.editar_membro(db, membro_id, dados)
        status_code = 200 if resultado.get('status') == 'ok' else 400
        return jsonify(resultado), status_code


@bp.route('/membros/<membro_id>', methods=['DELETE'])
@requer_admin
def desativar_membro(membro_id):
    """Desativa membro (soft-delete)."""
    with session_scope() as db:
        resultado = membro_service.desativar_membro(db, membro_id)
        status_code = 200 if resultado.get('status') == 'ok' else 400
        return jsonify(resultado), status_code


@bp.route('/membros/<membro_id>/extrato', methods=['GET'])
@requer_admin
def extrato_membro(membro_id):
    """Extrato completo de movimentações de um membro."""
    with session_scope() as db:
        paginacao = Paginacao.model_validate(request.args.to_dict())
        resultado = membro_service.buscar_extrato_membro(db, membro_id=membro_id,
                                                       limite=paginacao.limite, offset=paginacao.offset)
        return jsonify({'status': 'ok', **resultado})


@bp.route('/membros/<membro_id>/ajuste', methods=['POST'])
@requer_admin
def ajustar_saldo_membro(membro_id):
    """
    Ajuste manual de saldo devedor de um membro.
    Body: { valor: float, tipo: 'credito'|'debito', descricao?: str }
    """
    dados = json_object()
    valor = dados.get('valor', 0)
    tipo = dados.get('tipo', '')
    descricao = dados.get('descricao', '')

    with session_scope() as db:
        resultado = membro_service.ajustar_saldo(
            db, membro_id, valor, tipo, descricao,
            usuario_id=str(g.usuario_id)
        )
        status_code = 200 if resultado.get('status') == 'ok' else 400
        return jsonify(resultado), status_code

