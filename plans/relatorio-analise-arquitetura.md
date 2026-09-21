# Relatório de Análise Arquitetural — Sistema PDV Moto Clube

**Data da análise:** 18/09/2026  
**Escopo:** backend Flask/SQLAlchemy/Supabase, frontend Vanilla JS, persistência local/offline, testes, configuração e documentação presentes no repositório.

## Resumo Executivo

A solução possui uma base arquitetural coerente para um sistema de pequeno porte: monólito Flask com *app factory*, Blueprints, camada de serviços, modelos SQLAlchemy e frontend dividido em módulos ES. O backend recalcula preços no servidor, usa `Decimal`, mantém venda e baixa de estoque na mesma transação e implementa idempotência por `id_externo`. Esses são fundamentos positivos.

Entretanto, a saúde geral é **regular, com risco alto para integridade operacional e financeira**. Os problemas mais graves não estão na escolha da stack, mas nos limites transacionais e no protocolo cliente-servidor:

- vendas offline com erro HTTP ou de negócio são removidas definitivamente da fila local;
- respostas HTTP 4xx/5xx são tratadas pelo cliente como sucesso resolvido;
- vendas, quitações, estoque e abertura de caixa não possuem proteção contra concorrência;
- qualquer usuário autenticado pode alterar estoque e fechar um caixa informado por ID;
- recebimentos de dívida são somados duas vezes na exibição do relatório;
- não há testes automatizados do backend, do banco ou das condições de corrida;
- não existe migração/versionamento de schema no repositório, embora o README aponte para um arquivo SQL inexistente.

**Recomendação arquitetural:** manter o **monólito modular**. Microsserviços aumentariam operação, latência e complexidade transacional sem resolver os riscos atuais. A prioridade deve ser robustecer consistência, contratos HTTP, autorização, migrações, testes e observabilidade.

### Avaliação sintética

| Dimensão | Avaliação | Leitura |
|---|---:|---|
| Manutenibilidade | 6/10 | Boa separação inicial, mas arquivos centrais grandes, sessões/commits repetidos e documentação divergente. |
| Performance | 5/10 | Adequada para volume baixo; relatórios e admin têm N+1, carga integral e falta de paginação/agrupação SQL. |
| Qualidade de código | 5/10 | Há módulos e testes JS úteis, mas contratos e erros são inconsistentes e o backend está sem testes. |
| Integridade/segurança operacional | 3/10 | Fila offline, concorrência, caixa e autorização permitem perda ou inconsistência de dados. |

## Visão da Arquitetura Atual

O fluxo principal é:

1. templates Flask carregam módulos JS e o SDK Supabase via CDN;
2. o navegador autentica diretamente no Supabase Auth;
3. `static/js/api.js` acrescenta o JWT às chamadas REST;
4. decorators em `backend/app/auth_middleware.py` validam o token e consultam `usuarios`;
5. Blueprints chamam serviços, e os serviços manipulam modelos e fazem `commit`;
6. no PDV, vendas são primeiro gravadas em `localStorage` e sincronizadas em segundo plano.

Essa topologia é suficiente para o domínio atual. O problema é que o frontend assume sucesso antes da confirmação do servidor, enquanto o backend não oferece um protocolo de sincronização durável e observável.

## Análise Detalhada por Dimensão

### 1. Manutenibilidade

#### Pontos positivos

- `backend/app/__init__.py` usa *application factory* e registra Blueprints explicitamente.
- Há separação entre `routes/`, `services/`, `models/` e `schemas/`.
- O frontend foi separado em `api.js`, `state.js`, `ui.js`, `actions.js` e `reports.js`, reduzindo o acoplamento em relação a um único script global.
- `venda_service.py` concentra regras de venda, recalcula valores usando preços do banco e agrupa produtos antes da consulta.
- A nomenclatura de domínio em português é majoritariamente consistente.

#### Fragilidades

