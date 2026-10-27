-- PROPOSTA: nao aplicada ao banco operacional.
-- Arquitetura atual: dados via Flask/SQLAlchemy; Supabase JS somente Auth.
-- Executar primeiro em homologacao como postgres, apos revisar o diagnostico.
BEGIN;

DO $rls$
DECLARE
    tabela text;
BEGIN
    FOREACH tabela IN ARRAY ARRAY[
        'usuarios', 'membros', 'produtos', 'caixas', 'vendas',
        'itens_venda', 'movimentacoes_membro', 'ajustes_estoque',
        'configuracoes_sistema', 'operacoes_excluidas', 'alembic_version'
    ] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tabela);
        -- Remove somente a policy desta proposta para permitir reaplicacao.
        EXECUTE format('DROP POLICY IF EXISTS rls_cliente_bloqueado ON public.%I', tabela);
        EXECUTE format(
            'CREATE POLICY rls_cliente_bloqueado ON public.%I '
            'AS RESTRICTIVE FOR ALL TO anon, authenticated '
            'USING (false) WITH CHECK (false)', tabela
        );
        -- RLS nao controla TRUNCATE. Mantem tambem o bloqueio por grants.
        EXECUTE format(
            'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated', tabela
        );
    END LOOP;
END
$rls$;

-- O backend usa service_role para upload validado; continua permitido por BYPASSRLS.
-- Guards restritivos vencem as policies permissivas amplas ja existentes.
-- A leitura publica das imagens continua conforme o bucket existente.
DROP POLICY IF EXISTS rls_produto_imagens_insert_backend ON storage.objects;
CREATE POLICY rls_produto_imagens_insert_backend ON storage.objects
AS RESTRICTIVE FOR INSERT TO anon, authenticated
WITH CHECK (bucket_id <> 'produto-imagens');

DROP POLICY IF EXISTS rls_produto_imagens_update_backend ON storage.objects;
CREATE POLICY rls_produto_imagens_update_backend ON storage.objects
AS RESTRICTIVE FOR UPDATE TO anon, authenticated
USING (bucket_id <> 'produto-imagens')
WITH CHECK (bucket_id <> 'produto-imagens');

DROP POLICY IF EXISTS rls_produto_imagens_delete_backend ON storage.objects;
CREATE POLICY rls_produto_imagens_delete_backend ON storage.objects
AS RESTRICTIVE FOR DELETE TO anon, authenticated
USING (bucket_id <> 'produto-imagens');

COMMIT;
