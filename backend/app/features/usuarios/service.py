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


def _validar_dados_perfil(user_id, email, nome) -> tuple[uuid.UUID, str, str]:
    """Valida nome → id → email, nesta ordem; devolve (uid, email normalizado, nome)."""
    nome = (nome or '').strip()
    if not nome:
        raise ApiError('NOME_OBRIGATORIO', 'Nome é obrigatório.', 422)

    uid = _parse_uuid(user_id)
    if not uid:
        raise ApiError('ID_USUARIO_INVALIDO', 'ID de usuário inválido.', 422)

    email_normalizado = _normalize_email(email)
    if not email_normalizado:
        raise ApiError('EMAIL_OBRIGATORIO', 'Email é obrigatório.', 422)
    return uid, email_normalizado, nome


def _atualizar_perfil_existente(db: Session, existente: Usuario, nome: str, email: str) -> dict:
    """Atualiza só nome e email, e só confirma se algo mudou; perfil e status são preservados."""
    mudou = False
    if existente.nome != nome:
        existente.nome = nome
        mudou = True
    if existente.email != email:
        existente.email = email
        mudou = True
    if mudou:
        db.commit()
        db.refresh(existente)
    return {'status': 'ok', 'usuario': existente.to_dict()}


def _criar_perfil(db: Session, uid: uuid.UUID, nome: str, email: str, perfil: str) -> dict:
    novo = Usuario(
        id=uid,
        nome=nome,
        email=email,
        perfil=perfil,
        ativo=True,
    )
    db.add(novo)
    db.commit()
    db.refresh(novo)
    return {'status': 'ok', 'usuario': novo.to_dict()}


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
    uid, email_normalizado, nome = _validar_dados_perfil(user_id, email, nome)
    try:
        existente = db.query(Usuario).filter_by(id=uid).first()
        if existente:
            return _atualizar_perfil_existente(db, existente, nome, email_normalizado)
        return _criar_perfil(db, uid, nome, email_normalizado, perfil)
    except ApiError:
        raise
    except Exception:
        db.rollback()
        raise ApiError(
            'PERFIL_NAO_SALVO', 'Não foi possível salvar o perfil.', 503, retryable=True
        ) from None


# ─── Admin Operations ───

def listar_todos(db: Session) -> list:
    """Retorna TODOS os usuários (ativos + inativos), para o admin."""
    usuarios = db.query(Usuario).order_by(Usuario.nome).all()
    return [u.to_dict() for u in usuarios]


def _alterar_perfil(dados: dict, autoalteracao: bool, locais: dict) -> None:
    if 'perfil' in dados:
        novo_perfil = dados['perfil']
        if novo_perfil not in ('admin', 'operador'):
            raise ApiError('PERFIL_INVALIDO', 'Perfil deve ser "admin" ou "operador".', 422)
        if autoalteracao and novo_perfil != 'admin':
            raise ApiError('AUTOALTERACAO_NEGADA', 'Um administrador não pode remover o próprio perfil admin.', 409)
        locais['perfil'] = novo_perfil


def _alterar_ativo(dados: dict, autoalteracao: bool, locais: dict, auth: dict) -> None:
    if 'ativo' in dados:
        novo_ativo = bool(dados['ativo'])
        if autoalteracao and not novo_ativo:
            raise ApiError('AUTOALTERACAO_NEGADA', 'Um administrador não pode desativar a própria conta.', 409)
        locais['ativo'] = novo_ativo
        auth['ban_duration'] = _ban_duration_for_status(novo_ativo)


def _alterar_nome(dados: dict, locais: dict, auth: dict) -> None:
    if 'nome' in dados:
        novo_nome = (dados['nome'] or '').strip()
        if not novo_nome:
            raise ApiError('NOME_OBRIGATORIO', 'Nome é obrigatório.', 422)
        locais['nome'] = novo_nome
        auth['user_metadata'] = {'nome': novo_nome}