- **Concentração excessiva:** `backend/app/routes/admin.py` agrega produtos, membros, usuários, vendas, configurações e upload. `static/js/admin.js`, `static/js/actions.js`, `templates/admin.html` e `templates/ponto_venda.html` também concentram várias responsabilidades. Isso amplia o raio de impacto de alterações e dificulta testes isolados.
- **Limite transacional difuso:** cada serviço chama `db.commit()` e converte exceções em dicionários de status. Isso dificulta compor mais de uma operação no mesmo caso de uso e impede tratamento centralizado de erros.
- **Gerenciamento manual e repetitivo de sessão:** praticamente toda rota chama `next(get_db())` e fecha a sessão manualmente. O próprio `get_db()` já é um gerador, mas não é consumido como contexto/dependência. O padrão aumenta a chance de omitir rollback e gera muito código cerimonial.
- **Duplicação de superfície:** produtos possuem CRUD em `/api/produtos` e novamente em `/api/admin/produtos`. O cliente admin ainda implementa seu próprio `authFetch`, separado do wrapper de `api.js`.
- **Contratos heterogêneos:** venda usa Pydantic, mas produtos, estoque, caixa, membros, usuários, filtros e configurações recebem dicionários sem schema. Há respostas ora como objeto, ora como string transformada no cliente.
- **Fluxo de sincronização incoerente:** `/api/auth/sincronizar` usa `@requer_login`, mas esse decorator rejeita um usuário sem linha em `usuarios` (`auth_middleware.py:104-118`). Assim, o estado `pendente` documentado em `routes/auth.py:45-51` e o fluxo de criação em `routes/auth.py:62-83` não são alcançáveis por um novo perfil.
- **Documentação desatualizada:** o README cita `estrutura_novo_banco.txt`, `BACKEND_FLOWS.md`, `cadastro.html`, `cadastro.js` e `ponto_venda.js`, ausentes no repositório. Também afirma que `/` e `/admin` usam decorators, mas as rotas HTML em `backend/app/__init__.py` são públicas e a proteção ocorre apenas nas APIs.

#### Recomendações

- Organizar o backend por **módulo de domínio** (`vendas/`, `caixa/`, `estoque/`, `membros/`, `usuarios/`), mantendo em cada módulo suas rotas, schemas e serviços.
- Dividir o admin por recurso e extrair componentes de tabela/formulário no frontend.
- Adotar um `UnitOfWork` simples por requisição: a rota/caso de uso controla `commit/rollback`; repositórios e serviços não fazem commits internos.
- Criar schemas Pydantic para toda entrada externa e um envelope de erro estável, por exemplo `{code, message, details, retryable}`.
- Manter uma única camada HTTP no frontend e tipar/documentar o contrato com OpenAPI, mesmo permanecendo em Flask.

### 2. Performance e Escalabilidade

#### Gargalos identificados

- **N+1 em relatórios:** `relatorio_service.py:102` carrega todas as vendas do período e `:135-159` acessa `venda.itens` de forma lazy, potencialmente emitindo uma consulta adicional por venda.
- **N+1 no admin:** `routes/admin.py:423-427` serializa vendas; `Venda.to_dict()` acessa `usuario` e `itens`, também de forma lazy. Com limite 500, a tela pode gerar centenas de queries.
- **Relatórios em memória:** todas as vendas do período são materializadas e somadas em Python. Períodos longos aumentam memória, tempo e tamanho da resposta.
- **Listagens sem paginação:** produtos, membros, usuários e extrato usam `.all()`. Funciona no porte atual, mas não há limite contratual.
- **Inicialização redundante:** `static/js/app.js:223-226` dispara `/auth/me`, `/dados-iniciais` e `/caixa/aberto`; cada endpoint protegido repete consulta do usuário no decorator. Um endpoint de *bootstrap* poderia devolver perfil, catálogo e caixa vigente em uma rodada.
- **Cache de token sem limite de tamanho:** `_token_cache` é um dicionário por processo (`auth_middleware.py:43-65`). Entradas expiradas só são removidas se o mesmo token reaparecer. Em uso prolongado com muitos tokens, a memória cresce.
- **Pool potencialmente superdimensionado:** cada processo pode abrir até 15 conexões (`database.py:6-12`). Com quatro workers, o teto teórico é 60 conexões, possivelmente incompatível com o plano/pool do Supabase.
- **Polling permanente:** a fila é processada a cada 10 s e produtos a cada 60 s (`static/js/app.js:270-271`), inclusive quando a aba está oculta. Isso gera tráfego e consultas desnecessárias.
- **Log por toda requisição:** `backend/app/__init__.py:24-33` escreve uma linha de performance inclusive para assets/health, podendo aumentar I/O e custo de logs.

