# Decomposição de arquivos e guia de manutenção

Data: 20/09/2026. Escopo: continuidade da organização por features, priorizando arquivos acima de 400–500 linhas. A etapa não altera contratos REST, schema ou regras financeiras.

## Contexto consultado

Foram lidos integralmente os quatro documentos existentes em `plans/`: [diagnóstico original](relatorio-analise-arquitetura.md), [schema fornecido](estrutura_banco.txt), [decisões de integridade](decisoes-integridade.md) e [relatório de implementação](relatorio-implementacao.md). O diagnóstico descreve o estado anterior às correções; a referência SQL é contextual, não um script para executar. As pendências operacionais não são consideradas resolvidas por esta refatoração.

## Resultado da divisão

As contagens anteriores correspondem ao início desta etapa, após a organização por features. As atuais incluem os novos comentários de documentação; pequenas diferenças de linhas finais não representam alteração funcional.

| Arquivo de entrada | Antes | Depois | Responsabilidade atual |
|---|---:|---:|---|
| `static/js/features/admin/admin.js` | 642 | 38 | Composição e inicialização do painel |
| `static/js/features/pdv/actions.js` | 553 | 11 | Fachada com exports compatíveis |
| `static/js/shared/api.js` | 404 | 284 | HTTP/Auth; modais extraídos para `modals.js` |
| `templates/admin.html` | 539 | 42 | Composição de parciais Jinja |
| `templates/ponto_venda.html` | 481 | 62 | Composição de parciais Jinja |
| `static/css/admin.css` | 917 | 8 | Manifesto de estilos base do admin |
| `static/css/admin-mobile.css` | 876 | 8 | Manifesto de adaptações mobile do admin |
| `static/css/ponto_venda.css` | 963 | 8 | Manifesto de estilos base do PDV |
| `static/css/ponto_venda-mobile.css` | 541 | 6 | Manifesto de adaptações mobile do PDV |

`tests/actions.test.js` ficou com 302 linhas; preparação de DOM/mocks/IndexedDB foi extraída para `tests/helpers/pdv.js`, sem retirar cenários.

O inventário final não encontrou arquivos com 400 ou mais linhas nas extensões `.py`, `.js`, `.css`, `.html`, `.mako`, `.sql` e `.ps1` em `backend/app`, `backend/tests`, `static/js`, `static/css`, `templates`, `tests`, `migrations` e `scripts`. O maior é `static/css/common.css`, com 376 linhas, não alterado nesta etapa. Dependências, artefatos gerados, imagens, lockfiles e documentos não fazem parte dessa métrica.

## Mapa para localizar implementações

### Administração — `static/js/features/admin/`

| Arquivo | Responsabilidade e vínculo |
|---|---|
| `admin.js` | Entrada: DOMContentLoaded, gestos, eventos e carga inicial |
| `events.js` | Conecta IDs/data-actions dos templates aos handlers; inicializar uma vez |
| `navigation.js` | Abas/sidebar; lê bindings vivos de membros/usuários para carga sob demanda |
| `produtos.js` | Cadastro, reativação, upload e ajustes de estoque; cache local de produtos |
| `membros.js` | Cadastro, extratos e ajuste de saldo; exporta o estado da listagem |
| `usuarios.js` | Cadastro/ativação de usuários pela API; exporta o estado da listagem |
| `vendas.js` | Filtros e renderização do histórico |
| `configuracoes.js` | Configurações globais persistidas no servidor |
| `requests.js` | Adapta o cliente HTTP compartilhado; falha exibe toast e retorna `null` |
| `ui.js` | Escape de texto, toast, skeleton e fechamento de modais |

Os módulos de recurso não importam a entrada `admin.js`. `events.js` coordena os handlers, sem concentrar novamente o CRUD. Consumidores de `authFetch` devem interromper a operação quando recebem `null`; não exibir sucesso ou recarregar como se a gravação tivesse ocorrido.

### Ações do PDV — `static/js/features/pdv/actions/`

| Arquivo | Responsabilidade e contrato preservado |
|---|---|
| `carrinho.js` | Seleção do catálogo, quantidades, observações e abertura da edição de produto |
| `estoque.js` | Modo de estoque direto para admin e ajuste com valores esperados; backend exige administrador |
| `pagamentos.js` | Troco, pagamento, venda e recebimento; persistência durável precede limpeza/impressão |
| `membros.js` | Seleção/extrato e venda fiada; identidade financeira por `membro_id` |
| `sessao.js` | Operador, abertura somente após ACK e preferências locais de impressão |
| `sincronizacao.js` | Envio, falhas, reconciliação, exportação e atualização silenciosa de estoque |

`actions.js` continua sendo a fachada para os consumidores existentes. Entre implementações, importe o módulo responsável diretamente. `offline-queue.js` continua responsável pela persistência e validação de ACK; não duplicar essa lógica em pagamentos ou sincronização. `state.js`, `ui.js` e `reports.js` mantêm suas responsabilidades anteriores.

O modal e a função de senha compartilhada foram removidos. A checagem visual de perfil orienta a interface, mas não substitui a autorização na API.

### Compartilhados, templates e estilos

