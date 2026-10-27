import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { readFileSync } from "node:fs";
import { loadModules, ui } from "./helpers/pdv.js";

const elemento = (id) => document.getElementById(id);

// Bootstrap é carregado por CDN. Adaptador de sua fronteira pública, com
// hidden assíncrono para detectar restauração prematura de foco.
class ModalBootstrap {
  static instancias = new WeakMap();
  static getOrCreateInstance(modal) {
    if (!this.instancias.has(modal))
      this.instancias.set(modal, new this(modal));
    return this.instancias.get(modal);
  }
  constructor(modal) {
    this.modal = modal;
  }
  show() {
    this.modal.classList.add("show");
    document.body.classList.add("modal-open");
    this.modal.focus();
    this.modal.dispatchEvent(new Event("shown.bs.modal"));
  }
  hide() {
    if (!this.modal.classList.contains("show")) return;
    if (
      !this.modal.dispatchEvent(
        new Event("hide.bs.modal", { cancelable: true }),
      )
    )
      return;
    this.modal.classList.remove("show");
    setTimeout(() => {
      document.body.classList.remove("modal-open");
      this.modal.dispatchEvent(new Event("hidden.bs.modal"));
    }, 40);
  }
}

beforeEach(async () => {
  await loadModules();
  jest.useFakeTimers();
  document.body.className = "page-pdv";
  document.body.insertAdjacentHTML(
    "afterbegin",
    '<button id="origem">Abrir</button>',
  );
  elemento("origem").focus();
  elemento("modal-obs").innerHTML =
    '<div class="modal-content"><header class="modal-drag-header"><button data-acionar="btn-cancelar-obs">X</button></header><input id="campo"><button id="btn-cancelar-obs">Cancelar</button></div>';
  elemento("modal-selecionar-membro").className = "modal-overlay";
  elemento("modal-selecionar-membro").innerHTML =
    '<div class="modal-content"><header class="modal-drag-header"><button data-acionar="btn-cancelar-membro">X</button></header><button id="btn-cancelar-membro">Cancelar</button></div>';
  window.bootstrap = { Modal: ModalBootstrap };
  const { configurarEventosPdv } =
    await import("../static/js/features/pdv/events.js");
  configurarEventosPdv();
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  delete window.bootstrap;
});

function escape(alvo = document) {
  alvo.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    }),
  );
}

function fundo(modal) {
  modal.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  modal.click();
}

