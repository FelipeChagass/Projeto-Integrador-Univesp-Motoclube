"""
Model: TentativaSenhaEstoque
Erros seguidos de cada operador na senha do estoque. Fica no banco, e não na memória
do processo, para o bloqueio valer em todos os workers do servidor.
"""

from datetime import datetime, timezone
from sqlalchemy import Column, Integer, DateTime, ForeignKey, text
from sqlalchemy.dialects.postgresql import UUID
from app.core.database import Base


class TentativaSenhaEstoque(Base):
    __tablename__ = 'tentativas_senha_estoque'

    usuario_id = Column(UUID(as_uuid=True), ForeignKey('usuarios.id', ondelete='CASCADE'), primary_key=True)
    falhas = Column(Integer, nullable=False, default=0, server_default=text('0'))
    bloqueado_ate = Column(DateTime(timezone=True), nullable=True)
    atualizado_em = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc),
                           server_default=text('now()'))
