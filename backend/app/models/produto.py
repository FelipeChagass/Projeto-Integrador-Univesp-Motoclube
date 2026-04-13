"""
Model: Produto
Representa um item vendável no bar.
Possui estoque de bar e depósito separados.
"""

from datetime import datetime, timezone
from sqlalchemy import Column, BigInteger, String, Integer, Boolean, DateTime, Numeric
from sqlalchemy.orm import relationship
from app.database import Base


class Produto(Base):
    __tablename__ = 'produtos'

    id = Column(BigInteger, primary_key=True)
    nome = Column(String, nullable=False)
    preco_atual = Column(Numeric(12, 2), nullable=False)
    estoque_bar = Column(Integer, nullable=False, default=0)
    estoque_deposito = Column(Integer, nullable=False, default=0)
    url_imagem = Column(String, nullable=True)
    categoria = Column(String, nullable=True)
    estoque_min_bar = Column(Integer, nullable=False, default=0)
    estoque_min_deposito = Column(Integer, nullable=False, default=0)
    ativo = Column(Boolean, nullable=False, default=True)
    criado_em = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    atualizado_em = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

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
