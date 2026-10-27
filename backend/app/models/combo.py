"""
Model: ComboItem
Composição de um produto da categoria combo: quais produtos do estoque ele
consome e quantas unidades de cada por combo vendido. O combo não tem estoque
próprio; a disponibilidade vem sempre dos itens.
"""

from sqlalchemy import Column, BigInteger, Integer, ForeignKey, CheckConstraint, Index
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.core.schemas import valor_em_reais


class ComboItem(Base):
    __tablename__ = 'combo_itens'
    __table_args__ = (
        CheckConstraint('quantidade > 0', name='combo_itens_quantidade_check'),
        CheckConstraint('combo_id <> produto_id', name='combo_itens_sem_ciclo_check'),
        Index('ix_combo_itens_produto_id', 'produto_id'),
    )

    combo_id = Column(BigInteger, ForeignKey('produtos.id', ondelete='CASCADE'), primary_key=True)
    produto_id = Column(BigInteger, ForeignKey('produtos.id'), primary_key=True)
    quantidade = Column(Integer, nullable=False)

    # Relacionamentos
    combo = relationship('Produto', foreign_keys=[combo_id], back_populates='itens_combo')
    produto = relationship('Produto', foreign_keys=[produto_id])

    def to_dict(self):
        return {
            'produto_id': self.produto_id,
            'nome': self.produto.nome if self.produto else '',
            'quantidade': self.quantidade,
            'preco_atual': valor_em_reais(self.produto.preco_atual) if self.produto else 0,
            'categoria': (self.produto.categoria or '') if self.produto else '',
            'ativo': bool(self.produto and self.produto.ativo),
        }
