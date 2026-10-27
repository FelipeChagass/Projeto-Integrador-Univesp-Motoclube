# Análise de RLS e autorização — 02/10/2026

Esta entrega contém diagnóstico e propostas SQL. Nenhuma policy, grant, função,
trigger ou registro foi alterado no banco operacional. Consultas externas usaram
transações `READ ONLY`; execução de propostas ocorreu somente em PostgreSQL local sintético.

## 1. Diagnóstico atual de acesso

Foram cruzados `plans/decisoes-integridade.md`, `plans/administrativo-vendas-acessibilidade.md`,
os relatórios históricos de implementação/refatoração/compatibilidade, a referência
`plans/estrutura_banco.txt`, as três revisões Alembic, os modelos, middleware,
rotas/serviços, cliente HTTP, telas e testes de autorização/finanças.
Os documentos anteriores descrevem decisões históricas; divergências abaixo usam
o código atual, o banco consultado e a confirmação do solicitante como evidência.

No banco configurado para esta instalação:

- As **11 tabelas de `public` têm RLS habilitado**, sem `FORCE RLS`.
- Apenas `usuarios` tem policies: SELECT próprio/admin e INSERT/UPDATE/DELETE admin.
- `anon` e `authenticated` não têm SELECT/INSERT/UPDATE/DELETE/TRUNCATE de tabela;
  o inventário adicional também verifica permissões por coluna.
- A conexão SQLAlchemy usa **`postgres`, com `BYPASSRLS`**; `auth.uid()` nessa conexão é NULL.
- `alembic_version` registra `0003_edicao_admin`. Isso não comprova equivalência do schema.
- `public.current_user_is_admin()` é SECURITY DEFINER, pertence a postgres e consulta
  `usuarios.id = auth.uid()`, `perfil = 'admin'` e `ativo`. Usa `search_path=public`.
- Existem ainda `definir_atualizado_em`, `fn_baixar_estoque_bar` e
  `fn_recalcular_valor_total_venda`; as duas últimas não constam nas migrações locais.
- Não há chamadas à Data API de tabelas nem `.rpc()` no frontend atual. O cliente
  Supabase é usado para Auth; dados passam por Flask com token Bearer.
  Não foram encontradas Edge Functions no repositório. Deploys externos não foram inventariados.

RLS aplicado a `authenticated` não passa automaticamente a controlar Flask.
O backend valida o token via Supabase Auth, consulta o perfil local a cada
requisição e aplica regras em middleware e serviços. A service role usada para
Auth/Storage é separada da credencial PostgreSQL do SQLAlchemy.

### Identidade e relacionamentos

`usuarios.id` é a FK para `auth.users.id`. Não há `auth_user_id` separado.
Os únicos perfis aceitos por CHECK são `admin` e `operador`; `ativo` é obrigatório.
Cadastro próprio nasce como operador inativo e depende de ativação administrativa.
Metadata fornecida pelo usuário não é fonte de perfil ou autorização.

`membros` representa clientes/membros com dívida e não tem FK para `auth.users`
ou `usuarios`. Não é um terceiro perfil de login. `movimentacoes_membro.usuario_id`
indica o autor do lançamento, não o titular da dívida. A propriedade do caixa está
em `caixas.usuario_abertura_id`; `vendas` liga autor, caixa, membro e itens.
Não existe tenant/organização/proprietário comercial no schema auditado.

## 2. Matriz de permissões por perfil/plano

Esta matriz descreve operações **pela API Flask**, não grants diretos no PostgreSQL.

| Perfil/estado | Consulta | Alteração | Exclusão |
|---|---|---|---|
| Sem autenticação | Página/configuração pública de Auth e imagens do bucket público | Nenhuma operação de negócio | Nenhuma |
| Autenticado sem perfil | Estado pendente em `/auth/me` | Sincronizar cadastro próprio como operador inativo | Nenhuma |
| Perfil inativo, inclusive admin | API operacional recusada | Nenhuma | Nenhuma |
| Operador ativo | Perfil próprio, catálogo ativo, membros/extratos, caixa próprio e relatórios autorizados | Vender/receber no caixa próprio, fechar caixa próprio; ajustar estoque **com senha adicional** | Nenhuma exclusão administrativa |
| Admin ativo | Consultas administrativas de todos os registros, incluindo cadastros inativos | Cadastros, usuários, configurações, ajustes de saldo, edição financeira; estoque **sem senha**; fechar caixa alheio | Cadastros sem vínculos e operações financeiras pelos serviços de reconciliação |
| Membro | Não há identidade de login vinculada ao membro | Não há permissão autônoma | Não há permissão autônoma |
| Owner/outros perfis | Não implementados | Não implementados | Não implementados |