test("Configurações tem estrutura Bootstrap, rótulos e não é bottom sheet", () => {
  const template = readFileSync(
    "templates/pdv/modals/configuracoes.html",
    "utf8",
  );
  const fragmento = document.createElement("div");
  fragmento.innerHTML = template.replace(
    /\{%[\s\S]*?%\}|\{#[\s\S]*?#\}|\{\{[\s\S]*?\}\}/g,
    "",
  );
  const modal = fragmento.querySelector("#modal-config.modal");
  expect(modal).not.toBeNull();
  expect(modal.matches(".modal-overlay")).toBe(false);
  expect(
    modal.querySelector(":scope > .modal-dialog > .modal-content"),
  ).not.toBeNull();
  expect(modal.getAttribute("aria-labelledby")).toBe("modal-config-titulo");
  expect(modal.tabIndex).toBe(-1);
  expect(modal.querySelector('label[for="cfg-imprimir"]')).not.toBeNull();
});

test("Configurações delega ao Bootstrap e restaura foco somente após hidden", () => {
  const modal = elemento("modal-config");
  modal.className = "modal";
  modal.tabIndex = -1;
  ui.abrirModal(modal.id);
  expect(modal.classList.contains("show")).toBe(true);
  expect(modal.style.display).not.toBe("flex");
  ui.abrirModal(modal.id);
  ui.fecharModal(modal.id);
  expect(document.activeElement).not.toBe(elemento("origem"));
  jest.advanceTimersByTime(40);
  expect(document.activeElement).toBe(elemento("origem"));
  expect(document.body.classList.contains("modal-open")).toBe(false);
});

test.each([false, true])(
  "reabrir invalida fechamento pendente (celular=%s)",
  (celular) => {
    window.matchMedia = () => ({ matches: celular });
    const modal = elemento("modal-obs");
    ui.abrirModal(modal.id);
    ui.fecharModal(modal.id);
    jest.advanceTimersByTime(100);
    ui.abrirModal(modal.id);
    modal
      .querySelector(".modal-content")
      .dispatchEvent(new Event("transitionend"));
    jest.advanceTimersByTime(500);
    expect(modal.style.display).toBe("flex");
    expect(modal.classList.contains("closing")).toBe(false);
    expect(document.body.classList.contains("modal-open")).toBe(true);
    expect(modal.contains(document.activeElement)).toBe(true);
  },
);

test("transitionend de filho não fecha; conclusão real cancela timeout e devolve foco uma vez", () => {
  window.matchMedia = () => ({ matches: true });
  const modal = elemento("modal-obs");
  const origem = elemento("origem");
  ui.abrirModal(modal.id);
  ui.fecharModal(modal.id);
  elemento("campo").dispatchEvent(
    new Event("transitionend", { bubbles: true }),
  );
  expect(modal.style.display).toBe("flex");
  modal
    .querySelector(".modal-content")
    .dispatchEvent(new Event("transitionend"));
  expect(modal.style.display).toBe("none");
  expect(document.activeElement).toBe(origem);
  ui.abrirModal(modal.id);
  jest.advanceTimersByTime(500);
  expect(modal.style.display).toBe("flex");
});

test.each([
  escape,
  fundo,
  (modal) =>
    modal.dispatchEvent(
      new CustomEvent("pedido-fechar-modal", {
        bubbles: true,
        cancelable: true,
      }),
    ),
])(
  "fechamento global repete Cancelar e limpa seleção de membro (%#)",
  (fechar) => {
    const modal = elemento("modal-selecionar-membro");
    ui.abrirModal(modal.id);
    elemento("preview-divida").innerText = "Dívida anterior";
    fechar(modal);
    jest.advanceTimersByTime(400);
    expect(elemento("preview-divida").innerText).toBe("");
    expect(modal.style.display).toBe("none");
  },
);

test.each(["busy", "shared", "bootstrap"])(
  "Escape/backdrop/gesto ignoram fechamento bloqueado: %s",
  (bloqueio) => {
    const modal = elemento("modal-selecionar-membro");
    ui.abrirModal(modal.id);
    elemento("preview-divida").innerText = "Preservar";
    if (bloqueio === "busy") modal.setAttribute("aria-busy", "true");
    else
      document.body.insertAdjacentHTML(
        "beforeend",
        `<div class="${bloqueio === "shared" ? "ui-dialogo" : "modal show"}"></div>`,
      );
    escape(modal);
    fundo(modal);
    modal.dispatchEvent(
      new CustomEvent("pedido-fechar-modal", {
        bubbles: true,
        cancelable: true,
      }),
    );
    jest.advanceTimersByTime(500);
    expect(modal.style.display).toBe("flex");
    expect(elemento("preview-divida").innerText).toBe("Preservar");
  },
);

test("Escape fecha apenas o último aberto mesmo fora da ordem do DOM; scroll e foco ficam nele", () => {
  ui.abrirModal("modal-selecionar-membro");
  ui.abrirModal("modal-obs");
  escape();
  jest.advanceTimersByTime(400);
  expect(elemento("modal-obs").style.display).toBe("none");
  expect(elemento("modal-selecionar-membro").style.display).toBe("flex");
  expect(
    elemento("modal-selecionar-membro").contains(document.activeElement),
  ).toBe(true);
  expect(document.body.classList.contains("modal-open")).toBe(true);
});

test("fechamento legado não rouba foco nem libera scroll de diálogo Bootstrap", () => {
  ui.abrirModal("modal-obs");
  ui.fecharModal("modal-obs");
  document.body.insertAdjacentHTML(
    "beforeend",
    '<div class="modal show"><button id="acima">Confirmar</button></div>',
  );
  elemento("acima").focus();
  jest.advanceTimersByTime(500);
  expect(document.activeElement.id).toBe("acima");
  expect(document.body.classList.contains("modal-open")).toBe(true);
});