#### Otimizações propostas

- Usar `selectinload(Venda.itens)` e `joinedload(Venda.usuario)` nas listagens imediatamente; em seguida mover totais de relatórios para `SUM`, `GROUP BY` e projeções SQL.
- Paginar por cursor/data e ID. Manter um limite máximo validado para extratos e vendas.
- Criar `/api/bootstrap` retornando perfil, produtos, membros, configuração e caixa ativo em uma resposta versionada.
- Trocar o dicionário de tokens por `cachetools.TTLCache(maxsize=..., ttl=...)` ou validar JWT localmente com JWKS e rota de rotação de chaves; manter a consulta de perfil/ativo conforme a necessidade de revogação.
- Dimensionar `pool_size`, `max_overflow` e quantidade de workers a partir do limite real do Supabase e da carga medida.
- Pausar polling com `document.visibilityState`, usar *backoff* com jitter e sincronizar imediatamente em eventos `online`/mudança de estado.
- Registrar métricas agregadas e logs estruturados com amostragem, em vez de uma mensagem informativa para cada requisição.

### 3. Qualidade de Escrita e Código

#### Pontos positivos

- Funções e classes do backend possuem docstrings e nomes de domínio claros.
- Valores monetários no backend usam `Decimal` e colunas `Numeric`.
- O total de uma venda é recalculado no servidor; preço e total enviados pelo cliente não são confiados.
- O frontend escapa conteúdo dinâmico nos principais pontos de `innerHTML`.
- Existem testes Jest de utilitários, estado, UI e ações, além de testes HTTP de fumaça.

#### Problemas

- **Erro HTTP não é erro de aplicação:** `api.js:212-237` trata somente 401 de forma especial e retorna o JSON de 400, 403, 404 ou 500 como uma Promise resolvida. Isso quebra o fluxo de fechamento de caixa, pagamento, relatórios e fila.
- **Exceções vazam detalhes internos:** várias rotas/serviços retornam `str(e)` ao navegador, por exemplo `routes/admin.py:430-432` e `:482-485`. Isso expõe detalhes do banco e torna a mensagem pública dependente da infraestrutura.
- **Catch-all excessivo:** muitos `except Exception` transformam falhas distintas em `status='erro'`, sem código estável e por vezes sem log. Erros de validação, conflito, infraestrutura e programação tornam-se indistinguíveis.
- **Validação parcial:** `caixa_id`, UUIDs, valores monetários, limites, datas, MIME/tamanho de upload e enumerações não são validados uniformemente. `int(request.args['limite'])` pode gerar 500, valores negativos de limite passam e datas inválidas são silenciosamente ignoradas.
- **Enums apenas em comentários:** perfil, status, tipo de venda, pagamento, categoria, origem e movimentação são `String` sem `Enum` ou `CheckConstraint` visível nos modelos.
- **Datas/fuso horário:** relatórios subtraem três horas manualmente (`relatorio_service.py:143-146`) e assumem UTC-3. Deve-se usar `zoneinfo.ZoneInfo('America/Sao_Paulo')` e intervalos semiabertos `[início, fim)`.
- **Dependências duplicadas:** há um `requirements.txt` raiz totalmente fixado e outro em `backend/` com limites abertos e `psycopg2-binary`, enquanto a raiz usa `psycopg2`. Isso reduz reprodutibilidade e confunde onboarding/deploy.
- **Ausência de padrão automatizado:** não foram encontrados Ruff/Black/Mypy/ESLint/Prettier, hooks de pre-commit ou pipeline CI.
- **Cobertura desequilibrada:** os testes exercitam o frontend, mas não há testes Python para autenticação, transações, concorrência, relatórios, idempotência, permissões ou falhas parciais Supabase/banco.

#### Verificações realizadas

- Parsing de AST Python: **34 arquivos válidos**.
- Verificação de sintaxe JavaScript com `node --check`: **9 arquivos válidos**.
- `npm test -- --runInBand`: **não executou**, pois `node_modules/jest/bin/jest.js` não está instalado no ambiente. Isso não prova falha nos testes, apenas impede validar o resultado neste checkout.
- Não foi feita integração contra o Supabase/banco de produção.

