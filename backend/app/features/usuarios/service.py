"""
Serviço: Usuário / Perfil

O Supabase Auth cuida de cadastro, login, logout e tokens.
Este serviço gerencia a tabela 'usuarios' (perfil) e, nas rotas
administrativas, sincroniza as operacoes sensiveis com o Supabase Auth.

Vinculo atual do projeto:
    - public.usuarios.id = auth.users.id
    - nao existe coluna auth_user_id separada

Criação administrativa primeiro registra a identidade no Supabase Auth e então
cria o perfil local. Falhas parciais exigem compensação explícita.
"""

import logging
import uuid

from sqlalchemy.orm import Session
from supabase_auth.errors import AuthApiError

from app.models.usuario import Usuario
from app.core.errors import ApiError

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


def _auth_error_message() -> str:
    return 'O serviço de autenticação recusou a operação. Verifique os dados informados.'


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
        raise ApiError('NOME_OBRIGATORIO', 'Nome é obrigatório.', 422)

    uid = _parse_uuid(user_id)
    if not uid:
        raise ApiError('ID_USUARIO_INVALIDO', 'ID de usuário inválido.', 422)

    email_normalizado = _normalize_email(email)
    if not email_normalizado:
        raise ApiError('EMAIL_OBRIGATORIO', 'Email é obrigatório.', 422)

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

    except ApiError:
        raise
    except Exception:
        db.rollback()
        raise ApiError(
            'PERFIL_NAO_SALVO', 'Não foi possível salvar o perfil.', 503, retryable=True
        ) from None


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
        raise ApiError('ID_USUARIO_INVALIDO', 'ID inválido.', 422)

    operador_uid = _parse_uuid(operador_atual_id)

    usuario = db.query(Usuario).filter_by(id=uid).first()
    if not usuario:
        raise ApiError('USUARIO_NAO_ENCONTRADO', 'Usuário não encontrado.', 404)

    atualizacoes_locais = {}
    atualizacoes_auth = {}
    rollback_auth = {}

    try:
        if 'perfil' in dados:
            novo_perfil = dados['perfil']
            if novo_perfil not in ('admin', 'operador'):
                raise ApiError('PERFIL_INVALIDO', 'Perfil deve ser "admin" ou "operador".', 422)
            if operador_uid == uid and novo_perfil != 'admin':
                raise ApiError('AUTOALTERACAO_NEGADA', 'Um administrador não pode remover o próprio perfil admin.', 409)
            atualizacoes_locais['perfil'] = novo_perfil

        if 'ativo' in dados:
            novo_ativo = bool(dados['ativo'])
            if operador_uid == uid and not novo_ativo:
                raise ApiError('AUTOALTERACAO_NEGADA', 'Um administrador não pode desativar a própria conta.', 409)
            atualizacoes_locais['ativo'] = novo_ativo
            atualizacoes_auth['ban_duration'] = _ban_duration_for_status(novo_ativo)

        if 'nome' in dados:
            novo_nome = (dados['nome'] or '').strip()
            if not novo_nome:
                raise ApiError('NOME_OBRIGATORIO', 'Nome é obrigatório.', 422)
            atualizacoes_locais['nome'] = novo_nome
            atualizacoes_auth['user_metadata'] = {'nome': novo_nome}

        if 'email' in dados:
            novo_email = _normalize_email(dados.get('email'))
            if not novo_email:
                raise ApiError('EMAIL_OBRIGATORIO', 'Email é obrigatório.', 422)

            existente = db.query(Usuario).filter(
                Usuario.email == novo_email,
                Usuario.id != uid,
            ).first()
            if existente:
                raise ApiError('EMAIL_EM_USO', 'Já existe outro usuário com este email.', 409)

            atualizacoes_locais['email'] = novo_email
            atualizacoes_auth['email'] = novo_email

        if 'senha' in dados:
            nova_senha = (dados.get('senha') or '').strip()
            if nova_senha:
                if len(nova_senha) < 6:
                    raise ApiError('SENHA_INVALIDA', 'A senha deve ter pelo menos 6 caracteres.', 422)
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
    except AuthApiError:
        db.rollback()
        raise ApiError('AUTH_RECUSOU', _auth_error_message(), 400) from None
    except ApiError:
        db.rollback()
        raise
    except Exception as error:
        db.rollback()
        if atualizacoes_auth and rollback_auth:
            try:
                admin_client.auth.admin.update_user_by_id(str(usuario.id), rollback_auth)
            except Exception:
                logger.error('Falha ao reverter atualização do Auth para o usuário %s', user_id)
        logger.error('Erro ao editar usuário: tipo=%s', type(error).__name__)
        raise ApiError('USUARIO_NAO_ATUALIZADO', 'Não foi possível atualizar o usuário. Confirme o estado antes de repetir.', 503) from None

