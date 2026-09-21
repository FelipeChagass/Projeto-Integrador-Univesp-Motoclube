# Relatório de implementação — PDV Moto Clube

Data: 19/09/2026. Referências: `relatorio-analise-arquitetura.md` e `estrutura_banco.txt`. O relatório original permanece como diagnóstico histórico; seus caminhos anteriores foram reorganizados nesta entrega.

Atualização de 20/09/2026: concluída a decomposição dos arquivos grandes de frontend e dos testes de ações. Mapa, contratos preservados e novas verificações em [refatoracao-modulos.md](refatoracao-modulos.md). Os resultados da seção E registram o marco anterior; a nova rodada aprovou 62 testes Python e 160 JavaScript (9 suítes), sem nova medição de cobertura.

Atualização posterior de 20/09/2026: removidas as superfícies mantidas somente para versões anteriores. Isso inclui a rota de senha de estoque, aliases de páginas/payload/erros, reexport de modal e migração da fila antiga em `localStorage`. O histórico abaixo descreve o marco em que a migração ainda existia; o contrato vigente está em [remocao-compatibilidade.md](remocao-compatibilidade.md). A rodada final aprovou 67 testes Python e 158 JavaScript; os dois testes JS retirados pertenciam exclusivamente à migração removida.

## A. Resumo executivo

Foram implementadas correções nos riscos prioritários de integridade: respostas HTTP, persistência da fila, idempotência, concorrência de estoque/saldo, autorização e confirmação de caixa, além dos totais financeiros. Foram adicionados Alembic, testes PostgreSQL reais, testes IndexedDB/HTTP, validação de imagens e uma configuração de CI.

O projeto continua um monólito modular. Backend e JavaScript foram organizados por funcionalidades; imports, composição da aplicação, templates e testes foram adaptados. Nenhum deploy ou migração no banco operacional foi realizado. A aplicação das migrações e a homologação Supabase/navegador/impressora são condições anteriores à implantação.

## B. Problemas corrigidos e validação

### C1 — Perda de operações offline

- Causa: wrapper resolvia erros HTTP como sucesso; fila removia vendas sem ACK válido e era apagada no logout.
- Correção: `static/js/shared/api.js` lança erros estruturados; `features/pdv/offline-queue.js` mantém IndexedDB, payload/identidade imutáveis, tentativas, último erro, backoff e recibos. Migração do legado verifica registros e conserva backup. `actions.js` oferece pendências, exportação e reenvio pelo operador de origem. Login passou a verificar a resposta da sincronização.
- Testes: `tests/api.test.js`, `tests/offline-queue.test.js`, `tests/actions.test.js`; idempotência e resposta perdida em `backend/tests/test_finance_postgres.py`.
- Resultado: aprovados cenários de HTTP/rede, confirmação divergente, logout, outro operador, migração divergente, falha de persistência e reenvio com mesmo ID.
- **Status: resolvido nos cenários automatizados; homologação em navegador real pendente.** Reconciliação de legado sem identidade permanece deliberadamente manual, sem atribuição silenciosa.

### C2 — Corridas de estoque, saldo e recebimentos

- Causa: leitura seguida de alteração sem proteção interprocessos.
- Correção: `backend/app/features/vendas/service.py`, `caixa/service.py`, `produtos/service.py` e `membros/service.py` usam locks PostgreSQL/UoW. Ordem determinística: chave externa → caixa → membro → produtos. Quitação exige saldo esperado; payload_hash detecta reutilização incompatível do ID. Ajustes absolutos de estoque exigem valores esperados.
- Testes: `test_finance_postgres.py`: último item em dois caixas, débito fiado concorrente, quitação concorrente, duplicidade simultânea, rollback ao falhar item e rollback de caso de uso composto. Conexões e transações independentes, com barreira de início.
- Resultado: uma venda no último item; um recebimento para a mesma dívida; atualização de ambos os débitos fiados; nenhuma alteração financeira parcial após falha.
- **Status: resolvido nos cenários testados em PostgreSQL 17.11.** Testes de carga/volume real ainda não realizados.

### C3 — Autorização de estoque e caixa

