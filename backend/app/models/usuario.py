"""
Model: Usuario (Perfil)

Representa o perfil de um operador/admin do sistema.
O UUID do id é o MESMO do auth.users do Supabase — a autenticação
(senha, email verify, tokens) é 100% responsabilidade do Supabase Auth.

Esta tabela guarda apenas dados de perfil: nome, perfil (operador/admin),
e status ativo. É criada/sincronizada via POST /api/auth/sincronizar
logo após o signup no frontend.

Schema do banco:
  id uuid primary key references auth.users(id)
  nome text not null
  email varchar not null unique
  perfil text not null default 'operador'
  ativo boolean not null default true
  criado_em timestamptz
  atualizado_em timestamptz
"""

from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class Usuario(Base):
    __tablename__ = 'usuarios'

    # ID = mesmo UUID do auth.users (FK gerenciada no Supabase)
    id = Column(UUID(as_uuid=True), primary_key=True)
    nome = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False)
    perfil = Column(String, nullable=False, default='operador')  # 'admin' ou 'operador'
    ativo = Column(Boolean, nullable=False, default=True)
    criado_em = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    atualizado_em = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    # Relacionamentos
    vendas = relationship('Venda', back_populates='usuario', foreign_keys='Venda.usuario_id')
    caixas_abertos = relationship('Caixa', back_populates='usuario_abertura', foreign_keys='Caixa.usuario_abertura_id')

    def to_dict(self):
        """Converte para dicionário (para retornar na API)."""
        return {
            'id': str(self.id),
            'nome': self.nome,
            'email': self.email,
            'perfil': self.perfil,
            'ativo': self.ativo,
        }
