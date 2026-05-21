import logging
import time
import threading
from functools import wraps, lru_cache
 
from flask import request, jsonify, g
from supabase import create_client, Client
 
from app.config import Config
from app.database import get_db
from app.models.usuario import Usuario
 
logger = logging.getLogger(__name__)
 
_token_cache = {}
_token_cache_lock = threading.Lock()
TOKEN_CACHE_TTL = 120  # Cache tokens for 2 minutes to optimize repeated calls
 
@lru_cache(maxsize=1)
def _get_supabase_client() -> Client:
    """
    Instancia o client Supabase para validação de tokens.
    lru_cache garante uma única instância por processo.
    Criado sob demanda (não no import) para evitar o AttributeError
    de 'storage' que ocorre em supabase-py >= 2.x quando create_client
    é chamado no escopo global do módulo.
    """
    return create_client(
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
    Valida o JWT do Supabase com cache local thread-safe.
    Retorna os dados do usuário ou None se inválido/expirado.
    """
    now = time.time()
    with _token_cache_lock:
        if token in _token_cache:
            dados, expiracao = _token_cache[token]
            if now < expiracao:
                return dados
            else:
                del _token_cache[token]

    try:
        response = _get_supabase_client().auth.get_user(token)
        if response and response.user:
            dados = {
                'id': response.user.id,
                'email': response.user.email or '',
                'metadata': response.user.user_metadata or {},
            }
            with _token_cache_lock:
                _token_cache[token] = (dados, now + TOKEN_CACHE_TTL)
            return dados
    except Exception as e:
        logger.warning('Token validation failed: %s', str(e))
    return None
 
 
def _aplicar_autenticacao() -> tuple[dict | None, tuple | None]:
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
    @wraps(f)
    def decorated(*args, **kwargs):
        dados, erro = _aplicar_autenticacao()
        if erro:
            return erro
 
        g.usuario_id = dados['id']
        g.usuario_email = dados['email']
        g.usuario_meta = dados['metadata']
        g.usuario_dict = None
 
        db = next(get_db())
        try:
            usuario = db.query(Usuario).filter_by(id=g.usuario_id).first()
            if not usuario:
                return jsonify({
                    'status': 'erro',
                    'mensagem': 'Usuário não cadastrado no sistema. Contate um administrador.',
                    'codigo': 'USUARIO_NAO_ENCONTRADO'
                }), 403
            if not usuario.ativo:
                return jsonify({
                    'status': 'erro',
                    'mensagem': 'Usuario inativo. Procure um administrador.',
                    'codigo': 'USUARIO_INATIVO'
                }), 403
            g.usuario_dict = usuario.to_dict()
        finally:
            db.close()
 
        return f(*args, **kwargs)
 
    return decorated
 
 
def requer_admin(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        dados, erro = _aplicar_autenticacao()
        if erro:
            return erro
 
        g.usuario_id = dados['id']
        g.usuario_email = dados['email']
        g.usuario_meta = dados['metadata']
        g.usuario_dict = None
 
        db = next(get_db())
        try:
            usuario = db.query(Usuario).filter_by(id=g.usuario_id, ativo=True).first()
            perfil = getattr(usuario.perfil, 'value', str(usuario.perfil)) if usuario else ''
            if not usuario or perfil != 'admin':
                return jsonify({
                    'status': 'erro',
                    'mensagem': 'Acesso restrito a administradores.',
                    'codigo': 'ACESSO_NEGADO'
                }), 403
            g.usuario_dict = usuario.to_dict()
        finally:
            db.close()
 
        return f(*args, **kwargs)
 
    return decorated
 
 
def usuario_atual() -> dict | None:
    token = _extrair_token()
    if not token:
        return None
    return _validar_token(token)
 