- Causa: senha verificada apenas no cliente e ausência de verificação do dono do caixa.
- Correção: `features/auth/middleware.py` centraliza capacidades; endpoints de ajuste exigem admin; serviços validam dono/status. Não há fallback para outro caixa. Admin pode fechar outro caixa explicitamente; venda continua vinculada ao próprio operador. A rota de senha compartilhada retorna 410 e não concede permissão.
- Testes: `test_auth_postgres.py` e `test_finance_postgres.py`, incluindo manipulação de usuário/caixa no JSON, operador em endpoint admin, perfil inativo e conflito de estoque.
- **Status: resolvido nos cenários automatizados.** Policies RLS/Storage e configurações do Supabase não foram auditadas.

### C4 — Caixa otimista e abertura simultânea

- Causa: alteração local antes de confirmação, fechamento com erro provocando logout, ausência de exclusividade de abertura.
- Correção: frontend exige ACK e usa o valor de abertura devolvido pelo servidor. Erros mantêm caixa/operador. Pendências impedem fechamento no dispositivo. Backend serializa abertura pelo usuário e operações pelo caixa; índice parcial protege um caixa aberto por operador.
- Testes: abertura/fechamento simultâneos, venda versus fechamento, tentativa de segundo caixa diretamente no banco e fechamento de outro usuário; Jest cobre abertura aguardando ACK, valor já existente, falhas de fechamento e bloqueio por pendência.
- **Status: resolvido nos cenários testados; índice depende de implantação da migração.** Outros dispositivos e abas precisam de homologação operacional; operações rejeitadas permanecem reconciliáveis.

### C5 — Recebimento de dívida contado duas vezes

- Causa: frontend somava novamente o recebimento já incluído por método no backend.
- Correção: `features/relatorios/service.py` agrega com Decimal/SQL; `features/pdv/reports.js` usa `totalEntradas`. Recebimento é informativo; relatório e impressão seguem o mesmo contrato. Datas usam São Paulo, sem subtração manual de horas.
- Testes: quatro métodos normais, venda fiada, pagamento parcial/integral e repetição idempotente; totais conhecidos: dinheiro 14 + pix 16 + cartão 20 = entradas 50; dívida recebida 10 já incluída; abertura 100 → total geral 150. Jest verifica exibição e impressão sem chegar a 160.
- **Status: resolvido no contrato testado.** Período/dia e dados históricos precisam de conferência em homologação.

### C6 — Schema sem versionamento

- Revisão do diagnóstico: o SQL fornecido **já tinha** checks, PKs, FKs, unicidade de email e ID externo; a ausência no ORM não demonstrava ausência no banco. Índices, triggers e RLS não exibidos no documento não foram presumidos inexistentes.
- Correção: modelos alinhados a numeric sem precisão restritiva, defaults, checks e identity de produtos. Alembic com baseline congelada e revisão aditiva de integridade; sem recriar indiscriminadamente restrições existentes.
- Testes: todas as fixtures PostgreSQL aplicam ambas as migrações. `test_migrations.py` cobre schema ocupado, duplicados sem alteração de dados e adoção de baseline/índice equivalente.
- **Status: parcialmente resolvido.** Validado em banco sintético; comparação do schema efetivo, backup e aplicação em homologação/produção ainda pendentes.

### C7 — Ausência de proteção automatizada do backend

- Correção: Pytest, fixtures isoladas, testes de contrato/rotas/serviços/concorrência, fake-indexeddb, Ruff incremental, cobertura e workflow GitHub Actions. Smoke HTTP agora inicia/encerra seu próprio Flask e não usa o servidor do usuário.
- **Status: parcialmente resolvido.** Suítes locais aprovadas, mas cobertura não é integral e CI remota ainda não executada. Administração de usuários entre Auth e banco tem cobertura baixa; mocks não substituem validação real do provedor.

### Problemas adicionais

