# Remoção de compatibilidade obsoleta

Data: 20/09/2026. Esta decisão substitui fallbacks de versões anteriores descritos nos marcos históricos. O sistema passa a expor somente os contratos usados pela aplicação atual.

## Superfícies removidas

| Área | Removido | Contrato atual |
|---|---|---|
| Estoque | `POST /api/admin/verificar-senha`, `API.verificarSenhaEstoque`, `confirmarSenhaEstoque` e modal de senha | Admin ativa o modo diretamente; `PUT /api/produtos/estoque` continua protegido por `requer_admin` |
| Páginas | redirects `/pdv` e `/cadastro` | PDV em `/`; login em `/login`; cadastro público não existe |
| Vendas | alias de payload `id` e classe `VendaFiadoPayload` | Toda operação exige `id_externo`; `VendaNormalPayload` valida venda normal ou fiada pelo método |
| Erros | campos duplicados `codigo` e `mensagem` em `ApiError` | Envelope único `{status, code, message, details, retryable, request_id}` |
| JavaScript | reexport de `UIModal` por `shared/api.js` | Consumidores importam `shared/modals.js` diretamente |
| Auth JS | `API.signup`, sem consumidor e sem tela pública | Criação de usuários ocorre no painel administrativo; `/api/auth/sincronizar` permanece como contrato backend autenticado |
| Fila offline | importação/backup `motoBarFila` e `motoBarFilaMigrada` | IndexedDB `motoBarOperacoes` é a única outbox suportada |
| Usuários | `service_result`, que convertia dicionários de erro | Serviços lançam `ApiError`; rotas serializam apenas resultados de sucesso |

As referências foram removidas de entradas JS, mocks, template composto, listagem de endpoints e testes. `templates/pdv/modals/permissao-estoque.html` foi excluído. O logout limpa chaves antigas `motoBar*`, mas não toca no IndexedDB.

## O que não é fallback de versão

- Retry/backoff, recibos e reconciliação da outbox IndexedDB são comportamento operacional atual.
- Compensações entre Supabase Auth e PostgreSQL continuam necessárias porque não existe transação distribuída.
- Respostas seguras para falhas de rede/HTTP e normalização do método enviado pela interface atual permanecem ativas.
- A baseline Alembic e a validação do schema existente são procedimentos de implantação, não aliases de API.

## Consequências

- Clientes antigos recebem 404 nas rotas removidas e 422 se enviarem apenas `id` em vez de `id_externo`.
- Uma fila que exista somente em `localStorage` não será importada. Antes de atualizar uma instalação antiga, exporte/reconcilie manualmente qualquer operação ainda não migrada. A aplicação atual não deve recriar essas chaves.
- Imports de `UIModal` por `shared/api.js` deixam de funcionar; todos os módulos versionados já apontam para `shared/modals.js`.
- Erros deixam de repetir os campos em português. Consumidores devem usar `code` e `message`.

## Proteções automatizadas

- `backend/tests/test_contracts.py` confirma 404 para as três rotas antigas e rejeita o alias `id`.
- `backend/tests/test_frontend_templates.py` registra a estrutura do PDV sem o modal de senha.
- `tests/offline-queue.test.js` cobre somente a outbox IndexedDB vigente.
- `tests/api.test.js` confirma que logout remove o estado local sem alterar a outbox IndexedDB.
- O smoke HTTP percorre os imports ESM atuais, incluindo `shared/modals.js`.

Validação local final: 67 testes Python aprovados em PostgreSQL sintético, 158 testes JavaScript aprovados em 9 suítes, Ruff aprovado, 27 módulos JavaScript com sintaxe válida e `diff --check` sem erros. A redução de 160 para 158 testes JavaScript corresponde exclusivamente à exclusão dos dois cenários da migração `localStorage` removida; os demais testes permaneceram aprovados.
