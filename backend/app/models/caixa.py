"""
Model: Caixa
Representa uma sessão de caixa (abertura → fechamento).
"""

import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, Numeric, ForeignKey, CheckConstraint, Index, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base


class Caixa(Base):
    __tablename__ = 'caixas'
    __table_args__ = (
        CheckConstraint('valor_abertura >= 0', name='caixas_valor_abertura_check'),
        CheckConstraint('valor_fechamento IS NULL OR valor_fechamento >= 0', name='caixas_valor_fechamento_check'),
        CheckConstraint("status IN ('aberto','fechado')", name='caixas_status_check'),
        Index('uq_caixas_usuario_aberto', 'usuario_abertura_id', unique=True, postgresql_where=text("status = 'aberto'")),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=text('gen_random_uuid()'))
    usuario_abertura_id = Column(UUID(as_uuid=True), ForeignKey('usuarios.id'), nullable=False)
    usuario_fechamento_id = Column(UUID(as_uuid=True), ForeignKey('usuarios.id'), nullable=True)
    aberto_em = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), server_default=text('now()'))
    fechado_em = Column(DateTime(timezone=True), nullable=True)
    valor_abertura = Column(Numeric(), nullable=False, default=0, server_default=text('0'))
    valor_fechamento = Column(Numeric(), nullable=True)
    status = Column(String, nullable=False, default='aberto', server_default=text("'aberto'"))
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
            'valor_fechamento': float(self.valor_fechamento) if self.valor_fechamento is not None else None,
            'status': self.status,
            'observacoes': self.observacoes,
        }
