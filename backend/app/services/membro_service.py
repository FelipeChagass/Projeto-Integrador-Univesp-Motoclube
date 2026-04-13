"""
Serviço: Membros
CRUD completo + extrato de movimentações + ajuste manual de saldo.
"""

import logging
import uuid
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.membro import Membro
from app.models.movimentacao_membro import MovimentacaoMembro

logger = logging.getLogger(__name__)


# ─── Listagem ───

def listar_membros(db: Session) -> list:
    """Retorna todos os membros ativos."""
    membros = db.query(Membro).filter_by(ativo=True).order_by(Membro.nome).all()
    return [m.to_dict() for m in membros]


def listar_todos_membros(db: Session) -> list:
    """Retorna TODOS os membros (ativos + inativos), para o admin."""
    membros = db.query(Membro).order_by(Membro.nome).all()
    return [m.to_dict() for m in membros]


def buscar_membro_por_id(db: Session, membro_id: str) -> Membro | None:
    """Busca membro por UUID."""
    try:
        uid = uuid.UUID(str(membro_id))
        return db.query(Membro).filter_by(id=uid).first()
    except (ValueError, AttributeError):
        return None


# ─── CRUD ───

def criar_membro(db: Session, dados: dict) -> dict:
    """
    Cria um novo membro.
    dados: { nome: str }
    """
    nome = (dados.get('nome') or '').strip()
    if not nome:
        return {'status': 'erro', 'mensagem': 'Nome é obrigatório.'}

    # Verifica nome único (case-insensitive)
    existente = db.query(Membro).filter(
        func.lower(Membro.nome) == nome.lower()
    ).first()
    if existente:
        return {'status': 'erro', 'mensagem': f'Já existe um membro com o nome "{existente.nome}".'}

    try:
        novo = Membro(nome=nome, saldo_devedor=0, ativo=True)
        db.add(novo)
        db.commit()
        db.refresh(novo)
        return {'status': 'ok', 'mensagem': 'Membro criado.', 'membro': novo.to_dict()}
    except Exception as e:
        db.rollback()
        logger.exception('Erro ao criar membro')
        return {'status': 'erro', 'mensagem': f'Erro ao criar membro: {str(e)}'}


def editar_membro(db: Session, membro_id: str, dados: dict) -> dict:
    """
    Edita nome e/ou status ativo de um membro.
    dados: { nome?: str, ativo?: bool }
    """
    membro = buscar_membro_por_id(db, membro_id)
    if not membro:
        return {'status': 'erro', 'mensagem': 'Membro não encontrado.'}

    try:
        if 'nome' in dados:
            novo_nome = (dados['nome'] or '').strip()
            if not novo_nome:
                return {'status': 'erro', 'mensagem': 'Nome não pode ser vazio.'}
            # Verifica duplicata
            dup = db.query(Membro).filter(
                func.lower(Membro.nome) == novo_nome.lower(),
                Membro.id != membro.id
            ).first()
            if dup:
                return {'status': 'erro', 'mensagem': f'Já existe um membro com o nome "{dup.nome}".'}
            membro.nome = novo_nome

        if 'ativo' in dados:
            membro.ativo = bool(dados['ativo'])

        db.commit()
        db.refresh(membro)
        return {'status': 'ok', 'mensagem': 'Membro atualizado.', 'membro': membro.to_dict()}
    except Exception as e:
        db.rollback()
        logger.exception('Erro ao editar membro %s', membro_id)
        return {'status': 'erro', 'mensagem': f'Erro ao editar: {str(e)}'}


def desativar_membro(db: Session, membro_id: str) -> dict:
    """Soft-delete: marca membro como inativo."""
    membro = buscar_membro_por_id(db, membro_id)
    if not membro:
        return {'status': 'erro', 'mensagem': 'Membro não encontrado.'}

    try:
        membro.ativo = False
        db.commit()
        return {'status': 'ok', 'mensagem': f'Membro "{membro.nome}" desativado.'}
    except Exception as e:
        db.rollback()
        return {'status': 'erro', 'mensagem': f'Erro: {str(e)}'}


# ─── Ajuste Manual de Saldo ───

def ajustar_saldo(db: Session, membro_id: str, valor: float,
                  tipo: str, descricao: str = '', usuario_id: str = None) -> dict:
    """
    Ajuste manual de saldo devedor do membro.
    tipo: 'credito' (abate dívida) ou 'debito' (aumenta dívida)
    """
    membro = buscar_membro_por_id(db, membro_id)
    if not membro:
        return {'status': 'erro', 'mensagem': 'Membro não encontrado.'}

    if tipo not in ('credito', 'debito'):
        return {'status': 'erro', 'mensagem': 'Tipo deve ser "credito" ou "debito".'}

    valor_dec = Decimal(str(abs(valor)))
    if valor_dec <= 0:
        return {'status': 'erro', 'mensagem': 'Valor deve ser positivo.'}

    try:
        # Atualiza saldo
        if tipo == 'credito':
            membro.saldo_devedor = max(Decimal('0'), membro.saldo_devedor - valor_dec)
        else:
            membro.saldo_devedor = membro.saldo_devedor + valor_dec

        # Registra movimentação
        mov = MovimentacaoMembro(
            membro_id=membro.id,
            usuario_id=uuid.UUID(usuario_id) if usuario_id else None,
            tipo_movimentacao=tipo,
            origem='ajuste_manual',
            descricao=descricao or f'Ajuste manual ({tipo})',
            valor=valor_dec,
        )
        db.add(mov)
        db.commit()
        db.refresh(membro)

        return {
            'status': 'ok',
            'mensagem': f'Saldo ajustado. Novo saldo: R$ {float(membro.saldo_devedor):.2f}',
            'membro': membro.to_dict(),
        }
    except Exception as e:
        db.rollback()
        logger.exception('Erro ao ajustar saldo do membro %s', membro_id)
        return {'status': 'erro', 'mensagem': f'Erro: {str(e)}'}


# ─── Extrato ───

def buscar_extrato_membro(db: Session, membro_id: str = None, nome_membro: str = None) -> dict:
    """
    Busca o extrato completo de movimentações de um membro.
    Retorna débitos e créditos formatados para o frontend.
    """
    membro = None
    if membro_id:
        membro = buscar_membro_por_id(db, membro_id)
    elif nome_membro:
        membro = db.query(Membro).filter(
            Membro.nome.ilike(nome_membro.strip()),
            Membro.ativo == True
        ).first()

    if not membro:
        return {'itens': [], 'total': 0}

    movimentacoes = db.query(MovimentacaoMembro).filter_by(
        membro_id=membro.id,
    ).order_by(MovimentacaoMembro.criado_em.desc()).all()

    itens_formatados = []
    for mov in movimentacoes:
        itens_formatados.append({
            'id': str(mov.id),
            'data': mov.criado_em.strftime('%d/%m/%Y %H:%M') if mov.criado_em else '',
            'tipo': mov.tipo_movimentacao,
            'origem': mov.origem,
            'descricao': mov.descricao or '',
            'valor': float(mov.valor),
        })

    return {
        'membro': membro.to_dict(),
        'itens': itens_formatados,
        'total': float(membro.saldo_devedor),
    }
