# Paleta global — revisão de 02/10/2026

## Origem das decisões

A comparação foi feita com `git log`, `git show` e `git diff` do repositório ligado a `FelipeChagass/Projeto-Integrador-Univesp-Motoclube`. HEAD e a referência local `origin/hml` apontavam para `572c099`. Isso identifica o histórico disponível localmente; não comprova que o remoto não recebeu commits novos, pois não foi realizado fetch.

As cores mais recentes do PDV também estavam em alterações locais ainda não commitadas. Elas foram consideradas separadamente, sem atribuí-las aos commits.

| Commit analisado | Alteração relevante |
|---|---|
| `5b12922` — filtros do PDV | Fundo do filtro passou de `var(--bg-color)` para gradiente `#1a1a1a` → `#0d0d0d`; divisor `rgba(255,255,255,.03)` adicionado; preenchimento ativo `rgba(179,0,0,.2)` removido; ícones receberam `#C70808`; rótulo do total recebeu `#aaa`. |
| `405cea4` — alinhamento mobile | Ajustes de alinhamento; sem nova paleta. |
| `36e763e` — gaps dos filtros | Ajustes de espaçamento; sem nova paleta. |
| `f7ff4c4` — pagamentos e edição de vendas | No PDV, sobretudo organização dos botões. No editor administrativo, havia vermelho `#ed1b24` e bordas azul-acinzentadas `rgba(148,163,184,...)`, divergentes da linguagem neutra/vermelha compartilhada. |
| `6f51e0c` — títulos e sidebars | Referência histórica: títulos passaram de gradiente `#ff4c4c`/`#aa0000` para vermelho uniforme `#da0101`; ícones do header utilizavam vermelho `#b30000`. |

No código local anterior à consolidação, os fundos principais já tinham sido alterados para `#0D0B0B` e `#191919`; header, filtro e extremidades do carrinho usavam `#111111`; divisores, `#1F1F1F`. O usuário confirmou depois que o dourado `#5F451F` no header e o vermelho `#B30707` nos ícones eram intencionais. Ambos foram preservados.

## Mapeamento por função

“Anterior” nesta tabela corresponde aos valores encontrados no histórico/código, não necessariamente ao estado imediatamente anterior a cada edição desta revisão. As mudanças locais preexistentes estão identificadas acima.

| Função visual | Cor anterior | Nova cor | Variável global |
|---|---|---|---|
| Fundo principal | `#0d0d0d` | `#0D0B0B` (alteração local preexistente) | `--bg-color` |
| Superfície/card | `#1a1a1a` | `#191919` (alteração local preexistente) | `--card-bg` |
| Header e faixas do PDV | Gradientes `#2a2a2a`/`#222` e `#1a1a1a`/`#0d0d0d` | `#111111` (base local do PDV) | `--surface-bg` |
| Botão neutro, início do gradiente | `#1c1c1c` | `#1c1c1c`, centralizado | `--control-bg` |
| Hover de superfície | `#222` | `#222222`, centralizado | `--surface-hover` |
| Input | `#222` em telas antigas; `#0D0D0D` no login local | `#0D0D0D` | `--input-bg` |
| Texto principal | `#e0e0e0` | `#e0e0e0`, centralizado | `--text-primary` |
| Texto secundário | `#aaa` | `#aaa`, centralizado | `--text-secondary` |
| Placeholder/texto discreto | `#777`/`#666` no login; cinza padrão do navegador em outros inputs | `#999` | `--text-muted` |
| Divisor estrutural | Branco com opacidades `.03`, `.05` e `.06` | `#1F1F1F` (base local do PDV) | `--divider-color` |
| Borda de controle neutro | `rgba(255,255,255,.12)` | Mesmo valor, centralizado | `--border-color` |
| Borda discreta de painel/modal | `rgba(255,255,255,.08)` | Mesmo valor, centralizado | `--border-subtle` |
| Borda de input | `#555` em telas antigas; `#393939` no login local | `#393939` | `--input-border` |
| Borda inferior do header | `#5F451F`, restaurado pelo usuário | `#5F451F`, preservado | `--header-border` |
| Destaque de marca | `#c70808` | Mesmo valor, reutilizado | `--accent` |
| Hover de destaque | `#da0101` já usado no sistema | `#da0101` | `--accent-hover` |
| Ícones de marca/header | `#B30707`, restaurado pelo usuário | `#B30707`, preservado | `--accent-text` |
| Texto de destaque legível | Gradientes vermelhos e vermelhos escuros | `#ff3333`, já existente no login | `--accent-readable` |
| Sucesso | `#4caf50` | Mesmo valor, reutilizado | `--success` |
| Erro/ação de dívida | `#f44336` | Mesmo valor, reutilizado | `--danger` |
| Modo de edição de estoque | `#B30000` | Mesmo valor, reutilizado | `--edit-mode-color` |
| Aviso | Fundo `rgba(255,152,0,.15)` e borda `#ff9800` | Mesmos valores, reutilizados | `--warning-bg`, `--warning-border` |

