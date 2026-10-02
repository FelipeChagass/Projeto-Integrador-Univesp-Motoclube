# 🏍️ Bar Moto Clube — Sistema PDV

Monólito modular com Flask, SQLAlchemy, PostgreSQL/Supabase e JavaScript ES Modules.
Login, PDV e administração usam Supabase Auth. Estoque, saldo, vendas e caixa são confirmados transacionalmente pelo backend.

## Organização por funcionalidades

```
backend/app/
├── __init__.py           # composição da aplicação e páginas
├── core/                 # configuração, banco/UoW, erros e tipos compartilhados
├── models/               # mapeamento ORM e relacionamentos do banco compartilhado
└── features/
    ├── auth/             # token, perfil próprio e cliente administrativo Supabase
    ├── admin/            # composição do blueprint /api/admin
    ├── caixa/            # abertura, fechamento, schemas e serviço
    ├── configuracoes/    # configurações administrativas
    ├── membros/          # cadastro, extratos e ajustes de saldo
    ├── pdv/              # dados iniciais
    ├── produtos/         # catálogo, estoque, auditoria e imagens
    ├── relatorios/       # agregações e filtros financeiros
    ├── usuarios/         # administração de usuários
    └── vendas/           # vendas, recebimentos e idempotência

static/js/
├── shared/               # API HTTP, modais, utilitários e gestos compartilhados
└── features/
    ├── auth/             # login
    ├── admin/            # entrada, eventos, navegação e módulos por recurso
    └── pdv/              # estado, UI, fila, relatórios e actions/ por responsabilidade

templates/
├── admin.html            # composição dos parciais de admin/ e admin/modals/
└── ponto_venda.html      # composição dos parciais de pdv/ e pdv/modals/

static/css/features/      # admin/pdv: componentes base/ e adaptações mobile/

backend/tests/            # contratos, integração e concorrência PostgreSQL
tests/                    # Jest: interface, API, IndexedDB e smoke HTTP
migrations/               # Alembic e baseline congelada
scripts/                  # execução isolada de testes
plans/                    # diagnóstico, implementação e decisões operacionais
```

Cada funcionalidade mantém `routes.py`, `admin_routes.py`, `service.py` e `schemas.py` quando necessários. Produtos e estoque permanecem juntos por compartilharem a mesma entidade e lock. Os modelos continuam centralizados: o monólito usa um único banco e transações entre domínios.

As páginas HTML são públicas e não contêm dados operacionais. A autorização é aplicada às APIs; o JavaScript redireciona usuários sem sessão.

Para localizar a implementação de uma tela, consulte o [mapa de módulos e regras de manutenção](plans/refatoracao-modulos.md). `pdv/actions.js` preserva a interface pública; os CSS originais são manifestos ordenados. Documente responsabilidade, dependências e invariantes de cada arquivo novo ou alterado. Use 400 linhas como sinal para revisar responsabilidades, não como motivo para divisões artificiais.

| Tela | URL | Entrada JavaScript |
|---|---|---|
| Login | /login | features/auth/login.js |
| PDV | / | features/pdv/app.js |
| Admin | /admin | features/admin/admin.js |

## Desenvolvimento

Ambiente validado com Python 3.13, Node.js e PostgreSQL 17. Use um ambiente virtual exclusivo.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
npm ci
```

Configure um `.env` local, nunca versionado:

```dotenv
SUPABASE_URL=https://SEU_PROJETO.supabase.co
SUPABASE_ANON_KEY=CHAVE_PUBLICA
SUPABASE_SERVICE_ROLE_KEY=CHAVE_PRIVADA_APENAS_NO_BACKEND
DATABASE_URL=postgresql+psycopg2://USUARIO:SENHA@HOST/BANCO
SECRET_KEY=SEGREDO_ALEATORIO
FLASK_DEBUG=false
ALLOWED_ORIGINS=http://localhost:5000
DB_POOL_SIZE=5
DB_MAX_OVERFLOW=5
DB_POOL_TIMEOUT=10
STORAGE_BUCKET=produto-imagens
```

### Desenvolvimento local com HTTP

Em desenvolvimento, execute a aplicação pelo ambiente virtual e acesse somente `http://localhost:5000`:

