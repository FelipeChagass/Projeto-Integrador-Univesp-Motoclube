"""
Serviço: Usuário / Perfil

O Supabase Auth cuida de cadastro, login, logout e tokens.
Este serviço gerencia apenas a tabela 'usuarios' (perfil),
que espelha auth.users com dados extras (nome, perfil, ativo).

Fluxo pós-signup:
  1. Frontend faz signup via supabase-js → Supabase cria entrada em auth.users
  2. Frontend chama POST /api/auth/sincronizar com o JWT
  3. Backend valida JWT, extrai UUID e email, chama sincronizar_perfil()
  4. sincronizar_perfil() cria (ou atualiza) a linha em public.usuarios
"""

import logging
import uuid
from sqlalchemy.orm import Session
from app.models.usuario import Usuario

logger = logging.getLogger(__name__)


def sincronizar_perfil(db: Session, user_id: str, email: str, nome: str, perfil: str = 'operador') -> dict:
    """
    Cria ou atualiza o perfil do usuário em public.usuarios.

    Chamado logo após o signup bem-sucedido no Supabase Auth.
    Se o perfil já existe (ex: segundo login), só atualiza nome se mudou.

    Args:
        user_id: UUID vindo do JWT do Supabase (auth.users.id)
        email:   Email do usuário
        nome:    Nome de exibição
        perfil:  'operador' (padrão) ou 'admin'

    Returns:
        dict com status e dados do perfil
    """
    nome = (nome or '').strip()
    if not nome:
        return {'status': 'erro', 'mensagem': 'Nome é obrigatório.'}

    try:
        uid = uuid.UUID(user_id)
    except (ValueError, AttributeError):
        return {'status': 'erro', 'mensagem': 'ID de usuário inválido.'}

    try:
        existente = db.query(Usuario).filter_by(id=uid).first()

        if existente:
            # Apenas atualiza nome se mudou
            if existente.nome != nome:
                existente.nome = nome
                db.commit()
                db.refresh(existente)
            return {'status': 'ok', 'usuario': existente.to_dict()}

        # Cria novo perfil
        novo = Usuario(
            id=uid,
            nome=nome,
            email=email.strip().lower(),
            perfil=perfil,
            ativo=True,
        )
        db.add(novo)
        db.commit()
        db.refresh(novo)
        return {'status': 'ok', 'usuario': novo.to_dict()}

    except Exception as e:
        db.rollback()
        return {'status': 'erro', 'mensagem': f'Erro ao sincronizar perfil: {str(e)}'}


def buscar_por_id(db: Session, usuario_id: str) -> Usuario | None:
    """Busca perfil por UUID (string ou UUID object)."""
    if not usuario_id:
        return None
    try:
        uid = uuid.UUID(str(usuario_id))
        return db.query(Usuario).filter_by(id=uid, ativo=True).first()
    except (ValueError, AttributeError):
        return None


def listar_operadores(db: Session) -> list:
    """Retorna todos os operadores ativos."""
    usuarios = db.query(Usuario).filter_by(ativo=True).order_by(Usuario.nome).all()
    return [u.to_dict() for u in usuarios]


# ─── Admin Operations ───

def listar_todos(db: Session) -> list:
    """Retorna TODOS os usuários (ativos + inativos), para o admin."""
    usuarios = db.query(Usuario).order_by(Usuario.nome).all()
    return [u.to_dict() for u in usuarios]


def editar_usuario(db: Session, user_id: str, dados: dict) -> dict:
    """
    Edita perfil e/ou status ativo de um usuário.
    dados: { perfil?: str, ativo?: bool, nome?: str }

    NOTA: email e senha são gerenciados pelo Supabase Auth, não aqui.
    """
    try:
        uid = uuid.UUID(str(user_id))
    except (ValueError, AttributeError):
        return {'status': 'erro', 'mensagem': 'ID inválido.'}

    usuario = db.query(Usuario).filter_by(id=uid).first()
    if not usuario:
        return {'status': 'erro', 'mensagem': 'Usuário não encontrado.'}

    try:
        if 'perfil' in dados:
            novo_perfil = dados['perfil']
            if novo_perfil not in ('admin', 'operador'):
                return {'status': 'erro', 'mensagem': 'Perfil deve ser "admin" ou "operador".'}
            usuario.perfil = novo_perfil

        if 'ativo' in dados:
            usuario.ativo = bool(dados['ativo'])

        if 'nome' in dados:
            novo_nome = (dados['nome'] or '').strip()
            if novo_nome:
                usuario.nome = novo_nome

        db.commit()
        db.refresh(usuario)
        return {'status': 'ok', 'mensagem': 'Usuário atualizado.', 'usuario': usuario.to_dict()}
    except Exception as e:
        db.rollback()
        logger.exception('Erro ao editar usuario %s', user_id)
        return {'status': 'erro', 'mensagem': f'Erro: {str(e)}'}

def criar_usuario_admin(db: Session, supabase_client, dados: dict) -> dict:
    """Cria user no Supabase Auth e Banco Local simultaneamente."""
    email = (dados.get('email') or '').strip().lower()
    senha = (dados.get('senha') or '').strip()
    nome = (dados.get('nome') or '').strip()
    perfil = dados.get('perfil', 'operador')
    
    if not email or not senha or not nome:
        return {'status': 'erro', 'mensagem': 'Nome, email e senha são obrigatórios.'}
    if perfil not in ('admin', 'operador'):
        return {'status': 'erro', 'mensagem': 'Perfil inválido.'}

    from gotrue.errors import AuthApiError
    try:
        # Usa admin API para não precisar de email de verificação
        res = supabase_client.auth.admin.create_user({
            "email": email,
            "password": senha,
            "email_confirm": True,
            "user_metadata": {"nome": nome}
        })
        if not res or not res.user:
            return {'status': 'erro', 'mensagem': 'Falha do Supabase Auth.'}
            
        user_id = str(res.user.id)
        return sincronizar_perfil(db, user_id=user_id, email=email, nome=nome, perfil=perfil)
    except AuthApiError as e:
        return {'status': 'erro', 'mensagem': getattr(e, 'message', str(e))}
    except Exception as e:
        db.rollback()
        return {'status': 'erro', 'mensagem': f'Falha ao criar: {str(e)}'}
