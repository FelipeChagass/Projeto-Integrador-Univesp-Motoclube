"""
Model: Venda e ItemVenda
A venda é o registro central do sistema.
Os itens são normalizados (não mais como string "2x Heineken").
"""

import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, BigInteger, DateTime, Numeric, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class Venda(Base):
    __tablename__ = 'vendas'

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    id_externo = Column(String, unique=True, nullable=True)  # ID gerado no frontend (para evitar duplicatas)
    caixa_id = Column(UUID(as_uuid=True), ForeignKey('caixas.id'), nullable=True)
    usuario_id = Column(UUID(as_uuid=True), ForeignKey('usuarios.id'), nullable=True)
    membro_id = Column(UUID(as_uuid=True), ForeignKey('membros.id'), nullable=True)

    tipo_venda = Column(String, nullable=False)
    # Tipos: 'normal', 'fiado', 'recebimento_divida', 'ajuste'

    metodo_pagamento = Column(String, nullable=False)
    # Métodos: 'dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'fiado', 'ajuste'

    nome_cliente = Column(String, nullable=True)
    valor_total = Column(Numeric(12, 2), nullable=False)
    observacoes = Column(Text, nullable=True)
    criado_em = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    # Relacionamentos
    usuario = relationship('Usuario', back_populates='vendas', foreign_keys=[usuario_id])
    membro = relationship('Membro', back_populates='vendas')
    caixa = relationship('Caixa', back_populates='vendas')
    itens = relationship('ItemVenda', back_populates='venda', cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': str(self.id),
            'id_externo': self.id_externo,
            'caixa_id': str(self.caixa_id) if self.caixa_id else None,
            'usuario_id': str(self.usuario_id) if self.usuario_id else None,
            'membro_id': str(self.membro_id) if self.membro_id else None,
            'tipo_venda': self.tipo_venda,
            'metodo_pagamento': self.metodo_pagamento,
            'nome_cliente': self.nome_cliente,
            'valor_total': float(self.valor_total),
            'observacoes': self.observacoes,
            'criado_em': self.criado_em.isoformat() if self.criado_em else None,
            'itens': [item.to_dict() for item in self.itens] if self.itens else [],
        }


class ItemVenda(Base):
    __tablename__ = 'itens_venda'

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    venda_id = Column(UUID(as_uuid=True), ForeignKey('vendas.id'), nullable=False)
    produto_id = Column(BigInteger, ForeignKey('produtos.id'), nullable=True)
    nome_produto = Column(String, nullable=False)
    quantidade = Column(Integer, nullable=False)
    preco_unitario = Column(Numeric(12, 2), nullable=False)
    preco_total = Column(Numeric(12, 2), nullable=False)
    observacoes = Column(Text, nullable=True)

    # Relacionamentos
    venda = relationship('Venda', back_populates='itens')
    produto = relationship('Produto', back_populates='itens_venda')

    def to_dict(self):
        return {
            'id': str(self.id),
            'produto_id': self.produto_id,
            'nome_produto': self.nome_produto,
            'quantidade': self.quantidade,
            'preco_unitario': float(self.preco_unitario),
            'preco_total': float(self.preco_total),
            'observacoes': self.observacoes,
        }
