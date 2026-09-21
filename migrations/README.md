# Migrações seguras — PostgreSQL/Supabase

Não executar em produção durante testes. O Alembic lê **somente** `MIGRATION_DATABASE_URL` explicitamente definida; não carrega `.env` nem usa a URL de execução da aplicação.

## Revisões

- `0001_baseline`: reprodução congelada das nove tabelas de `plans/estrutura_banco.txt`, ordenadas por dependência. Exige `auth.users` existente. Recusa schema não vazio.
- `0002_integridade`: adiciona `vendas.payload_hash` nullable, unicidade parcial de caixa aberto por operador e índices de consulta. Não altera registros históricos nem recria checks/FKs/unicidades já declarados na referência.

Índices: `uq_caixas_usuario_aberto`, `ix_vendas_criado_em`, `ix_vendas_caixa_criado`, `ix_vendas_usuario_criado`, `ix_itens_venda_venda_id`, `ix_movimentacoes_membro_criado`.
A revisão verifica definições equivalentes presentes antes de criar índices; nome igual com definição diferente interrompe a execução.

## Banco existente

1. Faça backup e teste sua recuperação em ambiente separado. Exporte o schema efetivo e compare com `sql/0001_baseline.sql` (substitua apenas o marcador `__AUTH_USERS__` por `auth.users` para comparação).
2. Verifique tipos, nullability, defaults, identity, PKs, FKs, unicidade de email/ID externo, checks, índices e objetos adicionais. Inventarie triggers, funções, grants e RLS: **não foram fornecidos e não foram auditados no ambiente real**.
3. Investigue caixas duplicados antes da alteração:

   ```sql
   SELECT usuario_abertura_id, count(*)
   FROM caixas WHERE status = 'aberto'
   GROUP BY usuario_abertura_id HAVING count(*) > 1;
   ```

4. Somente depois de confirmar a compatibilidade da referência, registre a baseline existente. `stamp` registra versão, **não valida nem corrige schema**:

   ```powershell
   # Defina a URL de um banco de homologação explicitamente; nunca copie credenciais para documentação.
   python -m alembic stamp 0001_baseline
   python -m alembic upgrade head
   ```

5. Valide os fluxos em homologação e planeje janela controlada de aplicação. Nenhum desses comandos foi executado no banco operacional nesta entrega.

Não rode `upgrade 0001_baseline` sobre tabelas já existentes e não faça `stamp head` para ignorar a integridade adicional.

## Banco novo

Em projeto Supabase vazio, `auth.users` já é infraestrutura externa. Configure `MIGRATION_DATABASE_URL` e execute `python -m alembic upgrade head`. Não crie uma tabela `auth.users` artificial no Supabase.

Os testes locais criam explicitamente um stub de `auth.users(id)` **somente no banco sintético** e aplicam ambas as revisões em schemas únicos. Isso não reproduz Auth, políticas ou triggers gerenciados do Supabase.

## Riscos e recuperação

- A revisão 0002 bloqueia escrita em `caixas` durante a verificação/criação do índice; os índices são criados transacionalmente, não `CONCURRENTLY`. Avalie duração e volume antes da janela de manutenção.
- Caixas duplicados interrompem a migração antes da criação do hash/índices. Não fecha nem mescla caixas automaticamente. Reconciliação precisa de decisão operacional e trilha de auditoria.
- Hashes históricos permanecem `NULL`: uma nova tentativa com ID histórico não recebe ACK cego, mas conflito para reconciliação. Não invente hashes de payloads desconhecidos.
- Faça upgrade do banco **antes** do backend que consulta `payload_hash`. Publique backend e frontend compatíveis de forma coordenada; pause atendimento, exporte pendências e recarregue as abas.
- Downgrades destrutivos estão bloqueados. Use correção aditiva revisada ou restauração de backup em ambiente separado; não remova hashes/invariantes para facilitar rollback de código.
- Não use `Base.metadata.create_all()` como migração: o relacionamento com `auth.users` é gerenciado pela baseline/Supabase, não por tabela Auth no ORM.

## Evidência de validação

`backend/tests/test_migrations.py` verifica: recusa de baseline em schema ocupado; interrupção em caixas duplicados com preservação de dados/versão; adoção de baseline existente e reutilização de índice equivalente. As fixtures de integração aplicam as duas revisões antes de cada teste PostgreSQL.