`plans/` contém planos de execução/decisões do projeto. Não há catálogo de planos
comerciais, assinatura, benefícios por plano ou tabela de contratação em `plans/`
ou `migrations/`. A referência a plano do Supabase trata de limites do pool,
não de autorização. Nenhuma condição de plano comercial foi acrescentada ao SQL.

Confirmação do solicitante: admin ajusta estoque sem senha; operador também
ajusta após informar senha. Isso coincide com `produtos/routes.py`,
`produtos/service.py` e `test_auth_postgres.py`, mas diverge de documentos anteriores
e do dicionário PERMISSOES, que atribui `estoque:ajustar` somente ao admin.

## 3. Tabelas que precisam de policies

“Sem policy” não significa “precisa ser liberada”: RLS sem policy é negação por padrão.

| Tabela | Policies atuais de SELECT/UPDATE/DELETE | SELECT de negócio pela API | UPDATE de negócio pela API | DELETE de negócio pela API e justificativa |
|---|---|---|---|---|
| `usuarios` | Já existem as três | Próprio ativo; admin lista todos | Sincronização própria limitada a nome/email autenticado; admin gerencia, com sincronização Auth | Admin, sem autoexclusão/vínculos; compensação Auth necessária |
| `produtos` | Nenhuma | Operador vê ativos; admin todos | Admin cadastro; estoque admin ou operador com senha, valores esperados e auditoria; venda altera estoque internamente | Admin sem itens de vendas; serviço remove ajustes vinculados |
| `membros` | Nenhuma | Lista ativa no PDV; extrato por UUID também aceita inativo; admin todos | Admin nome/ativo e ajuste financeiro; venda/recebimento muda saldo internamente | Admin apenas saldo zero e sem vendas/movimentos |
| `caixas` | Nenhuma | Operador próprio; admin relatórios de todos | Operador fecha próprio; admin pode fechar outro; correção financeira recalcula fechamento automático | Não há fluxo de exclusão; não liberar |
| `vendas` | Nenhuma | Operador por autor nos relatórios DIA/PERIODO e por caixa próprio no TURNO; admin todas | Admin, via serviço que recalcula itens/estoque/dívida/caixa e confere versão | Admin, via mesmo serviço e gravação de `operacoes_excluidas` |
| `itens_venda` | Nenhuma | Herda o acesso à venda nos relatórios | Apenas como parte da edição administrativa da venda | Apenas como parte da edição/exclusão da venda |
| `movimentacoes_membro` | Nenhuma | Operador/admin consultam extrato inteiro do membro, inclusive lançamentos de outros autores | Admin edita movimento sem venda; vinculado é alterado pela venda; sempre recalcula saldo | Mesma regra de vínculo e reconciliação; não excluir avulsamente lançamento vinculado |
| `ajustes_estoque` | Nenhuma | Nenhum endpoint de histórico localizado; consulta interna não implica autorização de cliente | Nenhum editor localizado | Serviço de exclusão do produto remove registros vinculados; não há exclusão avulsa |
| `configuracoes_sistema` | Nenhuma | Admin configuração completa; operador recebe `url_logo` no bootstrap | Admin faz update/upsert do registro único `id=1` | Nenhum fluxo; não liberar |
| `operacoes_excluidas` | Nenhuma | Somente serviço verifica a chave para impedir reenvio offline | Nenhum fluxo | Não liberar: apagá-la reabre a possibilidade de recriar venda excluída |
| `alembic_version` | Nenhuma | Ferramenta de migração | Ferramenta de migração | Ferramenta de migração; nenhum perfil da aplicação |

Logo, **10 tabelas não têm policies**; `usuarios` já tem as três solicitadas,
mas a política direta de escrita deve ser revista. As duas tabelas técnicas
e operações sem fluxo definido devem continuar fechadas aos clientes.

## 4. Policies SQL propostas

### Proposta principal: preservar o backend como caminho autorizado

Script completo: [sql/rls-preservar-backend.sql](sql/rls-preservar-backend.sql).
Cria, em cada uma das 11 tabelas, um guard restritivo:

```sql
CREATE POLICY rls_cliente_bloqueado ON public.vendas
AS RESTRICTIVE FOR ALL TO anon, authenticated
USING (false) WITH CHECK (false);
```

