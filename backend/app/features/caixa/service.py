"""Caixas: dono explícito, abertura serializada e fechamento transacional."""
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import unit_of_work
from app.core.errors import ApiError
from app.models.caixa import Caixa
from app.models.usuario import Usuario
from app.models.venda import Venda
from app.features.caixa.schemas import AberturaCaixaPayload
from app.features.caixa.schemas import FechamentoCaixaPayload


def bloquear_caixa_autorizado(db, caixa_id, usuario_id, *, permitir_admin=False, exigir_aberto=True):
    caixa = db.query(Caixa).filter_by(id=caixa_id).populate_existing().with_for_update().first()
    if not caixa:
        raise ApiError('CAIXA_NAO_ENCONTRADO', 'Caixa não encontrado.', 404)
    autorizado = str(caixa.usuario_abertura_id) == str(usuario_id)
    if not autorizado and permitir_admin:
        autorizado = db.query(Usuario).filter_by(id=usuario_id, perfil='admin', ativo=True).first() is not None
    if not autorizado:
        raise ApiError('CAIXA_NAO_AUTORIZADO', 'Caixa pertence a outro operador.', 403)
    if exigir_aberto and caixa.status != 'aberto':
        raise ApiError('CAIXA_FECHADO', 'Caixa já está fechado.', 409)
    return caixa


def abrir_caixa(db: Session, dados: dict) -> dict:
    entrada = AberturaCaixaPayload.model_validate(dados)
    with unit_of_work(db):
        # A linha do operador existe antes do primeiro caixa; evita phantom inserts.
        usuario = db.query(Usuario).filter_by(id=entrada.usuario_id).populate_existing().with_for_update().first()
        if not usuario or not usuario.ativo:
            raise ApiError('USUARIO_INATIVO', 'Operador não autorizado.', 403)
        existente = db.query(Caixa).filter_by(usuario_abertura_id=entrada.usuario_id, status='aberto').first()
        if existente:
            return {'status': 'ok', 'mensagem': 'Caixa já está aberto.',
                    'caixa_id': str(existente.id), 'valor_abertura': float(existente.valor_abertura)}
        caixa = Caixa(usuario_abertura_id=entrada.usuario_id, valor_abertura=entrada.valor_abertura, status='aberto')
        db.add(caixa)
        db.flush()
        return {'status': 'ok', 'mensagem': 'Caixa aberto.', 'caixa_id': str(caixa.id),
                'valor_abertura': float(caixa.valor_abertura)}


def fechar_caixa(db: Session, dados: dict) -> dict:
    entrada = FechamentoCaixaPayload.model_validate(dados)
    with unit_of_work(db):
        caixa = bloquear_caixa_autorizado(db, entrada.caixa_id, entrada.usuario_id, permitir_admin=True)
        valor = entrada.valor_fechamento
        if valor is None:
            recebimentos = db.query(func.coalesce(func.sum(Venda.valor_total), 0)).filter(
                Venda.caixa_id == caixa.id, Venda.metodo_pagamento == 'dinheiro',
                Venda.tipo_venda.in_(['normal', 'recebimento_divida'])).scalar()
            valor = Decimal(caixa.valor_abertura) + Decimal(recebimentos)
        caixa.status = 'fechado'
        caixa.fechado_em = datetime.now(timezone.utc)
        caixa.usuario_fechamento_id = entrada.usuario_id
        caixa.valor_fechamento = valor
        caixa.observacoes = entrada.observacoes.strip() or 'Fechamento realizado sem observações.'
        db.flush()
        return {'status': 'ok', 'mensagem': 'Caixa fechado.', 'caixa_id': str(caixa.id), 'caixa': caixa.to_dict()}


def obter_caixa_aberto(db: Session, usuario_id: str = None, caixa_id: str = None) -> dict:
    if not usuario_id:
        raise ApiError('USUARIO_NAO_IDENTIFICADO', 'Operador não identificado.', 401)
    usuario_uuid = UUID(str(usuario_id))
    if caixa_id:
        try:
            caixa_uuid = UUID(str(caixa_id))
        except ValueError:
            raise ApiError('CAIXA_INVALIDO', 'Identificador de caixa inválido.', 422) from None
        caixa = db.query(Caixa).filter_by(id=caixa_uuid).first()
        if caixa and str(caixa.usuario_abertura_id) != str(usuario_uuid):
            raise ApiError('CAIXA_NAO_AUTORIZADO', 'Caixa pertence a outro operador.', 403)
        if caixa and caixa.status != 'aberto':
            caixa = None
    else:
        caixa = db.query(Caixa).filter_by(usuario_abertura_id=usuario_uuid, status='aberto').first()
    return {'status': 'ok', 'caixa': caixa.to_dict() if caixa else None}
