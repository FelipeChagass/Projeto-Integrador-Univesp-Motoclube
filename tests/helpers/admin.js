/**
 * Apoio aos testes dos painéis laterais do admin.
 * renderizarPaineis lê os campos reais de templates/admin/paineis/*.html e os envolve na
 * mesma estrutura gerada pelo macro painel_lateral (templates/shared/painel.html), já que o
 * Jest não executa Jinja. instalarOffcanvas imita o Offcanvas do Bootstrap: show/hide com
 * os eventos *.bs.offcanvas, respeitando preventDefault em hide, e data-bs-dismiss.
 */
import { readFileSync } from "node:fs";

const CHAMADA =
  /\{%\s*call painel_lateral\('([^']+)',\s*'([^']+)',\s*'([^']+)'\)\s*%\}([\s\S]*?)\{%\s*endcall\s*%\}/g;

export function renderizarPaineis(arquivo) {
  const template = readFileSync(arquivo, "utf8").replace(/\{#[\s\S]*?#\}/g, "");
  return [...template.matchAll(CHAMADA)]
    .map(
      ([, id, titulo, rotuloSalvar, campos]) => `
      <div class="offcanvas offcanvas-end painel-admin" tabindex="-1" id="${id}" aria-labelledby="${id}-titulo">
        <header class="modal-cabecalho modal-drag-header">
          <h2 id="${id}-titulo"><span data-titulo-texto>${titulo}</span><span class="modal-cabecalho-complemento" id="${id}-complemento"></span></h2>
          <button type="button" aria-label="Fechar" data-bs-dismiss="offcanvas">X</button>
        </header>
        <form class="offcanvas-body" id="${id}-form" novalidate>${campos}</form>
        <div class="modal-rodape">
          <button type="button" data-bs-dismiss="offcanvas">Cancelar</button>
          <button type="submit" form="${id}-form" id="${id}-salvar">${rotuloSalvar}</button>
        </div>
      </div>`,
    )
    .join("");
}

/** Envia o formulário do painel como o botão principal faria (Enter ou clique em Salvar). */
export function enviarPainel(id) {
  document
    .getElementById(`${id}-form`)
    .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

export const painelAberto = (id) =>
  document.getElementById(id).classList.contains("show");

export function instalarOffcanvas() {
  const instancias = new Map();
  const disparar = (elemento, tipo) => {
    const evento = new Event(tipo, { cancelable: true });
    elemento.dispatchEvent(evento);
    return !evento.defaultPrevented;
  };
  const instancia = (elemento) => {
    if (!instancias.has(elemento))
      instancias.set(elemento, {
        show() {
          if (!disparar(elemento, "show.bs.offcanvas")) return;
          elemento.classList.add("show");
          disparar(elemento, "shown.bs.offcanvas");
        },
        hide() {
          if (!elemento.classList.contains("show")) return;
          if (!disparar(elemento, "hide.bs.offcanvas")) return;
          elemento.classList.remove("show");
          disparar(elemento, "hidden.bs.offcanvas");
        },
      });
    return instancias.get(elemento);
  };
  window.bootstrap = {
    ...window.bootstrap,
    Offcanvas: { getOrCreateInstance: instancia },
  };
  const fecharPeloBotao = (evento) => {
    const botao = evento.target.closest?.('[data-bs-dismiss="offcanvas"]');
    if (!botao) return;
    const alvo =
      botao.closest(".offcanvas") ||
      document
        .getElementById(botao.getAttribute("form"))
        ?.closest(".offcanvas");
    if (alvo) instancia(alvo).hide();
  };
  document.addEventListener("click", fecharPeloBotao);
  return () => document.removeEventListener("click", fecharPeloBotao);
}
