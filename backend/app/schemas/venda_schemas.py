"""
Schemas Pydantic para validação de entrada nas funções do venda_service.

Estes modelos substituem o `dados: dict` genérico, tornando o contrato
de entrada explícito, documentado e validado automaticamente.
"""

from pydantic import BaseModel, Field, field_validator
from typing import List, Optional


class ItemPayload(BaseModel):
    """Representa um item individual dentro de uma venda."""
    id: int
    qtd: int
    nome: str = ""
    obs: str = ""

    @field_validator('qtd')
    @classmethod
    def qtd_deve_ser_positiva(cls, v: int) -> int:
        if v < 1:
            raise ValueError('A quantidade deve ser pelo menos 1.')
        return v


class VendaNormalPayload(BaseModel):
    """Payload de entrada para uma venda de pagamento imediato."""
    usuario_id: Optional[str] = None
    caixa_id: Optional[str] = None
    id_externo: Optional[str] = None
    metodo: str = "DINHEIRO"
    cliente: str = "BALCÃO"
    itens: List[ItemPayload] = Field(default_factory=list)


class VendaFiadoPayload(VendaNormalPayload):
    """
    Payload de entrada para uma venda fiado.

    Herda de VendaNormalPayload e adiciona o campo opcional `membro_id`.
    Quando `membro_id` não é fornecido, o serviço tenta resolver o membro
    pelo campo `cliente` (busca textual por nome).
    """
    membro_id: Optional[str] = None


class PagamentoDividaPayload(BaseModel):
    """Payload de entrada para registrar o pagamento de uma dívida de membro."""
    usuario_id: Optional[str] = None
    caixa_id: Optional[str] = None
    membro_id: Optional[str] = None
    nome_membro: str = ""
    metodo: str = "DINHEIRO"