- Dependência circular de criação do perfil: identidade autenticada separada da autorização de perfil. Novo perfil não se promove a admin/ativo. Testes de usuário novo/existente/inativo/token inválido e cache limitado aprovados.
- Upload: escrita direta pelo frontend e fallback em disco foram substituídos por endpoint admin com verificação de conteúdo/tamanho e PNG reencodificado. Objetos têm nomes únicos, sem sobrescrever imagem anterior. Validação local testada; upload real/Storage pendente. Falha depois do upload pode deixar objeto órfão, sem apagar dados existentes.
- Erros internos/validação: envelope central, campos públicos seguros, request ID e logs sem texto de exceções SQL/SDK. Testes cobrem status 400, 401, 403, 404, 409, 422, 500 e 503.
- Sessões repetidas: context manager e UoW nos fluxos financeiros; administração de usuários mantém transação/compensação legada, explicitamente não distribuída.
- Estoque na UI: tentativa malsucedida não confirma valores locais nem aplica novamente transferência visual do depósito ao repetir.

## C. Refatorações e performance

- `backend/app/core/`: configuração, banco/UoW, erros e schemas compartilhados.
- `backend/app/features/`: auth, admin, caixa, configurações, membros, PDV, produtos/estoque, relatórios, usuários e vendas. Rotas administrativas passaram a morar no domínio correspondente. Modelos relacionais permanecem centralizados em `models/`.
- `static/js/features/{pdv,auth,admin}` e `static/js/shared`: imports e templates atualizados; gestos genéricos separados da UI do PDV. URLs REST preservadas.
- Agregações financeiras no PostgreSQL; selectinload de itens e joinedload do usuário no admin; histórico/extrato/listagem de vendas com limites e offset. O teste de relatório limita o caso conhecido a **até cinco consultas**, sem alegar redução percentual de latência ou ganho sob carga.
- Cache de token limitado, pooling configurável e polling suspenso em aba oculta/offline. Não foi feito dimensionamento real do Supabase.

## D. Banco de dados

Migrações: `0001_baseline` e `0002_integridade`. Nova coluna nullable `vendas.payload_hash`; novos índices quando não há definição equivalente: exclusividade parcial de caixa aberto, datas/dono/caixa de vendas, itens por venda e movimentos por membro/data.

Históricos foram preservados. Não há backfill inventado de hashes. Duplicados de caixa bloqueiam a revisão antes de alterações. Downgrades destrutivos estão bloqueados. O FK externo de `usuarios` com Auth é preservado pela baseline, não por modelo local de `auth.users`.

Procedimento completo em `migrations/README.md`. Nenhuma alteração de schema/dados foi aplicada ao Supabase ou banco operacional.

## E. Testes e execução

Ambiente: Windows, Python 3.13.14, PostgreSQL portátil 17.11, Jest/jsdom/fake-indexeddb. O PostgreSQL foi iniciado exclusivamente em `127.0.0.1:55432`, banco `pdv_test`, com schemas sintéticos por teste.

Uma repetição em cluster novo criado pelo script na porta 55433 também aprovou os 60 testes Python. Ao final, as portas 5055, 55432 e 55433 foram verificadas sem servidor ativo. Binários, ambientes virtuais e dados sintéticos foram preservados em pastas ignoradas/temporárias, fora do versionamento.

| Comando | Resultado registrado |
|---|---|
| `.venv-test/Scripts/python.exe -m pytest backend/tests -q -p no:cacheprovider --cov=backend/app --cov-report=term --tb=short` com `TEST_DATABASE_URL` local | 60 aprovados; cobertura agregada de statements/branches: 64% |
| `.venv-test/Scripts/python.exe scripts/run_js_tests.py` | 145 aprovados, 7 suítes; inclui smoke HTTP |
| `npm test -- --runInBand --silent` | 145 aprovados antes da reorganização; runner acima confirmou novos caminhos |
| `.venv-test/Scripts/python.exe -m ruff check backend migrations scripts` | aprovado; regras incrementais E9/F63/F7/F82, não auditoria completa de estilo |
| `git -c core.safecrlf=false diff --check` | aprovado na revisão final |
| `npm audit --json` | última consulta retornou 0 vulnerabilidades reportadas; não é auditoria do sistema completo |
| `scripts/start_test_postgres.ps1 -PostgresSource .test-tools/pgsql -Port 55433` | cluster temporário criado e iniciado com sucesso, sem serviço Windows |
| `node --check` nos módulos de `static/js/` | 11 arquivos com sintaxe válida |

Falhas intermediárias foram corrigidas: quatro testes JS com contratos antigos; expectativa de separador monetário; erro de caminho de templates introduzido durante a edição; substituição mecânica de `app.config` na reorganização. As suítes foram reexecutadas após os ajustes.

