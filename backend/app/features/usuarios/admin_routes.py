"""Rotas administrativas do domínio; URL pública preservada."""
from flask import jsonify, g
from app.features.admin.routes import bp
from app.features.auth.middleware import requer_admin
from app.core.database import session_scope
from app.core.errors import json_object
from app.features.auth.admin_client import get_supabase_admin_client
from app.features.usuarios.schemas import UsuarioPayload
from app.features.usuarios import service as usuario_service

@bp.route('/usuarios', methods=['GET'])
@requer_admin
def listar_usuarios():
    """Lista todos os usuários (ativos + inativos)."""
    with session_scope() as db:
        usuarios = usuario_service.listar_todos(db)
        return jsonify({'status': 'ok', 'usuarios': usuarios})


@bp.route('/usuarios', methods=['POST'])
@requer_admin
def criar_usuario():
    """Cria um usuário via admin (Supabase Admin API) sem verificação de email."""
    dados = UsuarioPayload.model_validate(json_object()).model_dump(exclude_unset=True, exclude_none=True)
    with session_scope() as db:
        resultado = usuario_service.criar_usuario_admin(db, get_supabase_admin_client(), dados)
        return jsonify(resultado), 201

@bp.route('/usuarios/<user_id>', methods=['PUT'])
@requer_admin
def editar_usuario(user_id):
    """Edita dados locais e credenciais autenticáveis de um usuário."""
    dados = UsuarioPayload.model_validate(json_object()).model_dump(exclude_unset=True, exclude_none=True)
    with session_scope() as db:
        resultado = usuario_service.editar_usuario(
            db,
            get_supabase_admin_client(),
            str(g.usuario_id),
            user_id,
            dados,
        )
        return jsonify(resultado)


@bp.route('/usuarios/<user_id>', methods=['DELETE'])
@requer_admin
def excluir_usuario(user_id):
    """Remove o usuário do Supabase Auth e mantém o registro local inativo."""
    with session_scope() as db:
        resultado = usuario_service.excluir_usuario_admin(
            db,
            get_supabase_admin_client(),
            str(g.usuario_id),
            user_id,
        )
        return jsonify(resultado)
