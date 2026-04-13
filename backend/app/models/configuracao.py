"""
Model: ConfiguracaoSistema
Configurações globais (logo, impressão, etc).
Tabela singleton (sempre id=1).
"""

from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Boolean, DateTime
from app.database import Base


class ConfiguracaoSistema(Base):
    __tablename__ = 'configuracoes_sistema'

    id = Column(Integer, primary_key=True, default=1)
    url_logo = Column(String, nullable=True)
    imprimir_automatico = Column(Boolean, nullable=False, default=True)
    largura_impressao = Column(String, nullable=False, default='ticket-80mm')
    atualizado_em = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'url_logo': self.url_logo or '',
            'imprimir_automatico': self.imprimir_automatico,
            'largura_impressao': self.largura_impressao,
        }
