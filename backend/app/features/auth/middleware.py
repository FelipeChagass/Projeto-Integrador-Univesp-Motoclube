"""Autenticação Supabase e autorização local, com cache limitado e sem tokens em logs."""
import hashlib
import threading
import time
import uuid
from functools import lru_cache, wraps

import jwt
from cachetools import TTLCache
from flask import g, request
from supabase import Client, create_client
from supabase.lib.client_options import SyncClientOptions
from supabase_auth.errors import AuthApiError

from app.core.config import Config
from app.core.database import session_scope
from app.core.errors import ApiError
from app.models.usuario import Usuario

TOKEN_CACHE_TTL = 120
_token_cache = TTLCache(maxsize=1024, ttl=TOKEN_CACHE_TTL)
_token_cache_lock = threading.Lock()

# Capacidades administrativas não são concedidas implicitamente a operadores.
PERMISSOES = {
    'operador': frozenset({'vendas:criar', 'caixa:proprio', 'membros:consultar'}),
    'admin': frozenset({'vendas:criar', 'caixa:proprio', 'membros:consultar',
                        'estoque:ajustar', 'caixa:outros', 'admin:gerenciar'}),
}


@lru_cache(maxsize=1)
def _get_supabase_client() -> Client:
    return create_client(
        Config.SUPABASE_URL, Config.SUPABASE_SERVICE_ROLE_KEY,
        options=SyncClientOptions(auto_refresh_token=False, persist_session=False),
    )


def _extrair_token():
    parts = request.headers.get('Authorization', '').split()
    return parts[1] if len(parts) == 2 and parts[0].lower() == 'bearer' else None


def _validar_token(token):
    key = hashlib.sha256(token.encode()).hexdigest()
    now = time.time()
    with _token_cache_lock:
        cached = _token_cache.get(key)
        if cached and now < cached['exp']:
            return cached['user']
        _token_cache.pop(key, None)

    try:
        response = _get_supabase_client().auth.get_user(token)
    except AuthApiError as error:
        if str(getattr(error, 'status', '')) in ('400', '401', '403', '404', '422'):
            return None
        raise ApiError('AUTH_INDISPONIVEL', 'Autenticação temporariamente indisponível.', 503, retryable=True) from None
    except Exception:
        raise ApiError('AUTH_INDISPONIVEL', 'Autenticação temporariamente indisponível.', 503, retryable=True) from None
    if not response or not response.user:
        return None
    try:
        user_id = str(uuid.UUID(str(response.user.id)))
    except (ValueError, TypeError, AttributeError):
        return None
    user = {
        'id': user_id, 'email': response.user.email or '',
        'metadata': response.user.user_metadata or {},
    }
    # get_user é a autoridade. Decodificação local apenas encurta a duração do cache.
    try:
        expiry = float(jwt.decode(token, options={'verify_signature': False})['exp'])
    except (jwt.PyJWTError, KeyError, ValueError, TypeError):
        return user  # Sem exp confiável não manter cache.
    if expiry <= now:
        return None
    with _token_cache_lock:
        _token_cache[key] = {'user': user, 'exp': min(expiry, now + TOKEN_CACHE_TTL)}
    return user


def _autenticar():
    token = _extrair_token()
    if not token:
        raise ApiError('TOKEN_AUSENTE', 'Token de autenticação ausente.', 401)
    dados = _validar_token(token)
    if not dados:
        raise ApiError('TOKEN_INVALIDO', 'Token inválido ou expirado. Faça login novamente.', 401)
    g.usuario_id = dados['id']
    g.usuario_email = dados['email']
    g.usuario_meta = dados['metadata']
    g.usuario_dict = None


def requer_token(f):
    """Permite consultar/sincronizar um perfil ausente sem liberar o PDV."""
    @wraps(f)
    def decorated(*args, **kwargs):
        _autenticar()
        return f(*args, **kwargs)
    return decorated


def _carregar_perfil():
    with session_scope() as db:
        usuario = db.get(Usuario, uuid.UUID(g.usuario_id))
        if not usuario:
            raise ApiError('USUARIO_NAO_ENCONTRADO', 'Usuário sem cadastro local. Solicite aprovação administrativa.', 403)
        if not usuario.ativo:
            raise ApiError('USUARIO_INATIVO', 'Usuário inativo. Procure um administrador.', 403)
        g.usuario_dict = usuario.to_dict()
        g.usuario_dict['permissoes'] = sorted(PERMISSOES.get(usuario.perfil, ()))


def requer_login(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        _autenticar()
        _carregar_perfil()
        return f(*args, **kwargs)
    return decorated


def requer_permissao(permissao):
    def decorator(f):
        @wraps(f)
        @requer_login
        def decorated(*args, **kwargs):
            if permissao not in g.usuario_dict['permissoes']:
                raise ApiError('ACESSO_NEGADO', 'Acesso restrito a administradores.', 403)
            return f(*args, **kwargs)
        return decorated
    return decorator


def requer_admin(f):
    return requer_permissao('admin:gerenciar')(f)


def usuario_atual():
    token = _extrair_token()
    return _validar_token(token) if token else None
 
