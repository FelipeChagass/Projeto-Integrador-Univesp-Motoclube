from typing import Literal
from urllib.parse import urlsplit
from pydantic import BaseModel, ConfigDict, Field, field_validator

class ConfigPayload(BaseModel):
    model_config = ConfigDict(extra='forbid')
    url_logo: str | None = Field(default=None, max_length=2000)
    imprimir_automatico: bool | None = Field(default=None, strict=True)
    largura_impressao: Literal['ticket-80mm', 'ticket-58mm'] | None = None

    @field_validator('url_logo')
    @classmethod
    def url_segura(cls, value):
        if value and not (value.startswith('/static/') or urlsplit(value).scheme in ('https', 'http')):
            raise ValueError('URL inválida.')
        return value
