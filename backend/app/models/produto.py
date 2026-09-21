"""
Model: Produto
Representa um item vendável no bar.
Possui estoque de bar e depósito separados.
"""

from datetime import datetime, timezone
from sqlalchemy import Column, BigInteger, String, Integer, Boolean, DateTime, Numeric, CheckConstraint, Identity, text
from sqlalchemy.orm import relationship
from app.core.database import Base


class Produto(Base):
    __tablename__ = 'produtos'
    __table_args__ = tuple(
        CheckConstraint(f'{column} >= 0', name=f'produtos_{column}_check')
        for column in ('preco_atual', 'estoque_bar', 'estoque_deposito', 'estoque_min_bar', 'estoque_min_deposito')
    )

    id = Column(BigInteger, Identity(always=True), primary_key=True)
    nome = Column(String, nullable=False)
    preco_atual = Column(Numeric(), nullable=False)
    estoque_bar = Column(Integer, nullable=False, default=0, server_default=text('0'))
    estoque_deposito = Column(Integer, nullable=False, default=0, server_default=text('0'))
    url_imagem = Column(String, nullable=True)
    categoria = Column(String, nullable=True)
    estoque_min_bar = Column(Integer, nullable=False, default=0, server_default=text('0'))
    estoque_min_deposito = Column(Integer, nullable=False, default=0, server_default=text('0'))
    ativo = Column(Boolean, nullable=False, default=True, server_default=text('true'))
    criado_em = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), server_default=text('now()'))
    atualizado_em = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), server_default=text('now()'))

    # Relacionamentos
    itens_venda = relationship('ItemVenda', back_populates='produto')
    ajustes_estoque = relationship('AjusteEstoque', back_populates='produto')

    def is_comida(self):
        """Verifica se o produto é estritamente da categoria comida pelo BD."""
        if not self.categoria:
            return False
        return self.categoria.strip().upper() == 'COMIDA'

    def to_dict(self):
        return {
            'id': self.id,
            'nome': self.nome,
            'preco_atual': float(self.preco_atual),
            'estoque_bar': self.estoque_bar,
            'estoque_deposito': self.estoque_deposito,
            'url_imagem': self.url_imagem or '',
            'categoria': self.categoria or '',
            'estoque_min_bar': self.estoque_min_bar,
            'estoque_min_deposito': self.estoque_min_deposito,
            'ativo': self.ativo,
        }