`FOR ALL` cobre SELECT/UPDATE/DELETE e também INSERT. `USING` recusa registros
existentes; `WITH CHECK` recusa novos valores/linhas. Sendo restritiva, a policy
impede que as policies permissivas existentes ou futuras abram escrita direta.
O script mantém a ausência de grants aos clientes, incluindo TRUNCATE.
Não interfere no acesso BYPASSRLS de postgres/service_role.

Esta é a recomendação atual porque os clientes não precisam de acesso direto.
Admin continua editando/excluindo pela API; operador continua vendendo, recebendo
e ajustando estoque com senha. A senha é validada no backend a cada ajuste:
não há condição SQL persistida que permita substituí-la por `perfil='operador'`.

No Storage, o mesmo arquivo acrescenta guards restritivos de INSERT/UPDATE/DELETE
para bloquear escrita cliente no bucket `produto-imagens`. A leitura pública
existente é mantida. `UPDATE` usa USING e WITH CHECK para impedir tanto modificar
objeto do bucket quanto mover objeto de outro bucket para ele.

### Alternativa somente se for adotada leitura direta pela Data API

Script completo e separado: [sql/rls-leitura-opcional.sql](sql/rls-leitura-opcional.sql).
**Ele altera a superfície de acesso e concede SELECT novo. Não é necessário ao frontend atual.**
Substitui o guard FOR ALL por guards de escrita e permite SELECT delimitado,
com grants de coluna para não expor `deleted_at`, `payload_hash` e outros campos
fora dos contratos identificados. `ajustes_estoque`, `operacoes_excluidas` e
`alembic_version` continuam sem grants/sem leitura cliente; configuração completa
continua apenas para admin, preservando o bootstrap Flask para o logo do operador.

A função `private.perfil_ativo_atual()` verifica o perfil ativo de `auth.uid()`.
Não recebe UID/role externos, usa `search_path=''`, nomes qualificados, ownership
postgres para evitar recursão em `usuarios`, e EXECUTE apenas para authenticated.
O schema `private` deve permanecer fora dos schemas expostos do PostgREST.
Não usa `user_metadata` ou claims editáveis como fonte de autoridade.

Cada expressão de leitura é declarada uma vez no mapa SQL e usada em policy
permissiva e no limite restritivo, evitando ampliação por OR com policies antigas.
Itens herdam leitura por `venda_id`; movimentos dependem do membro do extrato,
sem restringir incorretamente por autor do movimento.

A expressão de vendas usa autor próprio OU caixa próprio porque os relatórios
atuais usam os dois critérios em contextos diferentes. Essa união deve ser
avaliada antes de habilitar leitura direta: há **uma venda cujo autor diverge do
dono do caixa**. O backend hoje também permite as duas consultas conforme o tipo
de relatório. Não imponho um AND silencioso que esconderia histórico necessário.
Somente linhas sem nenhum critério de propriedade ficam restritas ao admin.

Não proponho UPDATE direto “admin em tudo”: RLS limita linhas, mas não executa
reconciliação financeira, sincronização Auth, senha, auditoria ou versões.
Também não basta repetir a verificação de proprietário no WITH CHECK para impedir
mudança de um vínculo para outro registro igualmente autorizado. Escrita direta
continuará bloqueada, inclusive para admin, eliminando esse caminho de mudança de escopo.

### Validação

As duas propostas foram executadas e reaplicadas em PostgreSQL local sintético:
**123 verificações aprovadas**, incluindo permissões, perfis ausentes/inativos,
isolamento entre operadores, herança itens/vendas, coluna oculta, guards diante de
policies antigas amplas, tentativa de promoção/transferência de caixa e Storage.
O cluster foi encerrado. As funções/triggers reais do Supabase não foram executadas
nesses testes; não se afirma homologação integrada da instalação.

## 5. Riscos ou inconsistências encontradas

1. **Backend ignora RLS por BYPASSRLS.** Policies por usuário não corrigem falhas
   de autorização das rotas/serviços. `FORCE RLS` não neutraliza BYPASSRLS.
2. **Storage permite escrita de qualquer authenticated** no bucket de imagens,
   sem perfil local ativo/admin. Isso contorna validação/reencodificação de upload.
   Bucket é público e não tem limite de arquivo/MIME configurado no inventário.