## Pontos Críticos

### C1 — Perda de vendas na fila offline

**Severidade: Crítica**

**Evidência:** `static/js/actions.js:497-505` remove o primeiro item da fila em toda Promise resolvida, inclusive quando `API.processarVenda()` retorna uma string iniciada por `Erro`. O próprio toast informa que a venda foi descartada. Além disso, `api.js:212-237` resolve respostas 4xx/5xx como dados normais. `api.js:287-305` apaga chaves `motoBar*` no logout, incluindo a fila, exceto três chaves explicitamente preservadas em uma troca de operador.

**Impacto:** uma venda pode ser entregue/recebida no caixa e desaparecer do banco após erro de estoque, token, validação, conflito, falha 500 ou logout. Isso afeta faturamento, estoque e auditoria.

**Correção:**

1. nunca remover da fila sem ACK explícito `status=ok|duplicado`;
2. classificar falhas em `retryable`, `conflict` e `dead_letter`;
3. guardar tentativas, último erro e data, oferecendo tela de reconciliação;
4. migrar a fila de `localStorage` para IndexedDB e preservá-la no logout;
5. usar `crypto.randomUUID()` como chave idempotente e manter constraint única no banco;
6. fazer o wrapper HTTP rejeitar qualquer `!response.ok`, preservando status e corpo.

### C2 — Corridas de estoque e saldo de membro

**Severidade: Crítica**

**Evidência:** `venda_service.py:111-121` lê produtos, valida o estoque e posteriormente decrementa objetos em memória (`:179-185`), sem `SELECT ... FOR UPDATE`, update condicional ou versão otimista. O saldo do membro é lido e sobrescrito da mesma maneira (`:328` e `:367-398`).

**Impacto:** duas requisições simultâneas podem vender o mesmo último item; ambas ficam registradas e o estoque final reflete apenas uma baixa. Duas quitações simultâneas podem gerar recebimentos duplicados do saldo integral.

**Correção:** bloquear produtos e membro na transação com `with_for_update()` em ordem determinística, ou usar updates atômicos condicionais (`estoque_bar = estoque_bar - qtd WHERE estoque_bar >= qtd`) verificando `rowcount`. Criar testes concorrentes reais em PostgreSQL.

### C3 — Autorização insuficiente em estoque e caixa

**Severidade: Alta**

**Evidência:** `PUT /api/produtos/estoque` exige somente `@requer_login`, embora a UI simule uma segunda senha. `/api/admin/verificar-senha` é público e sem rate limit; obter a resposta positiva não gera uma permissão server-side. `caixa_service.py:81-91` fecha qualquer caixa aberto pelo ID recebido, sem verificar o dono ou perfil. `:137-147` aceita qualquer `caixa_id` e ainda retorna qualquer caixa aberto como fallback.

**Impacto:** um operador autenticado pode contornar a senha do estoque chamando a API diretamente, alterar quantidades e fechar/usar o caixa de outro operador.

**Correção:** substituir a senha compartilhada por RBAC/capacidade persistida (`estoque:ajustar`, `caixa:fechar_qualquer`), exigir essa permissão na API e validar associação entre usuário, venda e caixa. Remover o fallback para “qualquer caixa”.

### C4 — Abertura e fechamento de caixa inconsistentes

**Severidade: Alta**

**Evidência:** `static/js/actions.js:457-469` marca o caixa como aberto antes do retorno da API e mantém esse estado mesmo em falha. `static/js/reports.js:160-177` fecha o estado local e faz logout em qualquer resposta resolvida, inclusive um JSON de erro. No banco, a abertura faz “consulta e depois insert” (`caixa_service.py:28-50`) sem constraint parcial para impedir dois caixas abertos por operador.

**Impacto:** o PDV pode aceitar vendas com `caixa_id` nulo/antigo; o usuário pode ser desconectado acreditando que o caixa foi fechado quando o servidor rejeitou; aberturas concorrentes podem criar dois turnos ativos.

**Correção:** confirmar estado somente após ACK; impor no banco um índice único parcial para caixa aberto por operador; bloquear fechamento concorrente; validar que vendas referenciam caixa aberto e autorizado.

