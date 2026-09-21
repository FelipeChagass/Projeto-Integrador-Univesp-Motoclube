"""Contratos financeiros: identidades explícitas e dinheiro com precisão decimal."""
from datetime import date
from app.core.schemas import Dinheiro, DinheiroPositivo, Paginacao
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator



def normalizar_metodo(valor: str) -> str:
    mapa = {
        'dinheiro': 'dinheiro', 'pix': 'pix', 'fiado': 'fiado',
        'cartao_debito': 'cartao_debito', 'cartao_credito': 'cartao_credito',
        'cartão - débito': 'cartao_debito', 'cartao - debito': 'cartao_debito',
        'cartão - crédito': 'cartao_credito', 'cartao - credito': 'cartao_credito',
        'cartao': 'cartao_debito',
    }
    resultado = mapa.get(valor.strip().lower())
    if not resultado:
        raise ValueError('Método de pagamento inválido.')
    return resultado


class ItemPayload(BaseModel):
    id: int = Field(gt=0, strict=True)
    qtd: int = Field(gt=0, le=100000, strict=True)
    nome: str = Field(default='', max_length=250)
    obs: str = Field(default='', max_length=1000)


class OperacaoPayload(BaseModel):
    usuario_id: UUID
    usuario_origem_id: UUID | None = None
    caixa_id: UUID
    id_externo: str = Field(min_length=1, max_length=128)
    metodo: str = 'dinheiro'

    @field_validator('id_externo')
    @classmethod
    def validar_id(cls, valor):
        if valor != valor.strip() or not valor.strip():
            raise ValueError('Identificador externo inválido.')
        return valor

    @field_validator('metodo')
    @classmethod
    def validar_metodo(cls, valor):
        return normalizar_metodo(valor)

    @model_validator(mode='after')
    def validar_origem(self):
        if self.usuario_origem_id is not None and self.usuario_origem_id != self.usuario_id:
            raise ValueError('Operação pertence a outro operador.')
        return self


class VendaNormalPayload(OperacaoPayload):
    cliente: str = Field(default='BALCÃO', max_length=250)
    itens: list[ItemPayload] = Field(min_length=1, max_length=200)
    membro_id: UUID | None = None

    @model_validator(mode='after')
    def validar_membro(self):
        if self.metodo == 'fiado' and not self.membro_id:
            raise ValueError('Informe membro_id para venda fiada.')
        if self.metodo != 'fiado' and self.membro_id:
            raise ValueError('Membro somente é permitido em venda fiada.')
        return self


class PagamentoDividaPayload(OperacaoPayload):
    membro_id: UUID
    nome_membro: str = Field(default='', max_length=250)
    saldo_esperado: Dinheiro
    valor: DinheiroPositivo | None = None

    @field_validator('metodo')
    @classmethod
    def nao_permitir_fiado(cls, valor):
        if valor == 'fiado':
            raise ValueError('Pagamento de dívida exige recebimento efetivo.')
        return valor



class FiltroVendas(Paginacao):
    data_inicio: date | None = None
    data_fim: date | None = None
    tipo_venda: Literal['normal', 'fiado', 'recebimento_divida', 'ajuste'] | None = None

    @model_validator(mode='after')
    def intervalo(self):
        if self.data_inicio and self.data_fim and self.data_fim < self.data_inicio:
            raise ValueError('Datas em ordem inválida.')
        return self
