"""
Model: Produto
Representa um item vendável no bar.
Possui estoque de bar e depósito separados.
"""

from datetime import datetime, timezone
from sqlalchemy import Column, BigInteger, String, Integer, Boolean, DateTime, Numeric, CheckConstraint, Identity, text
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.core.schemas import valor_em_reais


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
    itens_combo = relationship('ComboItem', foreign_keys='ComboItem.combo_id', back_populates='combo',
                               cascade='all, delete-orphan', order_by='ComboItem.produto_id')

    def tem_categoria_comida(self):
        """Verifica se o produto é estritamente da categoria comida pelo BD."""
        if not self.categoria:
            return False
        return self.categoria.strip().upper() == 'COMIDA'

    def tem_categoria_combo(self):
        """Combo não tem estoque próprio: vende e devolve os itens da composição."""
        return bool(self.categoria) and self.categoria.strip().upper() == 'COMBO'

    def disponibilidade_combo(self, campo='estoque_bar'):
        """Quantos combos o estoque atual dos itens permite montar; item inativo zera."""
        if not self.itens_combo:
            return 0
        return min((getattr(i.produto, campo) // i.quantidade) if i.produto.ativo else 0
                   for i in self.itens_combo)

    def to_dict(self):
        if self.tem_categoria_combo():
            return {
                **self._campos_base(),
                'estoque_bar': self.disponibilidade_combo('estoque_bar'),
                'estoque_deposito': self.disponibilidade_combo('estoque_deposito'),
                'estoque_min_bar': 0,
                'estoque_min_deposito': 0,
                'itens_combo': [item.to_dict() for item in self.itens_combo],
            }
        return self._campos_base()

    def _campos_base(self):
        return {
            'id': self.id,
            'nome': self.nome,
            'preco_atual': valor_em_reais(self.preco_atual),
            'estoque_bar': self.estoque_bar,
            'estoque_deposito': self.estoque_deposito,
            'url_imagem': self.url_imagem or '',
            'categoria': self.categoria or '',
            'estoque_min_bar': self.estoque_min_bar,
            'estoque_min_deposito': self.estoque_min_deposito,
            'ativo': self.ativo,
        }
