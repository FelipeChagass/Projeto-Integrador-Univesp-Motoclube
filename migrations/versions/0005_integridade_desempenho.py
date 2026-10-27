"""Nome de membro único, índices de vínculos e limite de tentativas da senha do estoque.

Não altera registros: nomes duplicados interrompem a migração para reconciliação manual.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = '0005_integridade_desempenho'
down_revision = '0004_combos'
branch_labels = None
depends_on = None

# Colunas usadas por edição de venda, exclusão de membro e exclusão de produto.
INDICES = (
    ('vendas', 'ix_vendas_membro_id', 'membro_id'),
    ('movimentacoes_membro', 'ix_movimentacoes_membro_venda_id', 'venda_id'),
    ('itens_venda', 'ix_itens_venda_produto_id', 'produto_id'),
)


def _existe_indice(connection, tabela, condicao):
    """Reaproveita índice equivalente criado fora das migrations, com qualquer nome."""
    return connection.execute(sa.text(f"""
        SELECT 1 FROM pg_indexes
        WHERE schemaname = current_schema() AND tablename = :tabela AND {condicao}
    """), {'tabela': tabela}).first() is not None


def upgrade():
    connection = op.get_bind()
    # Bloqueia escrita em membros durante a checagem e a criação do índice único.
    connection.exec_driver_sql('LOCK TABLE membros IN SHARE ROW EXCLUSIVE MODE')
    duplicados = connection.execute(sa.text("""
        SELECT lower(nome) FROM membros GROUP BY lower(nome) HAVING count(*) > 1 LIMIT 5
    """)).scalars().all()
    if duplicados:
        raise RuntimeError('Membros com o mesmo nome (sem diferenciar maiúsculas): '
                           + ', '.join(duplicados) + '. Renomeie ou una os cadastros; nada foi alterado.')
    if not _existe_indice(connection, 'membros',
                          "indexdef ILIKE 'CREATE UNIQUE INDEX%(lower(nome))%' AND indexdef NOT ILIKE '%WHERE%'"):
        op.create_index('uq_membros_nome_lower', 'membros', [sa.text('lower(nome)')], unique=True)

    for tabela, nome, coluna in INDICES:
        # Índice cuja primeira coluna é a buscada já atende a consulta.
        if not _existe_indice(connection, tabela, f"indexdef ~* '\\({coluna}[,)]' AND indexdef NOT ILIKE '%WHERE%'"):
            op.create_index(nome, tabela, [coluna])

    op.create_table(
        'tentativas_senha_estoque',
        sa.Column('usuario_id', UUID(as_uuid=True), sa.ForeignKey('usuarios.id', ondelete='CASCADE'),
                  primary_key=True),
        sa.Column('falhas', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('bloqueado_ate', sa.DateTime(timezone=True), nullable=True),
        sa.Column('atualizado_em', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    )
    # Mesma postura das demais tabelas: dados só pelo Flask; Data API do Supabase bloqueada.
    op.execute('ALTER TABLE tentativas_senha_estoque ENABLE ROW LEVEL SECURITY')
    op.execute('REVOKE ALL ON TABLE tentativas_senha_estoque FROM PUBLIC')
    op.execute("""
        DO $revoke$
        DECLARE papel text;
        BEGIN
            FOREACH papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
                IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
                    EXECUTE format('REVOKE ALL ON TABLE tentativas_senha_estoque FROM %I', papel);
                END IF;
            END LOOP;
        END
        $revoke$
    """)


def downgrade():
    raise RuntimeError('Remover o índice único reabre nomes duplicados; use correção aditiva revisada.')
