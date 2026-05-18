"""
Serviço: Usuário / Perfil

O Supabase Auth cuida de cadastro, login, logout e tokens.
Este serviço gerencia a tabela 'usuarios' (perfil) e, nas rotas
administrativas, sincroniza as operacoes sensiveis com o Supabase Auth.

Vinculo atual do projeto:
    - public.usuarios.id = auth.users.id
    - nao existe coluna auth_user_id separada

Fluxo pós-signup:
  1. Frontend faz signup via supabase-js → Supabase cria entrada em auth.users
  2. Frontend chama POST /api/auth/sincronizar com o JWT
  3. Backend valida JWT, extrai UUID e email, chama sincronizar_perfil()
  4. sincronizar_perfil() cria (ou atualiza) a linha em public.usuarios
"""

import logging
import uuid

from sqlalchemy.orm import Session
from supabase_auth.errors import AuthApiError

from app.models.usuario import Usuario

logger = logging.getLogger(__name__)

_BAN_DURATION_INDEFINITE = '876000h'


def _parse_uuid(value: str | uuid.UUID | None) -> uuid.UUID | None:
    if not value:
        return None
    try:
        return uuid.UUID(str(value))
    except (ValueError, AttributeError, TypeError):
        return None


def _normalize_email(email: str | None) -> str:
    return (email or '').strip().lower()


def _auth_error_message(err: Exception) -> str:
    return getattr(err, 'message', str(err))


def _ban_duration_for_status(ativo: bool) -> str:
    return 'none' if ativo else _BAN_DURATION_INDEFINITE


