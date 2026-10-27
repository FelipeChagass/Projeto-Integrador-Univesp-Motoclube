-- SOMENTE SELECT: inventario e verificacoes para limpeza, sem alterar registros.
-- Os resultados operacionais sao agregados; nao incluem nomes/emails/tokens.

SELECT n.nspname AS esquema, c.relname AS tabela,
       c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls,
       pg_get_userbyid(c.relowner) AS dono,
       count(p.oid) AS policies
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
GROUP BY n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity, c.relowner
ORDER BY tabela;

SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies WHERE schemaname IN ('public', 'storage')
ORDER BY schemaname, tablename, policyname;

SELECT c.relname AS tabela, con.conname AS nome_constraint,
       con.contype AS tipo, pg_get_constraintdef(con.oid) AS definicao
FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' ORDER BY tabela, nome_constraint;

SELECT r.rolname AS papel, c.relname AS tabela,
       has_table_privilege(r.oid, c.oid, 'SELECT') AS select_tabela,
       has_any_column_privilege(r.oid, c.oid, 'SELECT') AS select_coluna,
       has_table_privilege(r.oid, c.oid, 'INSERT') AS insert_tabela,
       has_any_column_privilege(r.oid, c.oid, 'INSERT') AS insert_coluna,
       has_table_privilege(r.oid, c.oid, 'UPDATE') AS update_tabela,
       has_any_column_privilege(r.oid, c.oid, 'UPDATE') AS update_coluna,
       has_table_privilege(r.oid, c.oid, 'DELETE') AS delete_tabela,
       has_table_privilege(r.oid, c.oid, 'TRUNCATE') AS truncate_tabela
FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
  AND n.nspname = 'public' AND c.relkind IN ('r', 'p')
ORDER BY tabela, papel;

SELECT n.nspname AS esquema, p.proname AS funcao,
       pg_get_function_identity_arguments(p.oid) AS argumentos,
       p.prosecdef AS security_definer, p.proconfig AS configuracao,
       p.proacl AS grants, pg_get_functiondef(p.oid) AS definicao
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prokind = 'f' ORDER BY funcao;

SELECT c.relname AS tabela, t.tgname AS trigger, pg_get_triggerdef(t.oid) AS definicao
FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND NOT t.tgisinternal ORDER BY tabela, trigger;

SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename, indexname;

SELECT current_user, session_user, r.rolsuper, r.rolbypassrls, auth.uid() AS identidade
FROM pg_roles r WHERE r.rolname = current_user;

SELECT version_num FROM public.alembic_version;

-- deleted_at existe no banco atual, mas nao na baseline/ORM local.
SELECT 'usuarios' AS tabela, count(*) FILTER (WHERE deleted_at IS NOT NULL) AS marcados,
       count(*) FILTER (WHERE deleted_at IS NOT NULL AND ativo) AS marcados_ativos FROM public.usuarios
UNION ALL
SELECT 'membros', count(*) FILTER (WHERE deleted_at IS NOT NULL),
       count(*) FILTER (WHERE deleted_at IS NOT NULL AND ativo) FROM public.membros
UNION ALL
SELECT 'produtos', count(*) FILTER (WHERE deleted_at IS NOT NULL),
       count(*) FILTER (WHERE deleted_at IS NOT NULL AND ativo) FROM public.produtos;

SELECT count(*) FILTER (WHERE v.usuario_id IS NULL) AS sem_autor,
       count(*) FILTER (WHERE v.caixa_id IS NULL) AS sem_caixa,
       count(*) FILTER (WHERE v.usuario_id IS NOT NULL AND c.id IS NOT NULL
                         AND v.usuario_id <> c.usuario_abertura_id) AS autor_diferente_do_dono,
       count(*) FILTER (WHERE v.payload_hash IS NULL) AS sem_hash
FROM public.vendas v LEFT JOIN public.caixas c ON c.id = v.caixa_id;

WITH totais AS (
    SELECT membro_id,
           sum(CASE WHEN tipo_movimentacao = 'debito' THEN valor
                    WHEN tipo_movimentacao = 'credito' THEN -valor ELSE 0 END) AS saldo_historico,
           count(*) FILTER (WHERE tipo_movimentacao = 'ajuste') AS ambiguos
    FROM public.movimentacoes_membro GROUP BY membro_id
)
SELECT count(*) FILTER (WHERE m.saldo_devedor <> coalesce(t.saldo_historico, 0)) AS saldos_divergentes,
       count(*) FILTER (WHERE t.ambiguos > 0) AS membros_com_movimentos_ambiguos
FROM public.membros m LEFT JOIN totais t ON t.membro_id = m.id;

SELECT count(*) AS movimentos_vinculados_inconsistentes
FROM public.movimentacoes_membro m JOIN public.vendas v ON v.id = m.venda_id
WHERE m.membro_id IS DISTINCT FROM v.membro_id
   OR m.valor <> v.valor_total
   OR (v.tipo_venda = 'fiado' AND m.tipo_movimentacao <> 'debito')
   OR (v.tipo_venda = 'recebimento_divida' AND m.tipo_movimentacao <> 'credito');

-- Dependencias registradas de funcoes antes de qualquer limpeza.
-- Chamadas por codigo, SQL dinamico e certos corpos de funcao nao aparecem aqui.
SELECT p.proname AS funcao, d.deptype,
       pg_describe_object(d.classid, d.objid, d.objsubid) AS dependente
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
LEFT JOIN pg_depend d ON d.refclassid = 'pg_proc'::regclass AND d.refobjid = p.oid
WHERE n.nspname = 'public' ORDER BY funcao, dependente;