### C5 — Total financeiro duplicado no frontend

**Severidade: Alta**

**Evidência:** o backend adiciona recebimento de dívida ao método de pagamento e também a `recebimentoDivida` (`relatorio_service.py:160-168`); `totalEntradas` já soma dinheiro, pix e cartão (`:179`). O frontend volta a somar `recebimentoDivida` em `static/js/reports.js:58-64`.

**Impacto:** relatório exibido/impresso superestima o caixa pelo valor das dívidas recebidas.

**Correção:** definir uma única semântica no contrato. Recomenda-se `totalEntradas = dinheiro + pix + cartao`, com `recebimentoDivida` apenas como quebra informativa, e o frontend deve renderizar `res.totalEntradas` sem recalcular.

### C6 — Banco sem schema versionado, constraints e índices verificáveis

**Severidade: Alta**

**Evidência:** não há Alembic/migrations nem o `estrutura_novo_banco.txt` citado no README. Nos modelos só são visíveis unicidade de email e `id_externo`; não há `CheckConstraint` nem índices explícitos para datas, FKs e filtros frequentes.

**Impacto:** ambientes podem divergir silenciosamente; deploy e rollback não são reproduzíveis; performance e invariantes dependem de configuração manual não auditável.

**Correção:** adotar Alembic, gerar uma migração-base a partir do banco confirmado e adicionar constraints/índices. Priorizar `vendas(criado_em)`, `vendas(caixa_id, criado_em)`, `vendas(usuario_id, criado_em)`, `movimentacoes_membro(membro_id, criado_em)`, status de caixa, FKs e checks de valores não negativos.

### C7 — Testes não protegem os riscos de negócio

**Severidade: Alta**

**Evidência:** todos os testes versionados são JavaScript. `tests/server.test.js` depende de servidor externo em execução e valida principalmente disponibilidade de rotas/assets. Não há testes Python, fixtures PostgreSQL, CI ou cobertura configurada.

**Impacto:** regressões em venda atômica, relatório, autorização, caixa e idempotência podem chegar a produção sem detecção.

**Correção:** introduzir Pytest com app/test client, banco PostgreSQL efêmero, doubles do Supabase Auth, testes de contrato e cenários de concorrência. Executar `npm ci` + Jest e Pytest em CI.

## Outros Pontos de Melhoria

- **Modelo de upload:** o admin envia diretamente ao Supabase Storage, mas existe rota de fallback para disco local. Padronizar em Storage; disco local não é compartilhado entre instâncias nem persistente em muitos PaaS. Validar tamanho, MIME e conteúdo e revisar as policies do bucket.
- **Supply chain/CSP:** Supabase JS usa `@2` sem versão exata e scripts CDN não possuem SRI. Fixar versões, avaliar bundle local e implantar CSP; o script inline e atributos `onerror` atuais exigem refatoração para uma CSP restritiva.
- **Configuração:** falhar na inicialização quando URL/chaves Supabase estiverem ausentes; evitar `debug=True` fixo nos entrypoints; validar e normalizar `ALLOWED_ORIGINS`.
- **Observabilidade:** adicionar `request_id`, `user_id`, `caixa_id` e `id_externo` aos logs estruturados; medir latência de banco/Supabase, profundidade/idade da fila, conflitos e vendas em *dead letter*.
- **Cache:** aplicar cache somente onde a tolerância a desatualização estiver definida. Catálogo pode usar ETag/versionamento; estoque e caixa exigem dados consistentes ou versão de entidade.
- **Soft delete:** padronizar reativação, efeitos sobre relacionamentos e auditoria. Evitar depender somente de booleans sem `atualizado_em`, autor e motivo.
- **Tipos de domínio:** centralizar enums e valores monetários; não usar nomes de membro como identificador em operações financeiras. O frontend deve enviar `membro_id`.

## Plano de Ação Priorizado