def _alterar_email(db: Session, uid: uuid.UUID, dados: dict, locais: dict, auth: dict) -> None:
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

        locais['email'] = novo_email
        auth['email'] = novo_email


def _alterar_senha(dados: dict, auth: dict) -> None:
    if 'senha' in dados:
        nova_senha = (dados.get('senha') or '').strip()
        if nova_senha:
            if len(nova_senha) < 6:
                raise ApiError('SENHA_INVALIDA', 'A senha deve ter pelo menos 6 caracteres.', 422)
            auth['password'] = nova_senha


def _coletar_alteracoes(db: Session, uid: uuid.UUID, autoalteracao: bool, dados: dict) -> tuple[dict, dict]:
    """Valida os campos na ordem perfil → ativo → nome → email → senha; devolve (locais, auth)."""
    locais, auth = {}, {}
    _alterar_perfil(dados, autoalteracao, locais)
    _alterar_ativo(dados, autoalteracao, locais, auth)
    _alterar_nome(dados, locais, auth)
    _alterar_email(db, uid, dados, locais, auth)
    _alterar_senha(dados, auth)
    return locais, auth


def _valores_para_reverter_auth(usuario: Usuario, atualizacoes_auth: dict) -> dict:
    """Estado atual no Auth dos campos que serão alterados (senha não é reversível)."""
    rollback_auth = {}
    if 'email' in atualizacoes_auth:
        rollback_auth['email'] = usuario.email
    if 'user_metadata' in atualizacoes_auth:
        rollback_auth['user_metadata'] = {'nome': usuario.nome}
    if 'ban_duration' in atualizacoes_auth:
        rollback_auth['ban_duration'] = _ban_duration_for_status(usuario.ativo)
    return rollback_auth


def _reverter_auth(admin_client, usuario: Usuario, rollback_auth: dict, user_id: str) -> None:
    try:
        admin_client.auth.admin.update_user_by_id(str(usuario.id), rollback_auth)
    except Exception:
        logger.error('Falha ao reverter atualização do Auth para o usuário %s', user_id)


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

    atualizacoes_auth = {}
    rollback_auth = {}

    try:
        atualizacoes_locais, atualizacoes_auth = _coletar_alteracoes(db, uid, operador_uid == uid, dados)

        if not atualizacoes_locais and not atualizacoes_auth:
            return {'status': 'ok', 'mensagem': 'Nenhuma alteração enviada.', 'usuario': usuario.to_dict()}

        rollback_auth = _valores_para_reverter_auth(usuario, atualizacoes_auth)

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
            _reverter_auth(admin_client, usuario, rollback_auth, user_id)
        logger.error('Erro ao editar usuário: tipo=%s', type(error).__name__)
        raise ApiError('USUARIO_NAO_ATUALIZADO', 'Não foi possível atualizar o usuário. Confirme o estado antes de repetir.', 503) from None

def _validar_novo_usuario(dados: dict) -> tuple[str, str, str, str]:
    """Devolve (email, senha, nome, perfil) normalizados; nada é enviado ao Auth antes disso."""
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
    return email, senha, nome, perfil


def _criar_identidade_auth(supabase_client, email: str, senha: str, nome: str) -> str:
    # Usa admin API para não precisar de email de verificação
    res = supabase_client.auth.admin.create_user({
        "email": email,
        "password": senha,
        "email_confirm": True,
        "user_metadata": {"nome": nome}
    })
    if not res or not res.user:
        raise ApiError('AUTH_SEM_USUARIO', 'O serviço de autenticação não criou o usuário.', 503, retryable=True)
    return str(res.user.id)


def _remover_identidade_auth(supabase_client, user_id: str) -> None:
    try:
        supabase_client.auth.admin.delete_user(user_id)
    except Exception:
        logger.error('Falha ao reverter criação do Auth; reconciliação necessária: usuário=%s', user_id)


