"""Perfil próprio: autenticar um token não equivale a autorizar o acesso ao PDV."""
import uuid

from flask import Blueprint, current_app, g, jsonify
from pydantic import BaseModel, ConfigDict, Field
from typing import Literal

from app.features.auth.middleware import PERMISSOES, requer_token
from app.core.database import session_scope, unit_of_work
from app.core.errors import ApiError, json_object
from app.models.usuario import Usuario

bp = Blueprint('auth', __name__, url_prefix='/api/auth')


class PerfilPayload(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    nome: str = Field(min_length=1, max_length=200)
    perfil: Literal['operador'] = 'operador'


@bp.route('/config', methods=['GET'])
def get_supabase_config():
    return jsonify({
        'status': 'ok', 'supabase_url': current_app.config['SUPABASE_URL'],
        'supabase_anon_key': current_app.config['SUPABASE_ANON_KEY'],
    })


@bp.route('/me', methods=['GET'])
@requer_token
def me():
    with session_scope() as db:
        usuario = db.get(Usuario, uuid.UUID(g.usuario_id))
        if not usuario:
            return jsonify({
                'status': 'pendente', 'mensagem': 'Perfil ainda não criado. Solicite aprovação administrativa.',
                'usuario_id': g.usuario_id, 'email': g.usuario_email,
            }), 202
        if not usuario.ativo:
            raise ApiError('USUARIO_INATIVO', 'Usuário inativo. Procure um administrador.', 403)
        dados = usuario.to_dict()
        dados['permissoes'] = sorted(PERMISSOES.get(usuario.perfil, ()))
        return jsonify({'status': 'ok', 'usuario': dados})


@bp.route('/sincronizar', methods=['POST'])
@requer_token
def sincronizar():
    payload = PerfilPayload.model_validate(json_object())
    if not g.usuario_email:
        raise ApiError('EMAIL_AUSENTE', 'A conta autenticada precisa de um email.', 422)
    with session_scope() as db:
        with unit_of_work(db):
            usuario = db.query(Usuario).filter_by(id=uuid.UUID(g.usuario_id)).with_for_update().first()
            if usuario and not usuario.ativo:
                raise ApiError('USUARIO_INATIVO', 'Usuário inativo. Procure um administrador.', 403)
            if usuario:
                usuario.nome = payload.nome
                usuario.email = g.usuario_email.strip().lower()
                resultado = usuario.to_dict()
            else:
                # Signup público não concede acesso: aprovação por admin permanece obrigatória.
                db.add(Usuario(id=uuid.UUID(g.usuario_id), nome=payload.nome,
                               email=g.usuario_email.strip().lower(), perfil='operador', ativo=False))
                resultado = None
        if resultado:
            return jsonify({'status': 'ok', 'usuario': resultado})
    raise ApiError('APROVACAO_PENDENTE', 'Perfil registrado. Solicite ativação a um administrador.', 403)
