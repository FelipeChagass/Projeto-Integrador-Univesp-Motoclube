from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator

class UsuarioPayload(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    nome: str | None = Field(default=None, min_length=1, max_length=200)
    email: str | None = Field(default=None, min_length=3, max_length=254)
    senha: str | None = Field(default=None, max_length=128)
    perfil: Literal['admin', 'operador'] | None = None
    ativo: bool | None = Field(default=None, strict=True)

    @field_validator('email')
    @classmethod
    def email_basico(cls, value):
        if value and ('@' not in value or any(c.isspace() for c in value)):
            raise ValueError('Email inválido.')
        return value.lower() if value else value