```powershell
$env:FLASK_DEBUG='true'
$env:ALLOWED_ORIGINS='http://localhost:5000,http://127.0.0.1:5000'
.\.venv\Scripts\python.exe wsgi.py
```

Se preferir, coloque esses dois valores no `.env` local. O `SUPABASE_URL` continua sendo a URL HTTPS do projeto Supabase; isso não significa que a página local precise usar HTTPS. Para login por senha, usado atualmente pelo projeto, não há redirect OAuth. Se forem habilitados magic link ou OAuth, adicione no Supabase Auth → URL Configuration os redirects locais `http://localhost:5000/**` e `http://127.0.0.1:5000/**`, sem substituir o Site URL HTTPS de produção.

Em produção, mantenha `FLASK_DEBUG=false`, use a URL pública HTTPS e configure `ALLOWED_ORIGINS` somente com origens HTTPS autorizadas. Nunca use `SUPABASE_SERVICE_ROLE_KEY` no navegador ou em arquivos estáticos.

A aplicação valida configurações obrigatórias ao iniciar. Dimensione conexões considerando
`workers × (DB_POOL_SIZE + DB_MAX_OVERFLOW)` e o limite efetivo do Supabase.

Prepare o banco conforme [migrations/README.md](migrations/README.md); não execute a baseline diretamente sobre tabelas existentes.

```powershell
.\.venv\Scripts\python.exe wsgi.py
```

Em Linux, o entry point WSGI é `wsgi:application`. Nenhum deploy é executado pelos scripts de teste.

## Contratos e integridade

- Operadores usam apenas seu próprio caixa. Administradores podem ajustar estoque/saldo e fechar outro caixa, mas vendas sempre pertencem ao caixa do operador autenticado.
- Um perfil inexistente pode sincronizar o cadastro com token válido, porém nasce como **operador inativo**. Ativação exige administrador. A tela de cadastro público permanece removida.
- Erros HTTP usam somente `{status, code, message, details, retryable}`.
- Vendas e recebimentos exigem `id_externo`, `caixa_id` e identidade de origem; o backend obtém o usuário do JWT. Pagamentos exigem `membro_id` e `saldo_esperado`; `valor` permite recebimento parcial na API.
- A fila IndexedDB persiste antes de liberar o carrinho. Apenas ACK com identidade correspondente retira a operação das pendências; o recibo permanece salvo. Logout não altera essa fila.
- Erros 401/403/409/422 exigem intervenção, sem retry automático. Falhas transitórias têm backoff e limite de tentativas.
- **Não limpe dados do navegador com operações pendentes.** Use “Operações pendentes” para exportar e reconciliar com o administrador.
- `totalEntradas = dinheiro + pix + cartao`; `recebimentoDivida` já está incluído e é apenas informativo. O histórico é paginado; os totais abrangem todo o filtro.
- Upload exige admin, imagem real até 4 MB/4096 pixels por lado e reencodificação PNG no backend. O bucket Supabase deve estar configurado; as policies precisam impedir escrita direta indevida.

## Testes isolados

### Consulta de dívidas por período

No PDV, selecione **Pendurar** e um membro. Na administração, use **Gestão de Membros → Extrato**.
As duas telas oferecem mês, intervalo de meses, datas personalizadas e limpeza do filtro, com paginação de 20 lançamentos.
O saldo acumulado atual permanece separado do resumo do período. Os filtros não fazem parte da venda ou do pagamento.

Os GETs existentes `/api/membros/extrato` e `/api/admin/membros/<id>/extrato` aceitam
`data_inicio` e `data_fim` juntos, no formato `AAAA-MM-DD`, além de `limite`/`offset`.
As datas são inclusivas no fuso `America/Sao_Paulo`; sem datas, consulta-se todo o histórico.
`total`, `membro`, `itens` e `paginacao` continuam disponíveis. Foram acrescentados `periodo`, `resumo`,
`criterio_quitacao`, `aviso` e valores/situação de quitação dos itens.

O backend considera que os pagamentos abatem primeiro as dívidas mais antigas, apenas para esta consulta,
sem gravar baixas. “Pago no período” considera os recebimentos daquele período; “Em aberto no período”
considera quanto ainda resta hoje dos débitos originados naquele período, inclusive após créditos posteriores.
Créditos de ajustes manuais são mostrados separadamente dos pagamentos. Se o histórico não corresponde
ao saldo oficial, os valores de quitação ficam indisponíveis, com aviso para conferência administrativa.