def _atualizar_usuario_local(usuario: Usuario, atualizacoes: dict) -> None:
    for campo, valor in atualizacoes.items():
        setattr(usuario, campo, valor)


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

    uid = _parse_uuid(user_id)
    if not uid:
        return {'status': 'erro', 'mensagem': 'ID de usuário inválido.'}

    email_normalizado = _normalize_email(email)
    if not email_normalizado:
        return {'status': 'erro', 'mensagem': 'Email é obrigatório.'}

    try:
        existente = db.query(Usuario).filter_by(id=uid).first()

        if existente:
            mudou = False
            if existente.nome != nome:
                existente.nome = nome
                mudou = True
            if existente.email != email_normalizado:
                existente.email = email_normalizado
                mudou = True
            if mudou:
                db.commit()
                db.refresh(existente)
            return {'status': 'ok', 'usuario': existente.to_dict()}

        # Cria novo perfil
        novo = Usuario(
            id=uid,
            nome=nome,
            email=email_normalizado,
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
    uid = _parse_uuid(usuario_id)
    if not uid:
        return None
    return db.query(Usuario).filter_by(id=uid, ativo=True).first()


def listar_operadores(db: Session) -> list:
    """Retorna todos os operadores ativos."""
    usuarios = db.query(Usuario).filter_by(ativo=True).order_by(Usuario.nome).all()
    return [u.to_dict() for u in usuarios]


# ─── Admin Operations ───

def listar_todos(db: Session) -> list:
    """Retorna TODOS os usuários (ativos + inativos), para o admin."""
    usuarios = db.query(Usuario).order_by(Usuario.nome).all()
    return [u.to_dict() for u in usuarios]


def editar_usuario(db: Session, admin_client, operador_atual_id: str, user_id: str, dados: dict) -> dict:
    """
    Edita dados locais e do Supabase Auth de um usuário.
    dados: { perfil?: str, ativo?: bool, nome?: str, email?: str, senha?: str }
    """
    uid = _parse_uuid(user_id)
    if not uid:
        return {'status': 'erro', 'mensagem': 'ID inválido.'}

    operador_uid = _parse_uuid(operador_atual_id)

    usuario = db.query(Usuario).filter_by(id=uid).first()
    if not usuario:
        return {'status': 'erro', 'mensagem': 'Usuário não encontrado.'}

    atualizacoes_locais = {}
    atualizacoes_auth = {}

    try:
        if 'perfil' in dados:
            novo_perfil = dados['perfil']
            if novo_perfil not in ('admin', 'operador'):
                return {'status': 'erro', 'mensagem': 'Perfil deve ser "admin" ou "operador".'}
            if operador_uid == uid and novo_perfil != 'admin':
                return {'status': 'erro', 'mensagem': 'Um administrador não pode remover o próprio perfil admin.'}
            atualizacoes_locais['perfil'] = novo_perfil

        if 'ativo' in dados:
            novo_ativo = bool(dados['ativo'])
            if operador_uid == uid and not novo_ativo:
                return {'status': 'erro', 'mensagem': 'Um administrador não pode desativar a própria conta.'}
            atualizacoes_locais['ativo'] = novo_ativo
            atualizacoes_auth['ban_duration'] = _ban_duration_for_status(novo_ativo)

        if 'nome' in dados:
            novo_nome = (dados['nome'] or '').strip()
            if not novo_nome:
                return {'status': 'erro', 'mensagem': 'Nome é obrigatório.'}
            atualizacoes_locais['nome'] = novo_nome
            atualizacoes_auth['user_metadata'] = {'nome': novo_nome}

        if 'email' in dados:
            novo_email = _normalize_email(dados.get('email'))
            if not novo_email:
                return {'status': 'erro', 'mensagem': 'Email é obrigatório.'}

            existente = db.query(Usuario).filter(
                Usuario.email == novo_email,
                Usuario.id != uid,
            ).first()
            if existente:
                return {'status': 'erro', 'mensagem': 'Já existe outro usuário com este email.'}

            atualizacoes_locais['email'] = novo_email
            atualizacoes_auth['email'] = novo_email

        if 'senha' in dados:
            nova_senha = (dados.get('senha') or '').strip()
            if nova_senha:
                if len(nova_senha) < 6:
                    return {'status': 'erro', 'mensagem': 'A senha deve ter pelo menos 6 caracteres.'}
                atualizacoes_auth['password'] = nova_senha

        if not atualizacoes_locais and not atualizacoes_auth:
            return {'status': 'ok', 'mensagem': 'Nenhuma alteração enviada.', 'usuario': usuario.to_dict()}

        rollback_auth = {}
        if 'email' in atualizacoes_auth:
            rollback_auth['email'] = usuario.email
        if 'user_metadata' in atualizacoes_auth:
            rollback_auth['user_metadata'] = {'nome': usuario.nome}
        if 'ban_duration' in atualizacoes_auth:
            rollback_auth['ban_duration'] = _ban_duration_for_status(usuario.ativo)

        if atualizacoes_auth:
            admin_client.auth.admin.update_user_by_id(str(usuario.id), atualizacoes_auth)

        _atualizar_usuario_local(usuario, atualizacoes_locais)
        db.commit()
        db.refresh(usuario)
        return {'status': 'ok', 'mensagem': 'Usuário atualizado.', 'usuario': usuario.to_dict()}
    except AuthApiError as e:
        db.rollback()
        return {'status': 'erro', 'mensagem': _auth_error_message(e)}
    except Exception as e:
        db.rollback()
        if atualizacoes_auth and rollback_auth:
            try:
                admin_client.auth.admin.update_user_by_id(str(usuario.id), rollback_auth)
            except Exception:
                logger.exception('Falha ao reverter atualização do Auth para o usuário %s', user_id)
        logger.exception('Erro ao editar usuario %s', user_id)
        return {'status': 'erro', 'mensagem': f'Erro: {str(e)}'}

def criar_usuario_admin(db: Session, supabase_client, dados: dict) -> dict:
    """Cria user no Supabase Auth e Banco Local simultaneamente."""
    email = _normalize_email(dados.get('email'))
    senha = (dados.get('senha') or '').strip()
    nome = (dados.get('nome') or '').strip()
    perfil = dados.get('perfil', 'operador')
    
    if not email or not senha or not nome:
        return {'status': 'erro', 'mensagem': 'Nome, email e senha são obrigatórios.'}
    if len(senha) < 6:
        return {'status': 'erro', 'mensagem': 'A senha deve ter pelo menos 6 caracteres.'}
    if perfil not in ('admin', 'operador'):
        return {'status': 'erro', 'mensagem': 'Perfil inválido.'}

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
        resultado = sincronizar_perfil(db, user_id=user_id, email=email, nome=nome, perfil=perfil)
        if resultado.get('status') != 'ok':
            try:
                supabase_client.auth.admin.delete_user(user_id)
            except Exception:
                logger.exception('Falha ao reverter criação do Auth para o usuário %s', email)
        return resultado
    except AuthApiError as e:
        return {'status': 'erro', 'mensagem': _auth_error_message(e)}
    except Exception as e:
        db.rollback()
        return {'status': 'erro', 'mensagem': f'Falha ao criar: {str(e)}'}


def excluir_usuario_admin(db: Session, admin_client, operador_atual_id: str, user_id: str) -> dict:
    """Realiza soft delete no Supabase Auth e mantém o registro local inativo."""
    uid = _parse_uuid(user_id)
    if not uid:
        return {'status': 'erro', 'mensagem': 'ID inválido.'}

    operador_uid = _parse_uuid(operador_atual_id)
    if operador_uid == uid:
        return {'status': 'erro', 'mensagem': 'Um administrador não pode excluir a própria conta.'}

    usuario = db.query(Usuario).filter_by(id=uid).first()
    if not usuario:
        return {'status': 'erro', 'mensagem': 'Usuário não encontrado.'}

    try:
        admin_client.auth.admin.delete_user(str(usuario.id), should_soft_delete=True)
        usuario.ativo = False
        db.commit()
        db.refresh(usuario)
        return {
            'status': 'ok',
            'mensagem': 'Usuário removido do Auth e mantido inativo localmente.',
            'usuario': usuario.to_dict(),
        }
    except AuthApiError as e:
        db.rollback()
        return {'status': 'erro', 'mensagem': _auth_error_message(e)}
    except Exception as e:
        db.rollback()
        logger.exception('Erro ao excluir usuario %s', user_id)
        return {'status': 'erro', 'mensagem': f'Erro ao excluir usuário: {str(e)}'}