Não foram criados tokens separados para fundo de modal, tabela e formulário: todos são superfícies, com `--card-bg` no corpo e `--surface-bg` nas faixas/cabeçalhos. A borda dourada é identidade do header, não um estado de aviso.

## Variáveis e integração

As variáveis existentes `--bg-color`, `--card-bg`, `--accent`, `--success`, `--danger`, `--edit-mode-color`, `--warning-bg` e `--warning-border` foram movidas de `common.css` para `tokens.css`. Os dois primeiros valores incorporam as alterações locais do usuário; os demais foram mantidos.

Foram adicionadas as variáveis de superfícies, textos, bordas e destaque listadas na tabela. `--accent-text` identifica o vermelho dos ícones; `--accent-readable` atende textos e foco de teclado, sem clarear os ícones da marca.

PDV e login carregam os tokens através de `common.css`. Admin carrega `tokens.css` diretamente, sem importar as regras de layout de `common.css`, que poderiam alterar sua estrutura. Os manifestos de módulos e a ordem da cascata foram mantidos.

## Aplicação por área

- **PDV:** header, catálogo, cards, carrinho, botões e selects usam a paleta semântica. O estado ativo do estoque deixou de misturar roxo com vermelho. Ao sair do modo estoque, o JavaScript remove a borda inline e restaura a borda dourada definida no CSS. Textos de total/dívida e títulos usam vermelho legível.
- **Admin:** fundos, formulários, tabelas, inputs, badges, navegação e modais usam os mesmos papéis visuais do PDV. Bordas azul-acinzentadas do editor foram substituídas por bordas neutras. Botões têm hover, foco de teclado e estado desabilitado identificáveis.
- **Modais e compartilhados:** superfícies, títulos, campos, divisores e diálogos gerados por JavaScript foram alinhados. A consulta de dívidas mantém os dois modos já implementados: todo o histórico ou período, com datas nativas; aplicar/limpar e anterior/próxima mantêm seus estados.
- **Login:** fundos, inputs, texto auxiliar e foco refletem a paleta. O vermelho escuro `#830000` do botão e a largura de 480px, alterações locais do usuário, foram preservados.
- **Responsividade:** sidebars, tabelas mobile, editor e carrinho utilizam os tokens, sem alterar os breakpoints, dimensões ou fluxos existentes. As espessuras de 2px dos divisores modificadas pelo usuário foram preservadas.
- **Logo:** o SVG fornecido passou a ser usado em login, headers, sidebars, favicons, defaults do PDV e cupons. A arte foi mantida, apenas normalizando finais de linha.

## Cores mantidas locais

- PIX `#00bcd4` e cartão `#2196f3`: distinguem meios de pagamento, não são superfícies nem marca global.
- Verde escuro de glow e variações de opacidade dos pagamentos: efeitos específicos. O verde principal dos ícones reutiliza `--success`.
- `#830000` no botão de login: escolha local preexistente preservada.
- `#8a0000`/`#8f0707`: extremos de gradientes específicos de confirmação/aplicar; a base reutiliza `--accent`.
- `#dddbdb` no rótulo do total: escolha local do carrinho preservada.
- Preto/branco, `#fffbe6`, `#ccc` de recibos e impressão: representação de papel e tinta; não recebem a paleta de superfícies escuras.
- Transparências de overlays, sombras e shimmer de carregamento: efeitos, não novas funções globais.
- Cores internas do SVG e setas SVG em data URI: arte/ícone autocontido, sem substituição cega de valores.

