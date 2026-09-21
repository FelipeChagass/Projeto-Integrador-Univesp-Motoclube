"""Additive financial integrity. Never merge/close historical cash registers automatically."""
import re
from alembic import op
import sqlalchemy as sa

revision = '0002_integridade'
down_revision = '0001_baseline'
branch_labels = None
depends_on = None


def _predicate(value):
    return re.sub(r"[\s()]|::text", '', str(value or '')).lower()


def _index(table, name, columns, *, unique=False, where=None):
    indexes = sa.inspect(op.get_bind()).get_indexes(table)
    for index in indexes:
        predicate = index.get('dialect_options', {}).get('postgresql_where')
        equivalent = (index['column_names'] == columns and bool(index['unique']) == unique
                      and _predicate(predicate) == _predicate(where))
        if equivalent:
            return
        if index['name'] == name:
            raise RuntimeError(f'Índice {name} existe com definição diferente; audite antes de continuar.')
    op.create_index(name, table, columns, unique=unique,
                    **({'postgresql_where': sa.text(where)} if where else {}))


def upgrade():
    connection = op.get_bind()
    # Keep preflight and index creation consistent with concurrent writers.
    connection.exec_driver_sql('LOCK TABLE caixas IN SHARE ROW EXCLUSIVE MODE')
    duplicates = connection.execute(sa.text("""
        SELECT 1 FROM caixas WHERE status = 'aberto'
        GROUP BY usuario_abertura_id HAVING count(*) > 1 LIMIT 1
    """)).first()
    if duplicates:
        raise RuntimeError('Existem caixas abertos duplicados. Reconcilie manualmente; nenhum registro foi modificado.')
    columns = {c['name']: c for c in sa.inspect(connection).get_columns('vendas')}
    if 'payload_hash' not in columns:
        op.add_column('vendas', sa.Column('payload_hash', sa.String(64), nullable=True))
    elif (not isinstance(columns['payload_hash']['type'], sa.String)
          or (columns['payload_hash']['type'].length is not None and columns['payload_hash']['type'].length < 64)
          or not columns['payload_hash']['nullable']):
        raise RuntimeError('payload_hash existente incompatível; audite o schema.')
    _index('caixas', 'uq_caixas_usuario_aberto', ['usuario_abertura_id'], unique=True, where="status = 'aberto'")
    _index('vendas', 'ix_vendas_criado_em', ['criado_em'])
    _index('vendas', 'ix_vendas_caixa_criado', ['caixa_id', 'criado_em'])
    _index('vendas', 'ix_vendas_usuario_criado', ['usuario_id', 'criado_em'])
    _index('itens_venda', 'ix_itens_venda_venda_id', ['venda_id'])
    _index('movimentacoes_membro', 'ix_movimentacoes_membro_criado', ['membro_id', 'criado_em'])


def downgrade():
    raise RuntimeError('Remoção de invariantes/hashes bloqueada. Use correção aditiva revisada.')
