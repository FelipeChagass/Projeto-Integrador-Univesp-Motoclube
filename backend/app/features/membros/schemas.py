"""Contratos de cadastro e ajustes de saldo."""
from typing import Literal
from uuid import UUID
from pydantic import BaseModel, Field
from app.core.schemas import DinheiroPositivo

class MembroCriacaoPayload(BaseModel):
    nome: str = Field(min_length=1, max_length=250)

class MembroEdicaoPayload(BaseModel):
    nome: str | None = Field(default=None, min_length=1, max_length=250)
    ativo: bool | None = Field(default=None, strict=True)

class AjusteSaldoPayload(BaseModel):
    membro_id: UUID
    usuario_id: UUID
    valor: DinheiroPositivo
    tipo: Literal['credito', 'debito']
    descricao: str = Field(default='', max_length=2000)
