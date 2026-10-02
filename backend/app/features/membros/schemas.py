"""Contratos de cadastro e ajustes de saldo."""
from datetime import date
from typing import Literal
from uuid import UUID
from pydantic import BaseModel, Field, ConfigDict, field_validator, model_validator
from app.core.schemas import DinheiroPositivo, Paginacao


class FiltroExtrato(Paginacao):
    """Datas civis inclusivas; ausência das duas datas consulta todo o histórico."""
    model_config = ConfigDict(extra='forbid')
    data_inicio: date | None = None
    data_fim: date | None = None

    @field_validator('data_inicio', 'data_fim', mode='before')
    @classmethod
    def data_iso(cls, valor):
        if isinstance(valor, str):
            if len(valor) != 10 or valor[4] != '-' or valor[7] != '-':
                raise ValueError('Informe datas no formato AAAA-MM-DD.')
            return date.fromisoformat(valor)
        return valor

    @model_validator(mode='after')
    def intervalo(self):
        if bool(self.data_inicio) != bool(self.data_fim):
            raise ValueError('Informe início e fim do período.')
        if self.data_inicio and (self.data_inicio > self.data_fim or self.data_fim == date.max):
            raise ValueError('Período inválido.')
        return self

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
