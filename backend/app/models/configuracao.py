"""
Model: ConfiguracaoSistema
Configurações globais (logo, impressão, etc).
Tabela singleton (sempre id=1).
"""

from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Boolean, DateTime, CheckConstraint, text
from app.core.database import Base


class ConfiguracaoSistema(Base):
    __tablename__ = 'configuracoes_sistema'
    __table_args__ = (
        CheckConstraint('id = 1', name='configuracoes_sistema_id_check'),
        CheckConstraint("largura_impressao IN ('ticket-80mm','ticket-58mm')", name='configuracoes_sistema_largura_impressao_check'),
    )

    id = Column(Integer, primary_key=True, default=1, server_default=text('1'), autoincrement=False)
    url_logo = Column(String, nullable=True)
    imprimir_automatico = Column(Boolean, nullable=False, default=True, server_default=text('true'))
    largura_impressao = Column(String, nullable=False, default='ticket-80mm', server_default=text("'ticket-80mm'"))
    atualizado_em = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), server_default=text('now()'))

    def to_dict(self):
        return {
            'url_logo': self.url_logo or '',
            'imprimir_automatico': self.imprimir_automatico,
            'largura_impressao': self.largura_impressao,
        }