| Prioridade | Ação | Impacto | Esforço | Resultado esperado |
|---:|---|---|---|---|
| P0 | Corrigir `_request` para rejeitar HTTP não-2xx e ajustar todos os consumidores | Alto | Baixo | Caixa, pagamentos e fila deixam de interpretar erro como sucesso. |
| P0 | Alterar a fila para remover somente em ACK `ok/duplicado`; preservar no logout e criar *dead letter* | Alto | Médio | Elimina descarte silencioso de vendas. |
| P0 | Corrigir a dupla soma de recebimentos no relatório e cobrir com teste | Alto | Baixo | Totais financeiros confiáveis. |
| P0 | Implementar locks/updates condicionais em venda, estoque e quitação | Alto | Médio | Evita venda excedente e pagamento duplicado sob concorrência. |
| P0 | Validar dono/status do caixa em abertura, venda, consulta e fechamento | Alto | Médio | Isola turnos e impede operações cruzadas. |
| P1 | Substituir senha de estoque por permissão server-side e proteger a rota | Alto | Médio | Autorização efetiva e auditável. |
| P1 | Adotar Alembic e registrar constraints/índices do banco | Alto | Médio | Ambientes reproduzíveis e invariantes garantidas. |
| P1 | Criar testes Pytest de serviços/rotas e testes PostgreSQL concorrentes | Alto | Médio | Proteção contra regressões de negócio. |
| P1 | Usar eager loading e agregações SQL nos relatórios/admin | Alto | Médio | Redução expressiva de queries e memória. |
| P1 | Introduzir schemas para todos os endpoints e handler global de erro | Alto | Médio | Contratos previsíveis, sem vazamento de exceções. |
| P2 | Dividir `admin.py`, `admin.js`, `actions.js` e templates por recurso | Médio | Médio | Menor acoplamento e onboarding mais simples. |
| P2 | Consolidar endpoint de bootstrap e API client | Médio | Médio | Menos round trips e menos duplicação. |
| P2 | Paginar vendas, membros e extratos | Médio | Médio | Crescimento controlado de latência/resposta. |
| P2 | Unificar dependências e configurar CI, lint, format e cobertura | Médio | Baixo | Builds reproduzíveis e qualidade contínua. |
| P2 | Atualizar README e escrever ADRs para offline, Auth e fechamento de caixa | Médio | Baixo | Onboarding e decisões arquiteturais rastreáveis. |
| P3 | Trocar cache de JWT por cache limitado/JWKS e ajustar polling | Médio | Médio | Menor consumo e comportamento previsível em escala. |
| P3 | Fortalecer CSP, SRI/bundle e upload | Médio | Médio | Redução de risco de supply chain e conteúdo malicioso. |

## Sequência Recomendada de Implementação

### Semana 1 — contenção de risco

- corrigir tratamento de HTTP e fechamento de caixa;
- impedir descarte da fila;
- corrigir relatório duplicado;
- bloquear alteração de estoque sem permissão;
- adicionar logs com `id_externo` e ferramenta de inspeção da fila pendente.

### Semanas 2–3 — consistência

- criar migrações e constraints;
- implementar locks/updates condicionais;
- garantir unicidade de caixa aberto;
- validar caixa ativo/dono em toda venda;
- adicionar testes de integração e concorrência.

### Semanas 4–6 — evolução estrutural

- uniformizar schemas, erros e sessão transacional;
- otimizar relatórios/admin;
- decompor módulos grandes;
- configurar CI, qualidade estática, cobertura e documentação arquitetural.

## Informações Ausentes para uma Avaliação Mais Precisa

1. DDL real do PostgreSQL, migrations existentes fora do repositório, índices, constraints, triggers e policies RLS.
2. Policies do bucket `produto-imagens` no Supabase Storage.
3. Topologia de produção: quantidade de instâncias/workers, plano Supabase, limites de conexão e persistência de disco.
4. Volume atual e esperado: vendas/dia, produtos, membros, operadores simultâneos e tamanho máximo de relatório.
5. Requisitos formais de disponibilidade offline, tempo máximo sem sincronizar e processo operacional de reconciliação.
6. SLOs, telemetria de produção, incidências conhecidas e consultas lentas.
7. Políticas de backup, restauração, retenção/auditoria e adequação à LGPD.
8. Pipeline real de build/deploy e estratégia de rollback.

Sem esses dados, a análise de performance é estática e qualitativa. Os problemas de integridade descritos, contudo, são demonstráveis diretamente no código e independem do volume atual.