def criar_usuario_admin(db: Session, supabase_client, dados: dict) -> dict:
    """Cria user no Supabase Auth e Banco Local simultaneamente."""
    email = _normalize_email(dados.get('email'))
    senha = (dados.get('senha') or '').strip()
    nome = (dados.get('nome') or '').strip()
    perfil = dados.get('perfil', 'operador')

    if not email or not senha or not nome:
        raise ApiError('DADOS_OBRIGATORIOS', 'Nome, email e senha são obrigatórios.', 422)
    if len(senha) < 6:
        raise ApiError('SENHA_INVALIDA', 'A senha deve ter pelo menos 6 caracteres.', 422)
    if perfil not in ('admin', 'operador'):
        raise ApiError('PERFIL_INVALIDO', 'Perfil inválido.', 422)

    user_id = None
    try:
        # Usa admin API para não precisar de email de verificação
        res = supabase_client.auth.admin.create_user({
            "email": email,
            "password": senha,
            "email_confirm": True,
            "user_metadata": {"nome": nome}
        })
        if not res or not res.user:
            raise ApiError('AUTH_SEM_USUARIO', 'O serviço de autenticação não criou o usuário.', 503, retryable=True)

        user_id = str(res.user.id)
        return sincronizar_perfil(db, user_id=user_id, email=email, nome=nome, perfil=perfil)
    except AuthApiError:
        raise ApiError('AUTH_RECUSOU', _auth_error_message(), 400) from None
    except Exception as error:
        db.rollback()
        if user_id:
            try:
                supabase_client.auth.admin.delete_user(user_id)
            except Exception:
                logger.error('Falha ao reverter criação do Auth; reconciliação necessária: usuário=%s', user_id)
        if isinstance(error, ApiError):
            raise
        raise ApiError('USUARIO_NAO_CRIADO', 'Não foi possível criar o usuário. Confirme o estado antes de repetir.', 503) from None


def excluir_usuario_admin(db: Session, admin_client, operador_atual_id: str, user_id: str) -> dict:
    """Realiza soft delete no Supabase Auth e mantém o registro local inativo."""
    uid = _parse_uuid(user_id)
    if not uid:
        raise ApiError('ID_USUARIO_INVALIDO', 'ID inválido.', 422)

    operador_uid = _parse_uuid(operador_atual_id)
    if operador_uid == uid:
        raise ApiError('AUTOEXCLUSAO_NEGADA', 'Um administrador não pode excluir a própria conta.', 409)

    usuario = db.query(Usuario).filter_by(id=uid).first()
    if not usuario:
        raise ApiError('USUARIO_NAO_ENCONTRADO', 'Usuário não encontrado.', 404)

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
    except AuthApiError:
        db.rollback()
        raise ApiError('AUTH_RECUSOU', _auth_error_message(), 400) from None
    except ApiError:
        db.rollback()
        raise
    except Exception as error:
        db.rollback()
        logger.error('Erro ao excluir usuário: tipo=%s', type(error).__name__)
        raise ApiError('USUARIO_NAO_EXCLUIDO', 'Não foi possível excluir o usuário. Confirme o estado antes de repetir.', 503) from None
