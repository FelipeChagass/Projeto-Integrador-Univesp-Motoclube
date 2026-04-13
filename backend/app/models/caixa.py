"""
Model: Caixa
Representa uma sessão de caixa (abertura → fechamento).
"""

import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, Numeric, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class Caixa(Base):
    __tablename__ = 'caixas'

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    usuario_abertura_id = Column(UUID(as_uuid=True), ForeignKey('usuarios.id'), nullable=False)
    usuario_fechamento_id = Column(UUID(as_uuid=True), ForeignKey('usuarios.id'), nullable=True)
    aberto_em = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    fechado_em = Column(DateTime(timezone=True), nullable=True)
    valor_abertura = Column(Numeric(12, 2), nullable=False, default=0)
    valor_fechamento = Column(Numeric(12, 2), nullable=True)
    status = Column(String, nullable=False, default='aberto')  # 'aberto' ou 'fechado'
    observacoes = Column(String, nullable=True)

    # Relacionamentos
    usuario_abertura = relationship('Usuario', back_populates='caixas_abertos', foreign_keys=[usuario_abertura_id])
    vendas = relationship('Venda', back_populates='caixa')

    def to_dict(self):
        return {
            'id': str(self.id),
            'usuario_abertura_id': str(self.usuario_abertura_id),
            'usuario_fechamento_id': str(self.usuario_fechamento_id) if self.usuario_fechamento_id else None,
            'aberto_em': self.aberto_em.isoformat() if self.aberto_em else None,
            'fechado_em': self.fechado_em.isoformat() if self.fechado_em else None,
            'valor_abertura': float(self.valor_abertura),
            'valor_fechamento': float(self.valor_fechamento) if self.valor_fechamento else None,
            'status': self.status,
            'observacoes': self.observacoes,
        }
