-- ALTERNATIVA: nao aplicar junto com a proposta principal sem decidir
-- explicitamente adotar SELECT direto pela Data API. O frontend atual nao precisa.
-- Nenhum UPDATE/DELETE/INSERT direto e autorizado, nem para admin.
-- Executar em homologacao como postgres. Este arquivo concede SELECT novo.
BEGIN;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated;

-- Sem parametro de usuario/role: verifica exclusivamente a identidade do JWT.
-- Schema private deve permanecer fora dos schemas expostos do PostgREST.
-- postgres tem BYPASSRLS; isso evita recursao ao consultar public.usuarios.
CREATE OR REPLACE FUNCTION private.perfil_ativo_atual()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $func$
    SELECT u.perfil
    FROM public.usuarios AS u
    WHERE u.id = (SELECT auth.uid()) AND u.ativo IS TRUE
      AND u.perfil IN ('admin', 'operador')
$func$;
ALTER FUNCTION private.perfil_ativo_atual() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.perfil_ativo_atual() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.perfil_ativo_atual() TO authenticated;

-- Substitui apenas a policy de leitura conhecida. As outras sao neutralizadas
-- pelos guards de escrita, sem remover policies desconhecidas.
DROP POLICY IF EXISTS "Admins can read users" ON public.usuarios;

DO $rls$
DECLARE
    regra record;
BEGIN
    FOR regra IN
        SELECT * FROM (VALUES
            ('usuarios', $expr$
                (SELECT private.perfil_ativo_atual()) IS NOT NULL
                AND (id = (SELECT auth.uid())
                     OR (SELECT private.perfil_ativo_atual()) = 'admin')
            $expr$),
            ('produtos', $expr$
                (SELECT private.perfil_ativo_atual()) IS NOT NULL
                AND (ativo IS TRUE OR (SELECT private.perfil_ativo_atual()) = 'admin')
            $expr$),
            -- Extrato por UUID hoje permite tambem membro inativo.
            ('membros', $expr$ (SELECT private.perfil_ativo_atual()) IS NOT NULL $expr$),
            ('caixas', $expr$
                (SELECT private.perfil_ativo_atual()) IS NOT NULL
                AND (usuario_abertura_id = (SELECT auth.uid())
                     OR (SELECT private.perfil_ativo_atual()) = 'admin')
            $expr$),
            -- DIA/PERIODO filtra pelo autor; TURNO filtra pelo caixa proprio.
            ('vendas', $expr$
                (SELECT private.perfil_ativo_atual()) IS NOT NULL
                AND ((SELECT private.perfil_ativo_atual()) = 'admin'
                     OR usuario_id = (SELECT auth.uid())
                     OR EXISTS (SELECT 1 FROM public.caixas c
                                WHERE c.id = vendas.caixa_id
                                  AND c.usuario_abertura_id = (SELECT auth.uid())))
            $expr$),
            -- Herda a leitura da venda por EXISTS sujeito ao RLS de vendas.
            ('itens_venda', $expr$
                (SELECT private.perfil_ativo_atual()) IS NOT NULL
                AND EXISTS (SELECT 1 FROM public.vendas v WHERE v.id = itens_venda.venda_id)
            $expr$),
            -- usuario_id e autor do lancamento, nao titular da divida.
            ('movimentacoes_membro', $expr$
                (SELECT private.perfil_ativo_atual()) IS NOT NULL
                AND EXISTS (SELECT 1 FROM public.membros m WHERE m.id = movimentacoes_membro.membro_id)
            $expr$),
            -- Operador recebe somente url_logo pelo bootstrap Flask.
            ('configuracoes_sistema', $expr$
                id = 1 AND (SELECT private.perfil_ativo_atual()) = 'admin'
            $expr$),
            -- Nao existem telas/endpoints de leitura direta destes registros.
            ('ajustes_estoque', 'false'),
            ('operacoes_excluidas', 'false'),
            ('alembic_version', 'false')
        ) AS regras(tabela, expressao)
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', regra.tabela);
        EXECUTE format('DROP POLICY IF EXISTS rls_cliente_bloqueado ON public.%I', regra.tabela);
        EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated', regra.tabela);

        EXECUTE format('DROP POLICY IF EXISTS rls_leitura_permitida ON public.%I', regra.tabela);
        EXECUTE format('DROP POLICY IF EXISTS rls_leitura_limite ON public.%I', regra.tabela);
        EXECUTE format(
            'CREATE POLICY rls_leitura_permitida ON public.%I FOR SELECT '
            'TO authenticated USING (%s)', regra.tabela, regra.expressao
        );
        -- Impede que outra policy permissiva amplie o escopo definido aqui.
        EXECUTE format(
            'CREATE POLICY rls_leitura_limite ON public.%I AS RESTRICTIVE FOR SELECT '
            'TO anon, authenticated USING (%s)', regra.tabela, regra.expressao
        );

        EXECUTE format('DROP POLICY IF EXISTS rls_insert_backend ON public.%I', regra.tabela);
        EXECUTE format('CREATE POLICY rls_insert_backend ON public.%I AS RESTRICTIVE FOR INSERT '
                       'TO anon, authenticated WITH CHECK (false)', regra.tabela);
        EXECUTE format('DROP POLICY IF EXISTS rls_update_backend ON public.%I', regra.tabela);
        EXECUTE format('CREATE POLICY rls_update_backend ON public.%I AS RESTRICTIVE FOR UPDATE '
                       'TO anon, authenticated USING (false) WITH CHECK (false)', regra.tabela);
        EXECUTE format('DROP POLICY IF EXISTS rls_delete_backend ON public.%I', regra.tabela);
        EXECUTE format('CREATE POLICY rls_delete_backend ON public.%I AS RESTRICTIVE FOR DELETE '
                       'TO anon, authenticated USING (false)', regra.tabela);
    END LOOP;
END
$rls$;

-- Concede so as colunas ja devolvidas pelos contratos Flask correspondentes.
-- configuracoes_sistema permanece restrita ao admin pelo RLS.
GRANT SELECT (id, nome, email, perfil, ativo) ON public.usuarios TO authenticated;
GRANT SELECT (id, nome, preco_atual, estoque_bar, estoque_deposito, url_imagem,
              categoria, estoque_min_bar, estoque_min_deposito, ativo)
    ON public.produtos TO authenticated;
GRANT SELECT (id, nome, saldo_devedor, ativo)
    ON public.membros TO authenticated;
GRANT SELECT (id, usuario_abertura_id, usuario_fechamento_id, aberto_em,
              fechado_em, valor_abertura, valor_fechamento, status, observacoes)
    ON public.caixas TO authenticated;
GRANT SELECT (id, versao, id_externo, caixa_id, usuario_id, membro_id, tipo_venda,
              metodo_pagamento, nome_cliente, valor_total, observacoes, criado_em)
    ON public.vendas TO authenticated;
-- venda_id tambem e necessario para o relacionamento usado pela policy.
GRANT SELECT (id, venda_id, produto_id, nome_produto, quantidade, preco_unitario,
              preco_total, observacoes) ON public.itens_venda TO authenticated;
GRANT SELECT (id, versao, membro_id, venda_id, tipo_movimentacao, origem,
              descricao, valor, criado_em) ON public.movimentacoes_membro TO authenticated;
GRANT SELECT ON public.configuracoes_sistema TO authenticated;

COMMIT;