Infraestrutura: instalação no ambiente `.venv` existente encontrou arquivo psycopg2 em uso; foi criado `.venv-test` separado. Download inicial falhou por proxy restrito e foi repetido com permissão. PostgreSQL no caminho com acento falhou com encoding UTF-8; cópia exclusiva em diretório temporário ASCII permitiu executar os testes. Cache Pytest no OneDrive apresentou permissão negada, por isso foi usado `-p no:cacheprovider`.

Não executados: testes E2E em navegador/impressora, integração real Supabase Auth/Storage/RLS, carga de produção, CI remota e auditoria de dependências Python. Cobertura global não implica cobertura de todos os caminhos financeiros ou administrativos.

## F. Pendências priorizadas

| Prioridade | Pendência | Impacto / esforço | Próxima ação |
|---|---|---|---|
| P0 operacional | Auditar schema efetivo, históricos com hash NULL e pendências locais | Alto / médio | Backup/exportação, reconciliação assistida e homologação antes de implantar |
| P1 | Auth + perfil local: falhas parciais e compensação administrativa | Alto / médio | Testar/criar fluxo explícito de reconciliação; não tratar como transação distribuída |
| P1 | Homologar contrato de preço offline e recibos em dispositivo real | Alto / médio | Conferir alteração de preço entre venda local e sincronização; não afirmar que IndexedDB é backup externo |
| P1 | Aplicar migração revisada e executar CI remota | Alto / médio | Somente após conferência/backup e aprovação operacional |
| P2 | Paginar catálogo/membros/usuários e navegação completa de históricos | Médio / médio | Atualmente catálogo e membros carregam integralmente; paginação de histórico existe na API |
| P2 | Consolidar bootstrap | Médio / médio | Inicialização ainda faz três chamadas; wrapper HTTP está consolidado |
| P2 — concluído em 20/09 | Decompor componentes maiores de admin/actions/templates/CSS | Médio / médio | Módulos internos e parciais extraídos; ver mapa e testes em `refatoracao-modulos.md` |
| P2 | Aumentar cobertura de cadastros, dias/períodos, uploads e falhas Auth | Alto / médio | Priorizar `features/usuarios/service.py` e `features/membros/service.py` |
| P3 | CSP, SRI/versão fixa ou bundle de SDK externo | Médio / médio | Ainda pendente; headers básicos não substituem CSP |
| P3 | Pool/carga, plano de queries, retenção de recibos e logs | Médio / médio | Medir em homologação representativa antes de ajustar |

O backlog P0 de perda/soma/locks/caixa foi implementado e testado. P1 migrations, autorização e infraestrutura de testes foram entregues; contratos/performance possuem os limites acima. P2 organização, documentação, componentização dos arquivos grandes e configuração de CI foram entregues, com bootstrap/paginação total pendentes. P3 cache/polling/upload foram melhorados; endurecimento completo de conteúdo e supply chain permanece pendente.

## G. Riscos de implantação

1. Banco precisa da revisão 0002 antes do código que lê `payload_hash`; não publique backend novo sobre schema antigo.
2. Frontend e backend devem ser atualizados juntos; imports/caminhos estáticos mudaram. Exporte pendências e peça recarga das abas em janela controlada. Não limpe IndexedDB/localStorage para atualizar.
3. Payloads antigos sem caixa/origem/membro inequívocos e IDs históricos sem hash entram em reconciliação; nunca são confirmados por aproximação.
4. Criação própria de perfil agora exige aprovação administrativa; login rejeitado não significa falha de rede. Ajustes de estoque exigem admin e valores esperados.
5. Storage precisa de bucket e policies corretos; o novo fluxo passa pelo backend. Não foi feita alteração externa de policies.
6. A migração cria índices transacionais e pode bloquear escrita. Planeje janela, monitore locks e preserve estratégia de recuperação.
7. Dependências novas incluem Alembic, tzdata/Pillow e ferramentas de teste; instale pelos arquivos versionados. Ambientes não devem depender do `.venv-test` local ou dos binários temporários.

Conclusão: houve melhoria efetiva e verificável nos fluxos prioritários, mas esta entrega não equivale a homologação de produção. Os itens parciais acima permanecem explicitamente abertos.
