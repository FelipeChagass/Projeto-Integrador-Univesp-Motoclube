"""Tipos compartilhados de valor monetário e paginação."""
from decimal import Decimal
from typing import Annotated
from pydantic import BaseModel, Field

Dinheiro = Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=2, allow_inf_nan=False)]
DinheiroPositivo = Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=2, allow_inf_nan=False)]

class Paginacao(BaseModel):
    limite: int = Field(default=100, ge=1, le=500)
    offset: int = Field(default=0, ge=0)