A verificação visual `node scripts/check_extrato_layout.mjs` usa Edge headless (ou `BROWSER_PATH`),
o servidor sintético na porta 5055 e respostas financeiras simuladas. Confere os filtros em 360, 480,
768, 900 e 1440 px, incluindo acesso à paginação e confirmação após rolagem. Capturas e medidas ficam
em `.test-logs/extrato/`. O script usa Bootstrap 5.3.3 da CDN ou a cópia local opcional
`.test-tools/bootstrap-5.3.3.min.css`.

Arquivos desta implementação:

| Área | Alterados | Criados |
|---|---|---|
| Backend (`backend/app/features/membros/`) | `routes.py`, `admin_routes.py`, `schemas.py`, `service.py` | `extrato.py` |
| Cliente HTTP (`static/js/shared/`) | `api.js` | `extrato-membro.js` |
| PDV (`static/js/features/pdv/actions/`) | `membros.js` | — |
| Administração (`static/js/features/admin/`) | `membros.js`, `financeiro.js` | — |
| Templates (`templates/`) | `ponto_venda.html`, `admin.html`, `pdv/modals/membros.html`, `admin/modals/membros.html` | `shared/extrato-membro.html` |
| CSS (`static/css/`) | — | `shared/extrato-membro.css` |
| Testes Python (`backend/tests/`) | `test_frontend_templates.py` | `test_extrato_membros.py` |
| Testes JS (`tests/`) | `actions.test.js`, `admin.test.js`, `helpers/pdv.js` | `extrato-membro.test.js` |
| Validação visual e documentação | `README.md` | `scripts/check_extrato_layout.mjs` |

### Execução

Nunca use Supabase ou banco operacional nos testes. `TEST_DATABASE_URL` aceita apenas loopback e nome começando com `pdv_test`. Cada teste cria um schema sintético exclusivo e aplica as migrações; os schemas são preservados para inspeção.

Com PostgreSQL local de testes na porta 55432:

No Windows, você pode extrair os binários portáteis indicados pelo [PostgreSQL oficial](https://www.postgresql.org/download/windows/) em `.test-tools/pgsql` e executar `scripts/start_test_postgres.ps1`. O script cria um cluster temporário exclusivo, mostra a URL e o comando para encerrá-lo; nunca usa o banco da aplicação.

```powershell
$env:TEST_DATABASE_URL='postgresql+psycopg2://postgres@127.0.0.1:55432/pdv_test'
.\.venv\Scripts\python.exe -m pytest -q -p no:cacheprovider --cov=backend/app
.\.venv\Scripts\python.exe -m ruff check backend migrations scripts
.\.venv\Scripts\python.exe scripts/run_js_tests.py
```

O último comando inicia um Flask exclusivo na porta 5055, executa toda a suíte Jest e encerra **somente esse processo**. Recusa a execução se a porta já estiver ocupada.
Para testes JS sem smoke HTTP: `npm test -- --runInBand --testPathIgnorePatterns=server.test.js`.

Sem `TEST_DATABASE_URL`, os testes PostgreSQL são sinalizados como **skipped**, não aprovados.
A CI em [.github/workflows/tests.yml](.github/workflows/tests.yml) fornece PostgreSQL isolado e executa ambas as suítes; sua execução remota ainda deve ser confirmada.

## Documentação

- [Diagnóstico arquitetural original](plans/relatorio-analise-arquitetura.md)
- [Referência de schema fornecida](plans/estrutura_banco.txt)
- [Relatório de implementação, validações e pendências](plans/relatorio-implementacao.md)
- [Migrações e estratégia de baseline](migrations/README.md)
- [Decisões sobre fila, autenticação e caixa](plans/decisoes-integridade.md)
- [Decomposição de arquivos, mapa de módulos e validação](plans/refatoracao-modulos.md)
- [Remoção de rotas, aliases e migrações de compatibilidade](plans/remocao-compatibilidade.md)

Projeto Integrador — UNIVESP. Uso educacional.
