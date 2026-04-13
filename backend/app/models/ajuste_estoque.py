"""
Model: AjusteEstoque
Registra toda alteração manual de estoque para auditoria.
"""

import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, BigInteger, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class AjusteEstoque(Base):
    __tablename__ = 'ajustes_estoque'

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    produto_id = Column(BigInteger, ForeignKey('produtos.id'), nullable=False)
    usuario_id = Column(UUID(as_uuid=True), ForeignKey('usuarios.id'), nullable=True)
    estoque_bar_anterior = Column(Integer, nullable=False)
    estoque_bar_novo = Column(Integer, nullable=False)
    estoque_deposito_anterior = Column(Integer, nullable=False)
    estoque_deposito_novo = Column(Integer, nullable=False)
    estoque_min_bar_anterior = Column(Integer, nullable=True)
    estoque_min_bar_novo = Column(Integer, nullable=True)
    estoque_min_deposito_anterior = Column(Integer, nullable=True)
    estoque_min_deposito_novo = Column(Integer, nullable=True)
    motivo = Column(Text, nullable=True)
    criado_em = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    # Relacionamentos
    produto = relationship('Produto', back_populates='ajustes_estoque')

    def to_dict(self):
        return {
            'id': str(self.id),
            'produto_id': self.produto_id,
            'estoque_bar_anterior': self.estoque_bar_anterior,
            'estoque_bar_novo': self.estoque_bar_novo,
            'estoque_deposito_anterior': self.estoque_deposito_anterior,
            'estoque_deposito_novo': self.estoque_deposito_novo,
            'motivo': self.motivo,
            'criado_em': self.criado_em.isoformat() if self.criado_em else None,
        }
