"""Fuso horário do estabelecimento, compartilhado por relatórios, extratos e filtros."""
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

try:
    FUSO = ZoneInfo('America/Sao_Paulo')
except ZoneInfoNotFoundError as error:
    raise RuntimeError(
        "Base de fusos horários ausente. Instale as dependências com "
        "'python -m pip install -r requirements-dev.txt'."
    ) from error
