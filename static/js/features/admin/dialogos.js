/** Ciclo único dos overlays administrativos, sem regras de negócio. */
import {
  elementoVisivel,
  sincronizarScrollDialogos,
} from "../../shared/dialogs.js";

const estados = new WeakMap();
let abertos = [];
let eventosConfigurados = false;
let inicioNoFundo = null;

function modalAtual() {
  abertos = abertos.filter(elementoVisivel);
  return abertos.at(-1);
}

function focaveis(modal) {
  return [
    ...modal.querySelectorAll(
      "button, input, select, textarea, a[href], [tabindex]",
    ),
  ].filter(
    (elemento) =>
      !elemento.matches(':disabled, [type="hidden"]') &&
      elemento.tabIndex >= 0 &&
      elementoVisivel(elemento),
  );
}

function focar(modal) {
  const campos = focaveis(modal);
  const inicial = campos.find((elemento) =>
    elemento.matches("[autofocus], input, select, textarea"),
  );
  (inicial || campos[0] || modal).focus();
}

export function abrirModalAdmin(id, opcoes = {}) {
  const modal = document.getElementById(id);
  if (!modal) return;
  configurarModaisAdmin();
  const anterior = estados.get(modal);
  clearTimeout(anterior?.temporizador);
  const retorno =
    anterior && !modal.classList.contains("d-none")
      ? anterior.retorno
      : document.activeElement;
  estados.set(modal, { retorno, podeFechar: opcoes.podeFechar });
  abertos = abertos.filter(
    (aberto) => aberto !== modal && elementoVisivel(aberto),
  );
  modal.classList.remove("d-none", "closing");
  modal.removeAttribute("aria-hidden");
  if (modal.classList.contains("modal-overlay")) {
    abertos.push(modal);
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.tabIndex = -1;
  }
  sincronizarScrollDialogos();
  focar(modal);
}

export function fecharModalAdmin(id, { concluido = false } = {}) {
  const modal = document.getElementById(id);
  if (!modal || !elementoVisivel(modal) || modal.classList.contains("closing"))
    return false;
  const estado = estados.get(modal) || {};
  if (!concluido && estado.podeFechar?.() === false) return false;
  estados.set(modal, estado);
  modal.classList.add("closing");
  modal.dispatchEvent(new Event("admin:fechar"));
  estado.temporizador = setTimeout(() => {
    const eraAtual =
      modalAtual() === modal ||
      (!modalAtual() && modal.contains(document.activeElement));
    modal.classList.add("d-none");
    modal.classList.remove("closing");
    modal.setAttribute("aria-hidden", "true");
    modal.removeAttribute("aria-modal");
    abertos = abertos.filter((aberto) => aberto !== modal);
    sincronizarScrollDialogos();
    if (!eraAtual || document.querySelector(".modal.show")) return;
    const atual = modalAtual();
    if (
      elementoVisivel(estado.retorno) &&
      (!atual || atual.contains(estado.retorno))
    )
      estado.retorno.focus();
    else if (atual) focar(atual);
  }, 250);
  return true;
}

export function configurarModaisAdmin() {
  if (eventosConfigurados) return;
  eventosConfigurados = true;
  document.addEventListener("keydown", (evento) => {
    // O Bootstrap é o único dono do teclado quando um diálogo real está aberto.
    if (
      document.querySelector(".modal.show") ||
      evento.target.closest?.(".modal")
    )
      return;
    const modal = modalAtual();
    if (!modal) return;
    if (evento.key === "Escape") {
      evento.preventDefault();
      fecharModalAdmin(modal.id);
    } else if (evento.key === "Tab") {
      const campos = focaveis(modal);
      const primeiro = campos[0] || modal;
      const ultimo = campos.at(-1) || modal;
      if (
        !campos.length ||
        !modal.contains(document.activeElement) ||
        (evento.shiftKey
          ? document.activeElement === primeiro
          : document.activeElement === ultimo)
      ) {
        evento.preventDefault();
        (evento.shiftKey ? ultimo : primeiro).focus();
      }
    }
  });
  document.addEventListener("focusin", (evento) => {
    if (document.querySelector(".modal.show")) return;
    const modal = modalAtual();
    if (
      modal &&
      !modal.classList.contains("closing") &&
      !modal.contains(evento.target)
    )
      focar(modal);
  });
  document.addEventListener("mousedown", (evento) => {
    inicioNoFundo = evento.target === modalAtual() ? evento.target : null;
  });
  document.addEventListener("click", (evento) => {
    const inicio = inicioNoFundo;
    inicioNoFundo = null;
    if (document.querySelector(".modal.show")) return;
    if (inicio && evento.target === inicio && inicio === modalAtual())
      fecharModalAdmin(inicio.id);
  });
}
