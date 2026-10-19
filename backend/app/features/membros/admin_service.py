"""Correções administrativas em movimentações avulsas de membros."""
from decimal import Decimal
from typing import Literal

from pydantic import Field

from app.core.database import unit_of_work
from app.core.errors import ApiError
from app.core.financeiro import VersaoPayload, aplicar_delta_saldo, conferir_versao, efeito_no_saldo
from app.core.schemas import Dinheiro
from app.models import Membro, MovimentacaoMembro


class MovimentoEdicao(VersaoPayload):
    tipo: Literal['debito', 'credito']
    valor: Dinheiro
    descricao: str = Field(default='', max_length=1000)


def alterar_movimento(db, membro_id, movimento_id, dados, excluir=False):
    entrada = (VersaoPayload if excluir else MovimentoEdicao).model_validate(dados)
    with unit_of_work(db):
        membro = db.query(Membro).filter_by(id=membro_id).populate_existing().with_for_update().first()
        movimento = db.query(MovimentacaoMembro).filter_by(id=movimento_id, membro_id=membro_id).populate_existing().with_for_update().first()
        if not membro or not movimento:
            raise ApiError('MOVIMENTO_NAO_ENCONTRADO', 'Movimentação não encontrada.', 404)
        if movimento.venda_id:
            raise ApiError('MOVIMENTO_VINCULADO', 'Edite ou exclua a venda vinculada para recalcular todos os valores.', 409)
        conferir_versao(movimento, entrada.versao)
        anterior = efeito_no_saldo(movimento)
        novo = Decimal('0') if excluir else entrada.valor * (1 if entrada.tipo == 'debito' else -1)
        aplicar_delta_saldo(membro, novo - anterior)
        if excluir:
            db.delete(movimento)
        else:
            movimento.valor = entrada.valor
            movimento.tipo_movimentacao = entrada.tipo
            movimento.descricao = entrada.descricao
            movimento.versao += 1
        return {'status': 'ok', 'mensagem': 'Movimentação excluída.' if excluir else 'Movimentação atualizada.'}
