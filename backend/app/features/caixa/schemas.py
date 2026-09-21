"""Contratos de abertura e fechamento de caixa."""
from decimal import Decimal
from uuid import UUID
from pydantic import BaseModel, Field
from app.core.schemas import Dinheiro

class AberturaCaixaPayload(BaseModel):
    usuario_id: UUID
    valor_abertura: Dinheiro = Decimal('0')

class FechamentoCaixaPayload(BaseModel):
    usuario_id: UUID
    caixa_id: UUID
    valor_fechamento: Dinheiro | None = None
    observacoes: str = Field(default='', max_length=2000)
