from flask import Blueprint, request, jsonify, g
from app.database import get_db
from app.services import usuario_service
from app.models.usuario import Usuario
from app.auth_middleware import requer_login
from app.config import Config

bp = Blueprint('auth', __name__, url_prefix='/api/auth')


@bp.route('/resolve_email', methods=['POST'])
def resolve_email():
    """
    Recebe 'login' (que pode ser email ou nome de usuário) 
    e retorna o 'email' correspondente, caso exista no banco.
    """
    dados = request.get_json(silent=True) or {}
    login_str = dados.get('login', '').strip()
    if not login_str:
        return jsonify({'status': 'erro', 'mensagem': 'Login é obrigatório.'}), 400

    db = next(get_db())
    try:
        usuario = db.query(Usuario).filter(Usuario.email.ilike(login_str)).first()
        if not usuario:
            usuario = db.query(Usuario).filter(Usuario.nome.ilike(login_str)).first()
        
        if not usuario:
            # Tenta encontrar correspondente se o usuário informou a parte antes do @
            usuario = db.query(Usuario).filter(Usuario.email.ilike(f"{login_str}@%")).first()

        if not usuario:
            return jsonify({'status': 'erro', 'mensagem': 'Usuário não encontrado.'}), 404

        if not getattr(usuario, 'ativo', True):
            return jsonify({'status': 'erro', 'mensagem': 'Usuário inativo.'}), 403

        return jsonify({'status': 'ok', 'email': usuario.email})
    except Exception as e:
        return jsonify({'status': 'erro', 'mensagem': f'Erro ao resolver email: {str(e)}'}), 500
    finally:
        db.close()


@bp.route('/config', methods=['GET'])
def get_supabase_config():
    """
    Retorna endpoints e a chave PÚBLICA (Anon Key) do Supabase.
    No Supabase, a Anon Key é projetada para ser pública no frontend. As regras de 
    segurança do banco (RLS) é que garantem a proteção dos dados.
    """
    return jsonify({
        'status': 'ok',
        'supabase_url': Config.SUPABASE_URL,
        'supabase_anon_key': Config.SUPABASE_ANON_KEY
    })


@bp.route('/me', methods=['GET'])
@requer_login
def me():
    """
    Retorna o perfil do usuário autenticado.
    O JWT é validado pelo decorator @requer_login.
    O email vem do JWT (g.usuario_email), NÃO do banco.
    """
    db = next(get_db())
    try:
        usuario = usuario_service.buscar_por_id(db, g.usuario_id)
        if usuario:
            return jsonify({'status': 'ok', 'usuario': usuario.to_dict()})
        # Perfil não existe ainda (acabou de criar conta — precisa sincronizar)
        return jsonify({
            'status': 'pendente',
            'mensagem': 'Perfil ainda não criado. Chame /api/auth/sincronizar.',
            'usuario_id': g.usuario_id,
            'email': g.usuario_email,
        }), 202
    except Exception as e:
        db.rollback()
        return jsonify({
            'status': 'erro',
            'mensagem': f'Erro ao buscar perfil: {str(e)}'
        }), 500
    finally:
        db.close()


@bp.route('/sincronizar', methods=['POST'])
@requer_login
def sincronizar():
    """
    Cria ou atualiza o perfil em public.usuarios após o signup.

    Body JSON: { "nome": "...", "perfil": "operador" }
    O user_id e email vêm do JWT (g.usuario_id, g.usuario_email).
    """
    dados = request.get_json(silent=True) or {}
    nome = dados.get('nome') or g.usuario_meta.get('nome', '')
    perfil = dados.get('perfil', 'operador')

    db = next(get_db())
    try:
        resultado = usuario_service.sincronizar_perfil(
            db,
            user_id=g.usuario_id,
            email=g.usuario_email,
            nome=nome,
            perfil=perfil,
        )
        status_http = 200 if resultado['status'] == 'ok' else 400
        return jsonify(resultado), status_http
    except Exception as e:
        db.rollback()
        return jsonify({
            'status': 'erro',
            'mensagem': f'Erro ao sincronizar: {str(e)}'
        }), 500
    finally:
        db.close()
