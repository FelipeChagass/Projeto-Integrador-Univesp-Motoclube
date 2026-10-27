"""Tipos compartilhados de valor monetário e paginação."""
from decimal import Decimal, ROUND_HALF_UP
from typing import Annotated
from pydantic import BaseModel, Field

Dinheiro = Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=2, allow_inf_nan=False)]
DinheiroPositivo = Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=2, allow_inf_nan=False)]


def valor_em_reais(valor) -> Decimal | None:
    """Valor monetário para resposta: Decimal com 2 casas, sem passar por float."""
    if valor is None:
        return None
    return Decimal(valor).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

class Paginacao(BaseModel):
    limite: int = Field(default=100, ge=1, le=500)
    offset: int = Field(default=0, ge=0)
