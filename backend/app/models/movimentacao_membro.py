"""
Model: MovimentacaoMembro
Histórico de débitos e créditos de membros.
Toda venda fiado gera um débito, todo pagamento gera um crédito.
"""

import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, Numeric, ForeignKey, Text, CheckConstraint, Index, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base


class MovimentacaoMembro(Base):
    __tablename__ = 'movimentacoes_membro'
    __table_args__ = (
        CheckConstraint("tipo_movimentacao IN ('debito','credito','ajuste')", name='movimentacoes_membro_tipo_movimentacao_check'),
        CheckConstraint("origem IN ('venda_fiado','pagamento','ajuste_manual')", name='movimentacoes_membro_origem_check'),
        CheckConstraint('valor >= 0', name='movimentacoes_membro_valor_check'),
        Index('ix_movimentacoes_membro_criado', 'membro_id', 'criado_em'),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=text('gen_random_uuid()'))
    membro_id = Column(UUID(as_uuid=True), ForeignKey('membros.id'), nullable=False)
    venda_id = Column(UUID(as_uuid=True), ForeignKey('vendas.id'), nullable=True)
    usuario_id = Column(UUID(as_uuid=True), ForeignKey('usuarios.id'), nullable=True)
    tipo_movimentacao = Column(String, nullable=False)  # 'debito', 'credito', 'ajuste'
    origem = Column(String, nullable=False)  # 'venda_fiado', 'pagamento', 'ajuste_manual'
    descricao = Column(Text, nullable=True)
    valor = Column(Numeric(), nullable=False)
    criado_em = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), server_default=text('now()'))

    # Relacionamentos
    membro = relationship('Membro', back_populates='movimentacoes')

    def to_dict(self):
        return {
            'id': str(self.id),
            'membro_id': str(self.membro_id),
            'venda_id': str(self.venda_id) if self.venda_id else None,
            'tipo_movimentacao': self.tipo_movimentacao,
            'origem': self.origem,
            'descricao': self.descricao,
            'valor': float(self.valor),
            'criado_em': self.criado_em.isoformat() if self.criado_em else None,
        }
