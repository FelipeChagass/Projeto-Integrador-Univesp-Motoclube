"""Regras de edição compartilhadas por vendas e membros: versão otimista e saldo devedor."""
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.core.errors import ApiError


class VersaoPayload(BaseModel):
    model_config = ConfigDict(extra='forbid')
    versao: int = Field(ge=1)


def conferir_versao(registro, versao):
    if registro.versao != versao:
        raise ApiError('REGISTRO_ALTERADO', 'Registro alterado por outro usuário. Atualize a tela e tente novamente.', 409)


def aplicar_delta_saldo(membro, delta):
    novo = Decimal(membro.saldo_devedor) + delta
    if novo < 0:
        raise ApiError('SALDO_NEGATIVO', 'A alteração excede a dívida atual. Corrija os recebimentos vinculados antes de continuar.', 409)
    membro.saldo_devedor = novo


def efeito_no_saldo(movimento):
    if movimento.tipo_movimentacao not in ('debito', 'credito'):
        raise ApiError('MOVIMENTO_AMBIGUO', 'Movimentação histórica sem direção de saldo. Reconcilie antes de alterar.', 409)
    return Decimal(movimento.valor) * (1 if movimento.tipo_movimentacao == 'debito' else -1)
