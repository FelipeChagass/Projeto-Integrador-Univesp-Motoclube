"""Correções administrativas e bloqueio de reenvios offline excluídos."""
from alembic import op
import sqlalchemy as sa

revision = '0003_edicao_admin'
down_revision = '0002_integridade'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('vendas', sa.Column('versao', sa.Integer(), nullable=False, server_default='1'))
    op.add_column('movimentacoes_membro', sa.Column('versao', sa.Integer(), nullable=False, server_default='1'))
    op.add_column('caixas', sa.Column('fechamento_calculado', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_table('operacoes_excluidas', sa.Column('id_externo', sa.String(), primary_key=True))


def downgrade():
    raise RuntimeError('Esta revisão preserva bloqueios de reenvio offline; reversão exige reconciliação explícita.')
