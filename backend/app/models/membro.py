"""
Model: Membro
Representa um membro do moto clube.
Pode ter saldo devedor (compras fiado).
"""

import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, DateTime, Numeric, CheckConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base


class Membro(Base):
    __tablename__ = 'membros'
    __table_args__ = (CheckConstraint('saldo_devedor >= 0', name='membros_saldo_devedor_check'),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=text('gen_random_uuid()'))
    nome = Column(String, nullable=False)
    saldo_devedor = Column(Numeric(), nullable=False, default=0, server_default=text('0'))
    ativo = Column(Boolean, nullable=False, default=True, server_default=text('true'))
    criado_em = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), server_default=text('now()'))
    atualizado_em = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), server_default=text('now()'))

    # Relacionamentos
    vendas = relationship('Venda', back_populates='membro')
    movimentacoes = relationship('MovimentacaoMembro', back_populates='membro', order_by='MovimentacaoMembro.criado_em.desc()')

    def to_dict(self):
        return {
            'id': str(self.id),
            'nome': self.nome,
            'saldo_devedor': float(self.saldo_devedor),
            'ativo': self.ativo,
        }
