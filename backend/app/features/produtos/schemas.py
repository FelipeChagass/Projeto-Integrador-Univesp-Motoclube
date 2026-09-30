"""Contratos de produtos e estoque."""
from uuid import UUID
from pydantic import BaseModel, Field, model_validator
from app.core.schemas import Dinheiro

class ProdutoCriacaoPayload(BaseModel):
    nome: str = Field(min_length=1, max_length=250)
    preco_atual: Dinheiro
    categoria: str = Field(default='bebida', max_length=100)
    url_imagem: str = Field(default='', max_length=2000)
    estoque_bar: int = Field(default=0, ge=0, strict=True)
    estoque_deposito: int = Field(default=0, ge=0, strict=True)
    estoque_min_bar: int = Field(default=0, ge=0, strict=True)
    estoque_min_deposito: int = Field(default=0, ge=0, strict=True)

class ProdutoEdicaoPayload(BaseModel):
    produto_id: int = Field(gt=0)
    nome: str | None = Field(default=None, min_length=1, max_length=250)
    preco_atual: Dinheiro | None = None
    categoria: str | None = Field(default=None, max_length=100)
    url_imagem: str | None = Field(default=None, max_length=2000)
    estoque_min_bar: int | None = Field(default=None, ge=0, strict=True)
    estoque_min_deposito: int | None = Field(default=None, ge=0, strict=True)
    ativo: bool | None = Field(default=None, strict=True)

class EstoquePayload(BaseModel):
    produto_id: int = Field(gt=0)
    usuario_id: UUID
    senha_estoque: str | None = Field(default=None, min_length=1, max_length=256)
    estoque_bar: int | None = Field(default=None, ge=0, strict=True)
    estoque_deposito: int | None = Field(default=None, ge=0, strict=True)
    estoque_min_bar: int | None = Field(default=None, ge=0, strict=True)
    estoque_min_deposito: int | None = Field(default=None, ge=0, strict=True)
    estoque_bar_esperado: int | None = Field(default=None, ge=0, strict=True)
    estoque_deposito_esperado: int | None = Field(default=None, ge=0, strict=True)
    delta_bar: int | None = Field(default=None, strict=True)
    delta_deposito: int | None = Field(default=None, strict=True)
    auto_transferir: bool = Field(default=False, strict=True)
    motivo: str = Field(default='Ajuste manual via sistema', max_length=2000)

    @model_validator(mode='after')
    def proteger_atualizacao(self):
        absoluto = self.estoque_bar is not None or self.estoque_deposito is not None
        delta = self.delta_bar is not None or self.delta_deposito is not None
        if absoluto and delta:
            raise ValueError('Não misture estoque absoluto e variação.')
        if absoluto and (self.estoque_bar_esperado is None or self.estoque_deposito_esperado is None):
            raise ValueError('Ajuste absoluto exige os dois estoques esperados.')
        if self.auto_transferir and self.delta_deposito is not None:
            raise ValueError('Transferência automática não aceita variação do depósito.')
        return self