- `static/js/shared/modals.js`: somente diálogos e ciclo de vida no DOM. Consumidores importam `UIModal` diretamente.
- `templates/admin/`: navegação e abas por recurso; `modals/membros.html` contém extrato/ajuste de saldo e `modals/estoque.html` contém ajuste de estoque.
- `templates/pdv/`: navegação e catálogo/carrinho; `modals/` separa abertura, venda, estoque, membros, relatórios/caixa e configurações.
- `static/css/features/admin/base/`: layout, formulários, tabelas, botões/badges, modais/feedback, responsivo e detalhes.
- `static/css/features/admin/mobile/`: tablet, navegação, layout/formulários, tabelas, modais, vendas e variantes de viewport.
- `static/css/features/pdv/base/`: cabeçalho, catálogo, carrinho, pagamento, modais/relatórios, responsivo e componentes.
- `static/css/features/pdv/mobile/`: tablet, navegação, catálogo/carrinho, modais e variantes de viewport.

Os parciais Jinja são incluídos pelas páginas principais, sem criar novas rotas. Seus IDs pertencem à página composta e devem continuar únicos. Comentários Jinja documentam os consumidores sem acrescentar conteúdo ao HTML servido.

Os quatro CSS públicos conservam seus caminhos e carregam componentes com `@import` em um nível. A ordem é intencional: blocos do mesmo breakpoint foram separados mantendo a cascata. URLs de assets adicionadas futuramente devem ser relativas ao arquivo do componente, não ao manifesto.

## Convenções de documentação e evolução

1. Cada arquivo extraído contém cabeçalho com responsabilidade, consumidor/dependência e, quando relevante, invariantes. Atualize-o junto com mudanças no código.
2. Documente o motivo de contratos como ACK, identidade imutável, saldo/estoque esperado e ordem da cascata. Evite comentários que apenas repetem a instrução seguinte.
3. Para uma nova funcionalidade, altere o módulo de recurso, seu parcial e os testes correspondentes. Entradas/fachadas devem permanecer pequenas e sem regras de negócio.
4. Use 400 linhas como alerta de revisão, não limite cego. Prefira divisão por responsabilidade; não crie módulos vazios ou abstrações genéricas somente para reduzir a contagem.
5. Preserve imports públicos e caminhos servidos; ao adicionar módulos, execute os testes HTTP que percorrem as dependências.
6. Registre decisões e limitações em `plans/`, mantendo o diagnóstico original como histórico e atualizando o backlog do relatório de implementação.

## Validação executada

| Verificação | Resultado |
|---|---|
| Pytest completo, PostgreSQL sintético local `pdv_test` em `127.0.0.1:55434` | 62 testes aprovados |
| `scripts/run_js_tests.py`, Flask exclusivo em `127.0.0.1:5055` | 160 testes aprovados, 9 suítes |
| `ruff check backend migrations scripts` | Aprovado nas regras incrementais configuradas |
| `node --check` em `static/js/` | 27 módulos aprovados |
| `git -c core.safecrlf=false diff --check` | Aprovado |
| Comparação dos corpos das funções antes/depois da extração | 45 funções admin e 33 funções PDV sem diferenças |
| CSSOM das folhas expandidas, antes/depois | 470 regras finais ordenadas preservadas |

Proteções adicionadas/atualizadas:

- `tests/admin.test.js`: nove cenários de cadastros, eventos, IDs, estoque esperado, navegação e erros.
- `tests/styles.test.js`: quatro fingerprints de seletores, declarações, media queries e ordem; normaliza apenas CRLF na representação das regras.
- `backend/tests/test_frontend_templates.py`: dois fingerprints do HTML renderizado, preservando tags, atributos e texto, ignorando comentários/espaçamento.
- `tests/server.test.js`: verifica por HTTP imports ESM e imports CSS, além do smoke existente.
- `tests/helpers/pdv.js`: isola a preparação dos testes; `tests/actions.test.js` conserva as asserções de comportamento.

Fingerprints foram capturados antes da extração. Para uma mudança intencional de HTML/CSS, revise a diferença semântica/visual antes de atualizar o hash; não o regenere apenas para deixar o teste verde. A cobertura não foi medida novamente: os 64% do relatório anterior pertencem àquela execução.

Ao final, o runner encerrou seu Flask e o cluster PostgreSQL temporário foi parado com `pg_ctl`. O encerramento do PostgreSQL exigiu permissão fora do sandbox, pois ele havia sido iniciado nesse contexto. Binários e dados sintéticos foram preservados; nenhum processo da aplicação do usuário foi encerrado.

## Limitações e próximas etapas

- CSS modular e ESM nativo acrescentam requisições de arquivos. Esta entrega melhora manutenção, não comprova ganho de carregamento. Avaliar bundle após medição; não foi introduzida ferramenta de build.
- Igualdade estrutural/CSSOM não substitui homologação visual em navegador real, mobile, impressão e múltiplas abas. Esses testes permanecem pendentes.
- Não foram aplicadas migrações, deploy ou alterações no Supabase. A refatoração não resolve pendências de RLS/Storage, schema efetivo, Auth/banco ou preço offline já catalogadas.
- Próximo trabalho local prioritário: testes de falhas parciais em usuários/Auth. Depois, bootstrap consolidado e paginação completa, com contratos/testes próprios; nenhum desses itens é declarado concluído aqui.
- Publicar os módulos e templates junto com suas entradas; atualizar abas em janela controlada sem apagar IndexedDB/localStorage.
