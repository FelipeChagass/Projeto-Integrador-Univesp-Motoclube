# Uso pontual de utilities Bootstrap

Data: 25/09/2026. Escopo revisto pelo solicitante: manter Bootstrap 5.3.3 e simplificar apenas estilos com equivalência direta, priorizando manutenção e legibilidade. A proposta de migração para Tailwind foi cancelada; `package.json` e lockfile foram restaurados ao estado inicial.

## Critério de organização

O contexto permanece o de `decisoes-integridade.md`, `refatoracao-modulos.md` e `remocao-compatibilidade.md`: templates Jinja, módulos por funcionalidade e manifestos CSS ordenados. Nenhum arquivo de aplicação foi movido ou excluído.

Utilities curtas e estáveis ficam no HTML, inclusive no HTML produzido pelos módulos JS. Gradientes, medidas específicas, estilos de estado, combinações reutilizadas e adaptações responsivas continuam no CSS local. Antes de extrair uma propriedade, conferir todos os consumidores e sobrescritas: utilities Bootstrap usam `!important` e podem impedir ajustes mobile.

## Ajustes realizados

| Área | Ajuste | CSS preservado e motivo |
|---|---|---|
| `templates/login.html` / `static/css/login.css` | Layout de `.login-wrapper` usa `d-flex justify-content-center align-items-center min-vh-100`; largura/alinhamento do card, inputs, botão e wrapper da senha usam utilities; alinhamento do botão de senha usa flex utilities; `.lembrar-wrapper` substituída por `w-100 mb-2 text-start` | Gradientes, bordas, sombras, tamanhos, espaçamentos específicos, seletores dos filhos, foco/hover e breakpoint de 480 px |
| Admin: `base/layout.css`, `formularios.css`, `modais-feedback.css` | Removidas declarações de flex/alinhamento de `.header-left`, `.form-card-header` e `.modal-header` já fornecidas pelas classes dos templates | Padrões recorrentes dos cabeçalhos, formulários e modais, mantendo a ordem dos manifestos |
| Admin: `base/detalhes.css`, `membros.js`, `vendas.js` | `.admin-loading-text` substituída por `text-center text-white`; `.td-valor` por `fw-semibold` | Demais estilos de apresentação e seletores específicos |
| PDV: `base/catalogo.css`, `ui.js` | `.card-info` passa a usar `d-flex flex-column justify-content-between text-center` | `flex: 1` não equivale a `flex-fill`; padding de 8 px e sua variação mobile de 6 px permanecem no CSS |
| PDV: `base/componentes.css` e parciais de modais | `.modal-title-accent` e `.label-muted` substituídas por `text-white`; `.btn-trocar-operador` removida por duplicar a largura já fornecida por `.btn-action` | Demais medidas, cores customizadas e estados dos componentes |

Não houve mudança de IDs, eventos, autenticação, chamadas de API ou regras financeiras. Nenhuma media query foi alterada. Bootstrap CSS/JS e Bootstrap Icons continuam como antes; não há build ou dependência nova. Não foram introduzidas classes globais.

## Validação

- Comparação local com Edge headless e o CSS Bootstrap 5.3.3: 70 cenários, combinando login/admin/PDV, estados de formulário/modal/foco/hover e larguras de 360, 480, 481, 768, 769, 900 e 1440 px. Dimensões e propriedades computadas comparadas coincidiram em todos.
- 69 das 70 capturas coincidiram pixel a pixel. O login inicial a 360 px apresentou pequenas diferenças de pintura, apesar da igualdade das propriedades/dimensões medidas; não se afirma igualdade integral de pixels nesse caso.
- A comparação usa templates renderizados, amostras sintéticas de HTML dinâmico, imagens locais e animações desativadas. Fontes e ícones externos não foram carregados; não substitui conferência manual em dispositivo real com todos os assets.
- Fingerprints de CSS base admin/PDV e HTML do PDV foram atualizados após revisão das diferenças. Fingerprints mobile e HTML do admin permanecem iguais.
- `scripts/run_js_tests.py`: 158 testes JavaScript aprovados em 9 suítes, incluindo smoke HTTP das páginas e dependências estáticas, após restaurar as dependências originais com `npm ci`.
- Pytest não está instalado no ambiente `.venv` deste checkout. O digest estrutural foi conferido diretamente com Jinja e a função existente no teste, incluindo confirmação dos digests originais antes da alteração; isso não equivale a executar a suíte Python.

As cópias e capturas temporárias de comparação ficam em `.test-logs/`, ignorado pelo Git. Não houve deploy nem acesso ao banco operacional.
