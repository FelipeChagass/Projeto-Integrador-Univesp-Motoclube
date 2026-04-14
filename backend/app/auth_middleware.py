"""
Middleware de Autenticação — Supabase JWT

O Supabase emite um JWT (access_token) quando o usuário faz login no frontend.
O frontend envia esse token em TODA requisição ao Flask:

    Authorization: Bearer <access_token>

Este módulo valida o token usando o Supabase Python SDK (service role).
Se válido, injeta o user_id (UUID do auth.users) em g.usuario_id.

Uso nas rotas:
    from app.auth_middleware import requer_login, requer_admin

    @bp.route('/vendas', methods=['POST'])
    @requer_login
    def criar_venda():
        user_id = g.usuario_id    # UUID string do usuário autenticado
        user_email = g.usuario_email
        ...
"""

import logging
from functools import wraps

from flask import request, jsonify, g
from supabase import create_client, Client

from app.config import Config
from app.database import get_db
from app.models.usuario import Usuario

logger = logging.getLogger(__name__)

# Cliente Supabase com service role (pode validar qualquer token)
# Instanciado uma vez ao importar o módulo
_supabase: Client = create_client(
    Config.SUPABASE_URL,
    Config.SUPABASE_SERVICE_ROLE_KEY,
)


def _extrair_token() -> str | None:
    """Extrai o Bearer token do header Authorization."""
    auth_header = request.headers.get('Authorization', '')
    if auth_header.startswith('Bearer '):
        return auth_header[7:].strip()
    return None


def _validar_token(token: str) -> dict | None:
    """
    Valida o JWT do Supabase.
    Retorna os dados do usuário ou None se inválido/expirado.

    O Supabase get_user() faz uma chamada real ao Auth server,
    então mesmo tokens expirados são rejeitados corretamente.
    """
    try:
        response = _supabase.auth.get_user(token)
        if response and response.user:
            return {
                'id': response.user.id,                    # UUID
                'email': response.user.email or '',
                'metadata': response.user.user_metadata or {},
            }
    except Exception as e:
        logger.warning('Token validation failed: %s', str(e))
    return None


def _aplicar_autenticacao() -> tuple[dict | None, tuple | None]:
    """
    Lógica central de autenticação reutilizável.
    Retorna (dados_usuario, None) se OK ou (None, response_erro) se falhou.
    """
    token = _extrair_token()
    if not token:
        return None, (jsonify({
            'status': 'erro',
            'mensagem': 'Token de autenticação ausente.',
            'codigo': 'TOKEN_AUSENTE'
        }), 401)

    dados = _validar_token(token)
    if not dados:
        return None, (jsonify({
            'status': 'erro',
            'mensagem': 'Token inválido ou expirado. Faça login novamente.',
            'codigo': 'TOKEN_INVALIDO'
        }), 401)

    return dados, None


def requer_login(f):
    """
    Decorator para rotas que exigem autenticação.

    Injeta em g:
        g.usuario_id    → UUID string (auth.users.id)
        g.usuario_email → email do usuário
        g.usuario_meta  → user_metadata do Supabase (ex: nome)

    Retorna 401 se token ausente/inválido/expirado.
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        dados, erro = _aplicar_autenticacao()
        if erro:
            return erro

        g.usuario_id = dados['id']
        g.usuario_email = dados['email']
        g.usuario_meta = dados['metadata']
        return f(*args, **kwargs)

    return decorated


def requer_admin(f):
    """
    Decorator para rotas que exigem perfil 'admin'.
    Aplica validação de token e depois verifica o campo perfil em public.usuarios.
    Retorna 403 se o usuário for operador comum.
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        dados, erro = _aplicar_autenticacao()
        if erro:
            return erro

        g.usuario_id = dados['id']
        g.usuario_email = dados['email']
        g.usuario_meta = dados['metadata']

        # Verifica perfil no banco
        db = next(get_db())
        try:
            usuario = db.query(Usuario).filter_by(id=g.usuario_id).first()
            if not usuario or usuario.perfil != 'admin':
                return jsonify({
                    'status': 'erro',
                    'mensagem': 'Acesso restrito a administradores.',
                    'codigo': 'ACESSO_NEGADO'
                }), 403
        finally:
            db.close()

        return f(*args, **kwargs)

    return decorated


def usuario_atual() -> dict | None:
    """
    Retorna os dados do usuário atual se autenticado, ou None.
    Útil para rotas opcionais (sem @requer_login).
    """
    token = _extrair_token()
    if not token:
        return None
    return _validar_token(token)
