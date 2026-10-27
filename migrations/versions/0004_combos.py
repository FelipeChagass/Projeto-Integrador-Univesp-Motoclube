"""Combos: composição por produto e fotografia dos itens consumidos em cada venda."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = '0004_combos'
down_revision = '0003_edicao_admin'
branch_labels = None
depends_on = None

TABELAS = ('combo_itens', 'itens_venda_componentes')


def upgrade():
    op.create_table(
        'combo_itens',
        sa.Column('combo_id', sa.BigInteger(), sa.ForeignKey('produtos.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('produto_id', sa.BigInteger(), sa.ForeignKey('produtos.id'), primary_key=True),
        sa.Column('quantidade', sa.Integer(), nullable=False),
        sa.CheckConstraint('quantidade > 0', name='combo_itens_quantidade_check'),
        sa.CheckConstraint('combo_id <> produto_id', name='combo_itens_sem_ciclo_check'),
    )
    op.create_index('ix_combo_itens_produto_id', 'combo_itens', ['produto_id'])
    op.create_table(
        'itens_venda_componentes',
        sa.Column('item_venda_id', UUID(as_uuid=True), sa.ForeignKey('itens_venda.id', ondelete='CASCADE'),
                  primary_key=True),
        sa.Column('produto_id', sa.BigInteger(), sa.ForeignKey('produtos.id'), primary_key=True),
        sa.Column('quantidade', sa.Integer(), nullable=False),
        sa.CheckConstraint('quantidade > 0', name='itens_venda_componentes_quantidade_check'),
    )
    op.create_index('ix_itens_venda_componentes_produto_id', 'itens_venda_componentes', ['produto_id'])
    # Mesma postura das demais tabelas: dados só pelo Flask; Data API do Supabase bloqueada.
    for tabela in TABELAS:
        op.execute(f'ALTER TABLE {tabela} ENABLE ROW LEVEL SECURITY')
        op.execute(f'REVOKE ALL ON TABLE {tabela} FROM PUBLIC')
    op.execute(f"""
        DO $revoke$
        DECLARE papel text;
        BEGIN
            FOREACH papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
                IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
                    EXECUTE format('REVOKE ALL ON TABLE {', '.join(TABELAS)} FROM %I', papel);
                END IF;
            END LOOP;
        END
        $revoke$
    """)


def downgrade():
    raise RuntimeError('Remover combos apaga a fotografia usada para devolver estoque de vendas antigas.')
