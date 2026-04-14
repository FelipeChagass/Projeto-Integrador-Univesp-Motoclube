from decimal import Decimal
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from app.models.caixa import Caixa


def abrir_caixa(db: Session, dados: dict) -> dict:
    """
    Abre um novo caixa.

    Args:
        dados: {
            usuario_id: str (UUID),   ← vindo da sessão
            valor_abertura: float,
        }

    Returns:
        dict com id do caixa e status
    """
    try:
        usuario_id = dados.get('usuario_id')
        if not usuario_id:
            return {'status': 'erro', 'mensagem': 'Operador não identificado. Faça login.'}

        # Verifica se já existe caixa aberto para este operador
        caixa_existente = db.query(Caixa).filter_by(
            usuario_abertura_id=usuario_id,
            status='aberto'
        ).first()

        if caixa_existente:
            return {
                'status': 'ok',
                'mensagem': 'Caixa já está aberto.',
                'caixa_id': str(caixa_existente.id),
                'valor_abertura': float(caixa_existente.valor_abertura),
            }

        valor = Decimal(str(dados.get('valor_abertura', 0)))

        caixa = Caixa(
            usuario_abertura_id=usuario_id,
            valor_abertura=valor,
            status='aberto',
        )
        db.add(caixa)
        db.commit()

        return {
            'status': 'ok',
            'mensagem': f'Caixa aberto com R$ {valor:.2f}',
            'caixa_id': str(caixa.id),
            'valor_abertura': float(valor),
        }

    except Exception as e:
        db.rollback()
        return {'status': 'erro', 'mensagem': f'Erro ao abrir caixa: {str(e)}'}


def fechar_caixa(db: Session, dados: dict) -> dict:
    """
    Fecha um caixa aberto.

    Args:
        dados: {
            caixa_id: str (UUID),
            usuario_id: str (UUID),       ← vindo da sessão
            valor_fechamento: float (opcional),
            observacoes: str (opcional),
        }
    """
    try:
        caixa_id = dados.get('caixa_id')
        if not caixa_id:
            return {'status': 'erro', 'mensagem': 'Caixa não identificado.'}

        caixa = db.query(Caixa).filter_by(id=caixa_id, status='aberto').first()
        if not caixa:
            return {'status': 'erro', 'mensagem': 'Caixa não encontrado ou já fechado.'}

        usuario_id = dados.get('usuario_id')

        caixa.status = 'fechado'
        caixa.fechado_em = datetime.now(timezone.utc)
        caixa.usuario_fechamento_id = usuario_id

        if dados.get('valor_fechamento') is not None:
            caixa.valor_fechamento = Decimal(str(dados['valor_fechamento']))

        if dados.get('observacoes'):
            caixa.observacoes = dados['observacoes']

        db.commit()

        return {
            'status': 'ok',
            'mensagem': 'Caixa fechado com sucesso!',
            'caixa': caixa.to_dict(),
        }

    except Exception as e:
        db.rollback()
        return {'status': 'erro', 'mensagem': f'Erro ao fechar caixa: {str(e)}'}


def obter_caixa_aberto(db: Session, usuario_id: str = None, caixa_id: str = None) -> dict:
    """
    Retorna o caixa aberto.

    Busca por caixa_id (se informado) ou pelo usuario_id.
    Se nenhum dos dois, retorna qualquer caixa aberto (sistema simples, um caixa por vez).
    """
    caixa = None

    if caixa_id:
        caixa = db.query(Caixa).filter_by(id=caixa_id, status='aberto').first()
    elif usuario_id:
        caixa = db.query(Caixa).filter_by(
            usuario_abertura_id=usuario_id,
            status='aberto'
        ).first()

    # Fallback: qualquer caixa aberto
    if not caixa:
        caixa = db.query(Caixa).filter_by(status='aberto').first()

    if caixa:
        return {'status': 'ok', 'caixa': caixa.to_dict()}
    return {'status': 'ok', 'caixa': None}
