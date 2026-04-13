"""
Models ORM - Mapeamento das tabelas do banco de dados.

Cada classe aqui corresponde EXATAMENTE a uma tabela definida em
estrutura_novo_banco.txt. O SQLAlchemy cuida de traduzir objetos
Python em linhas no PostgreSQL.

IMPORTANTE: Estas classes NÃO criam tabelas automaticamente.
As tabelas já foram criadas no Supabase via SQL.
O SQLAlchemy apenas "mapeia" as tabelas existentes.
"""

from app.database import Base
