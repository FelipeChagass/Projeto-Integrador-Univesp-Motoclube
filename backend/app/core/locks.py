"""Locks transacionais do PostgreSQL compartilhados entre workers."""
import hashlib

from sqlalchemy import text


def chave_id_externo(id_externo: str) -> int:
    """Chave bigint estável derivada do identificador externo. Colisões somente serializam."""
    return int.from_bytes(hashlib.sha256(id_externo.encode()).digest()[:8], 'big', signed=True)


def bloquear_id_externo(db, id_externo: str) -> None:
    db.execute(text('SELECT pg_advisory_xact_lock(:chave)'), {'chave': chave_id_externo(id_externo)})
