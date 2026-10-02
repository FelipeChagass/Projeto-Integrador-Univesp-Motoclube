"""Membros e saldo: ajustes atômicos e extrato paginado."""
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import unit_of_work
from app.core.errors import ApiError
from app.models.membro import Membro
from app.models.movimentacao_membro import MovimentacaoMembro
from app.models.usuario import Usuario
from app.features.membros.schemas import MembroCriacaoPayload
from app.features.membros.schemas import MembroEdicaoPayload
from app.features.membros.schemas import AjusteSaldoPayload
from app.features.membros.schemas import FiltroExtrato
from app.features.membros.extrato import consultar_extrato


def listar_membros(db: Session) -> list:
    return [m.to_dict() for m in db.query(Membro).filter_by(ativo=True).order_by(Membro.nome).all()]


def listar_todos_membros(db: Session) -> list:
    return [m.to_dict() for m in db.query(Membro).order_by(Membro.nome).all()]


def _uuid_membro(membro_id):
    try:
        return UUID(str(membro_id))
    except (ValueError, AttributeError):
        raise ApiError('MEMBRO_INVALIDO', 'Identificador de membro inválido.', 422) from None


def buscar_membro_por_id(db: Session, membro_id: str) -> Membro | None:
    return db.query(Membro).filter_by(id=_uuid_membro(membro_id)).first()


def _bloquear_membro(db, membro_id):
    membro = db.query(Membro).filter_by(id=_uuid_membro(membro_id)).populate_existing().with_for_update().first()
    if not membro:
        raise ApiError('MEMBRO_NAO_ENCONTRADO', 'Membro não encontrado.', 404)
    return membro


def _validar_nome(db, nome, membro_id=None):
    nome = nome.strip()
    if not nome:
        raise ApiError('NOME_INVALIDO', 'Nome é obrigatório.', 422)
    consulta = db.query(Membro).filter(func.lower(Membro.nome) == nome.lower())
    if membro_id:
        consulta = consulta.filter(Membro.id != membro_id)
    if consulta.first():
        raise ApiError('MEMBRO_DUPLICADO', 'Já existe membro com esse nome.', 409)
    return nome


def criar_membro(db: Session, dados: dict) -> dict:
    entrada = MembroCriacaoPayload.model_validate(dados)
    with unit_of_work(db):
        membro = Membro(nome=_validar_nome(db, entrada.nome), saldo_devedor=0, ativo=True)
        db.add(membro)
        db.flush()
        return {'status': 'ok', 'mensagem': 'Membro criado.', 'membro': membro.to_dict()}


def editar_membro(db: Session, membro_id: str, dados: dict) -> dict:
    entrada = MembroEdicaoPayload.model_validate(dados)
    with unit_of_work(db):
        membro = _bloquear_membro(db, membro_id)
        if entrada.nome is not None:
            membro.nome = _validar_nome(db, entrada.nome, membro.id)
        if entrada.ativo is not None:
            membro.ativo = entrada.ativo
        db.flush()
        return {'status': 'ok', 'mensagem': 'Membro atualizado.', 'membro': membro.to_dict()}


def excluir_membro(db: Session, membro_id: str) -> dict:
    from app.models.venda import Venda
    with unit_of_work(db):
        membro = _bloquear_membro(db, membro_id)
        if membro.saldo_devedor or db.query(Venda.id).filter_by(membro_id=membro.id).first() or db.query(MovimentacaoMembro.id).filter_by(membro_id=membro.id).first():
            raise ApiError('MEMBRO_COM_VINCULOS', 'Exclua as vendas e movimentações deste membro antes de excluir seu cadastro.', 409)
        db.delete(membro)
        return {'status': 'ok', 'mensagem': 'Membro excluído.'}


def ajustar_saldo(db: Session, membro_id: str, valor, tipo: str,
                  descricao: str = '', usuario_id: str = None) -> dict:
    entrada = AjusteSaldoPayload.model_validate(dict(membro_id=membro_id, valor=valor, tipo=tipo,
                                                     descricao=descricao, usuario_id=usuario_id))
    with unit_of_work(db):
        if not db.query(Usuario).filter_by(id=entrada.usuario_id, perfil='admin', ativo=True).first():
            raise ApiError('ACESSO_NEGADO', 'Ajuste de saldo exige administrador.', 403)
        membro = _bloquear_membro(db, entrada.membro_id)
        if not membro.ativo:
            raise ApiError('MEMBRO_INATIVO', 'Membro inativo.', 409)
        if entrada.tipo == 'credito':
            if entrada.valor > membro.saldo_devedor:
                raise ApiError('CREDITO_EXCEDE_SALDO', 'Crédito maior que a dívida atual.', 409)
            membro.saldo_devedor -= entrada.valor
        else:
            membro.saldo_devedor += entrada.valor
        db.add(MovimentacaoMembro(membro_id=membro.id, usuario_id=entrada.usuario_id,
                                 tipo_movimentacao=entrada.tipo, origem='ajuste_manual',
                                 descricao=entrada.descricao or f'Ajuste manual ({entrada.tipo})',
                                 valor=entrada.valor))
        db.flush()
        return {'status': 'ok', 'mensagem': 'Saldo ajustado.', 'membro': membro.to_dict()}


def buscar_extrato_membro(db: Session, membro_id: str = None, nome_membro: str = None,
                         limite: int = 100, offset: int = 0,
                         data_inicio=None, data_fim=None) -> dict:
    filtro = FiltroExtrato(limite=limite, offset=offset, data_inicio=data_inicio, data_fim=data_fim)
    membro = buscar_membro_por_id(db, membro_id) if membro_id else None
    if not membro_id and nome_membro:
        # Compatibilidade somente para leitura; mutações financeiras sempre exigem UUID.
        encontrados = db.query(Membro).filter(
            func.lower(Membro.nome) == nome_membro.strip().lower(), Membro.ativo.is_(True)).limit(2).all()
        if len(encontrados) > 1:
            raise ApiError('MEMBRO_AMBIGUO', 'Informe membro_id para consultar o extrato.', 409)
        membro = encontrados[0] if encontrados else None
    if not membro:
        raise ApiError('MEMBRO_NAO_ENCONTRADO', 'Membro não encontrado.', 404)
    # Um lock compartilhado mantém saldo, totais e página consistentes com as mutações
    # financeiras, que já bloqueiam este mesmo membro antes de alterar o histórico.
    membro = db.query(Membro).filter_by(id=membro.id).populate_existing().with_for_update(read=True).one()
    return consultar_extrato(db, membro, filtro)