## Arquivos analisados e alterados

Foram analisados os manifestos `common.css`, `admin.css`, `admin-mobile.css`, `ponto_venda.css`, `ponto_venda-mobile.css`, seus módulos base/mobile, `login.css`, estilos compartilhados, templates correspondentes e JavaScript que define estilos dinamicamente.

Arquivos da consolidação:

- Novo: `static/css/tokens.css`.
- CSS compartilhado/login: `common.css`, `login.css`, `shared/extrato-membro.css`.
- Admin/base: `layout.css`, `formularios.css`, `tabelas.css`, `botoes-badges.css`, `detalhes.css`, `modais-feedback.css`.
- Admin/mobile: `navegacao.css`, `tabelas.css`, `modais.css`.
- PDV/base: `cabecalho.css`, `catalogo.css`, `carrinho.css`, `pagamento.css`, `componentes.css`, `modais-relatorios.css`.
- PDV/mobile: `navegacao.css`, `catalogo-carrinho.css`.
- JavaScript: `shared/modals.js`, `features/pdv/actions/estoque.js`, `actions/membros.js`, `ui.js`, `state.js`, `reports.js`.
- Templates: `admin.html`, `login.html`, `ponto_venda.html`, `admin/navigation.html`, `pdv/navigation.html`.
- Asset: `static/img/motorhead.svg`.
- Testes relacionados: `styles.test.js`, `server.test.js`, referências de logo em `state.test.js`, `utils.test.js`, `admin.test.js`, `helpers/pdv.js`.

Alterações já existentes da consulta de membros e outras edições locais foram preservadas. Este relatório não atribui todas as diferenças do worktree exclusivamente à revisão de cores.

## Contraste, validações e limites

Razões calculadas pelo método de luminância relativa:

| Combinação | Contraste |
|---|---|
| Texto principal `#e0e0e0` sobre card `#191919` | 13,32:1 |
| Texto secundário `#aaa` sobre card `#191919` | 7,57:1 |
| Placeholder `#999` sobre input `#0D0D0D` | 6,82:1 |
| Texto de destaque `#ff3333` sobre card `#191919` | 4,83:1 |
| Branco sobre botão `#c70808` | 6,06:1 |
| Branco sobre hover `#da0101` | 5,27:1 |

O vermelho dos ícones `#B30707` tem contraste 2,47:1 sobre card `#191919`. Ele foi preservado por determinação do usuário; não é utilizado como texto pequeno de destaque. A borda dourada permanece um elemento de identidade decorativo. Isso não constitui uma auditoria completa de acessibilidade de todo o sistema.

Validações executadas com servidor sintético isolado, sem banco ou credenciais de produção:

- Suíte Jest completa: **183 testes aprovados em 12 suítes**, incluindo rotas HTTP, imports dos módulos, consulta de dívidas e snapshots de CSS (`.venv/Scripts/python.exe scripts/run_js_tests.py`).
- Conferência Edge headless de login, PDV e admin em 360, 768 e 1440px: SVG carregado, sem overflow horizontal, borda calculada `rgb(95,69,31)` e ícones desktop `rgb(179,7,7)`.
- Estados hover, focus-visible, active, disabled e foco dos inputs; captura do editor financeiro administrativo e diálogo compartilhado.
- 20 cenários da consulta de dívidas: PDV/admin × 360/480/768/900/1440px × histórico/período, incluindo acesso à paginação e confirmação.
- SVG servido como `image/svg+xml`; tokens disponíveis e carregados nas telas.
- Busca por cores antigas em CSS, templates e estilos dinâmicos, com substituição apenas dos papéis equivalentes.
- `git diff --check`; hashes dos quatro manifestos atualizados após revisão visual. Teste específico protege o dourado e o vermelho dos headers.

Capturas e medições locais ficam em `.test-logs/paleta` e `.test-logs/extrato` (diretórios ignorados pelo Git). A verificação visual usa dados sintéticos e não substitui um teste autenticado com dados reais no ambiente de implantação.