def criar_usuario_admin(db: Session, supabase_client, dados: dict) -> dict:
    """Cria user no Supabase Auth e Banco Local simultaneamente."""
    email, senha, nome, perfil = _validar_novo_usuario(dados)
    user_id = None
    try:
        user_id = _criar_identidade_auth(supabase_client, email, senha, nome)
        return sincronizar_perfil(db, user_id=user_id, email=email, nome=nome, perfil=perfil)
    except AuthApiError:
        raise ApiError('AUTH_RECUSOU', _auth_error_message(), 400) from None
    except Exception as error:
        db.rollback()
        if user_id:
            _remover_identidade_auth(supabase_client, user_id)
        if isinstance(error, ApiError):
            raise
        raise ApiError('USUARIO_NAO_CRIADO', 'Não foi possível criar o usuário. Confirme o estado antes de repetir.', 503) from None


def excluir_usuario_admin(db: Session, admin_client, operador_atual_id: str, user_id: str) -> dict:
    """Exclui o perfil e a identidade sem apagar registros financeiros por cascata."""
    uid = _parse_uuid(user_id)
    if not uid:
        raise ApiError('ID_USUARIO_INVALIDO', 'ID inválido.', 422)

    operador_uid = _parse_uuid(operador_atual_id)
    if operador_uid == uid:
        raise ApiError('AUTOEXCLUSAO_NEGADA', 'Um administrador não pode excluir a própria conta.', 409)

    usuario = db.query(Usuario).filter_by(id=uid).first()
    if not usuario:
        raise ApiError('USUARIO_NAO_ENCONTRADO', 'Usuário não encontrado.', 404)

    from app.models import Caixa, Venda, MovimentacaoMembro, AjusteEstoque
    from sqlalchemy import or_
    if (db.query(Caixa.id).filter(or_(Caixa.usuario_abertura_id == uid, Caixa.usuario_fechamento_id == uid)).first()
            or db.query(Venda.id).filter_by(usuario_id=uid).first()
            or db.query(MovimentacaoMembro.id).filter_by(usuario_id=uid).first()
            or db.query(AjusteEstoque.id).filter_by(usuario_id=uid).first()):
        raise ApiError('USUARIO_COM_VINCULOS', 'Usuário vinculado a caixas ou registros operacionais. Sua exclusão exige reconciliar esses registros primeiro.', 409)
    # Auth usa outra conexão ao mesmo PostgreSQL. Seu DELETE não pode aguardar
    # nosso perfil ainda não confirmado (FK usuarios.id -> auth.users.id).
    fotografia = {coluna.name: getattr(usuario, coluna.name) for coluna in Usuario.__table__.columns}
    perfil_excluido = False

    def restaurar_perfil():
        db.rollback()
        if perfil_excluido:
            try:
                db.add(Usuario(**fotografia))
                db.commit()
            except Exception:
                db.rollback()
                logger.error('Exclusão de usuário requer reconciliação entre Auth e perfil: %s', uid)

    try:
        db.delete(usuario)
        db.commit()  # Valida vínculos e libera a FK antes de chamar o Auth.
        perfil_excluido = True
        try:
            admin_client.auth.admin.delete_user(str(uid), should_soft_delete=False)
        except AuthApiError as error:
            if str(getattr(error, 'status', '')) != '404':
                raise
        return {
            'status': 'ok',
            'mensagem': 'Usuário excluído.',
        }
    except AuthApiError:
        restaurar_perfil()
        raise ApiError('AUTH_RECUSOU', _auth_error_message(), 400) from None
    except ApiError:
        restaurar_perfil()
        raise
    except Exception as error:
        restaurar_perfil()
        logger.error('Erro ao excluir usuário: tipo=%s', type(error).__name__)
        raise ApiError('USUARIO_NAO_EXCLUIDO', 'Não foi possível excluir o usuário. Confirme o estado antes de repetir.', 503) from None