3. **Policies admin de escrita em usuarios são insuficientes para o fluxo real**
   caso grants sejam concedidos: permitem alterar email/perfil/ativo ou excluir
   perfil sem sincronizar Auth, sem autoexclusão/vínculos/compensação do serviço.
4. **Schema real diverge da baseline**: `deleted_at` em usuários/membros/produtos,
   triggers/funções extras e FKs CASCADE/SET NULL. O ORM ignora `deleted_at`.
   Atualmente nenhum registro dessas tabelas tem `deleted_at` preenchido;
   a decisão sobre soft delete continua necessária antes de voltar a usá-lo.
5. **Cascatas reais permitem efeitos que o serviço bloqueia**: excluir membro
   pode apagar movimentos e desvincular vendas; excluir venda pode desvincular
   movimentos; excluir usuário pode zerar referências de autoria/fechamento.
   Proteger DELETE direto e evitar limpeza manual sem reconciliação.
6. **RPC antiga inconsistente**: `fn_baixar_estoque_bar(uuid, integer)` compara
   UUID com `produtos.id bigint`, usa `deleted_at` e não valida quantidade positiva
   nem identidade/capacidade. Hoje é SECURITY INVOKER, sem grants de tabela cliente;
   não foi observado um bypass efetivo. Não reutilizar/corrigir parcialmente e
   liberar a função sem redesenhar o contrato. Nenhuma chamada no código atual.
7. **Trigger de total fora das migrations**: `fn_recalcular_valor_total_venda`
   atualiza total após INSERT/UPDATE/DELETE de item, mas não reconcilia saldo,
   estoque, versões e hashes. Usa COALESCE de NEW/OLD e não recalcula ambos os
   pais se um item mudar de venda. Os contratos atuais não permitem essa mudança.
8. **Histórico e permissões**: uma venda tem autor diferente do dono do caixa;
   12 vendas têm hash NULL, situação já prevista para históricos/correções.
   Não fabricar hashes nem transferir autoria automaticamente.
9. **Resultados agregados da limpeza**: zero vendas sem autor/caixa, zero saldos
   divergentes, zero membros com movimentos ambiguamente direcionados e zero
   movimentos vinculados divergentes nas verificações executadas. Isso não prova
   integridade completa nem justifica apagar históricos.
10. **Documentação de estoque desatualizada**: confirmação do solicitante e código
    admitem operador com senha; PERMISSOES/documentos anteriores não representam
    essa capacidade condicional. Não transformá-la em UPDATE irrestrito por role.

## 6. Recomendações adicionais de segurança

- Priorizar guards de escrita do Storage e manter dados da aplicação via backend.
- Consolidar a regra condicional do estoque e registrar a confirmação do solicitante;
  avaliar capacidade por usuário em lugar da senha compartilhada e limitar tentativas.
- Antes de exigir RLS nas requisições Flask, redesenhar o acesso com uma role runtime
  NOBYPASSRLS/não proprietária e identidade validada por transação, sem vazar contexto
  pelo pool. As policies precisarão contemplar locks e efeitos internos das vendas
  sobre produtos/membros; não basta trocar credencial ou executar SET ROLE authenticated.
- Exportar/versionar schema real, triggers, funções, grants e FKs, depois comparar
  com a baseline. Não usar stamp como comprovação da equivalência nem executar
  DROP CASCADE para “limpar” dependências desconhecidas.
- Revisar a função admin para `search_path=''` e execução mínima caso continue em uso.
  Priorizar helpers novos em schema privado; não elevar RPC antiga para SECURITY DEFINER.
- Restringir campos sensíveis por grants de coluna/RPC, além de RLS; em futuro
  multi-tenant, exigir tenant e vínculo imutável nos pais/filhos e em USING/WITH CHECK.
- Definir retenção/auditoria antes de excluir vendas, movimentos e ajustes; preservar
  `operacoes_excluidas` para manter a proteção da fila offline.
- Os [SELECTs de inventário e limpeza](sql/rls-inventario-limpeza.sql) foram todos
  executados em READ ONLY e estão prontos para acompanhamento; incluem constraints,
  policies, grants efetivos, índices, funções, triggers e verificações agregadas.
  Dependências registradas não incluem necessariamente SQL dinâmico/chamadas externas.

Referências técnicas: [PostgreSQL CREATE POLICY](https://www.postgresql.org/docs/current/sql-createpolicy.html),
[PostgreSQL RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html),
[Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[Supabase Storage](https://supabase.com/docs/guides/storage/security/access-control).
