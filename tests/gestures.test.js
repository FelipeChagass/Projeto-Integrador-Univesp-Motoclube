/**
 * Arrasto do menu lateral: o Offcanvas do Bootstrap (admin) acompanha o dedo e fecha
 * pela API do Bootstrap quando o arrasto passa do limite; abaixo dele volta ao lugar.
 */
import {
  jest,
  test,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
} from "@jest/globals";
import { initBottomSheetGestures } from "../static/js/shared/gestures.js";
import {
  abrirModalAdmin,
  fecharModalAdmin,
} from "../static/js/features/admin/dialogos.js";

const esconder = jest.fn();

function toque(tipo, alvo, x) {
  const evento = new Event(tipo, { bubbles: true, cancelable: true });
  Object.defineProperty(evento, "touches", {
    value: tipo === "touchend" ? [] : [{ clientX: x, clientY: 100 }],
  });
  alvo.dispatchEvent(evento);
}

beforeAll(() => {
  window.bootstrap = {
    Offcanvas: { getOrCreateInstance: jest.fn(() => ({ hide: esconder })) },
  };
  initBottomSheetGestures();
});

beforeEach(() => {
  esconder.mockClear();
  document.body.innerHTML = `
    <div class="offcanvas offcanvas-end show" id="menu">
      <button type="button" id="item">Produtos</button>
    </div>`;
});

test("o menu acompanha o dedo e fecha pelo Bootstrap depois de 80px", () => {
  const menu = document.getElementById("menu");
  const item = document.getElementById("item");
  toque("touchstart", item, 100);
  toque("touchmove", item, 150);
  expect(menu.style.transform).toBe("translateX(50px)");
  toque("touchmove", item, 220);
  toque("touchend", item, 220);
  expect(esconder).toHaveBeenCalledTimes(1);
  expect(menu.style.transform).toBe("");
  expect(menu.style.transition).toBe("");
});

test("arrasto curto volta o menu ao lugar sem fechar", () => {
  const menu = document.getElementById("menu");
  toque("touchstart", menu, 100);
  toque("touchmove", menu, 150);
  toque("touchend", menu, 150);
  expect(esconder).not.toHaveBeenCalled();
  expect(menu.style.transform).toBe("");
});

test("toque sem arrasto não mexe no menu", () => {
  const menu = document.getElementById("menu");
  toque("touchstart", menu, 100);
  toque("touchend", menu, 100);
  expect(esconder).not.toHaveBeenCalled();
  expect(menu.style.transform).toBe("");
});

function arrastar(alvo, tipo, y) {
  const evento = new Event(tipo, { bubbles: true, cancelable: true });
  Object.defineProperty(evento, "touches", {
    value: tipo === "touchend" ? [] : [{ clientX: 100, clientY: y }],
  });
  alvo.dispatchEvent(evento);
}

function criarModal() {
  jest.useFakeTimers();
  document.body.innerHTML =
    '<button id="origem">Abrir</button><div id="legado" class="modal-overlay d-none"><div class="modal-content"><header class="modal-drag-header"><button id="fechar">X</button></header></div></div>';
  document.getElementById("origem").focus();
  return document.getElementById("legado");
}

function gesto(modal) {
  const cabecalho = modal.querySelector("header");
  arrastar(cabecalho, "touchstart", 100);
  arrastar(cabecalho, "touchmove", 300);
  arrastar(cabecalho, "touchend", 300);
}

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

test("gesto emite pedido cancelável e não oculta quando consumidor recusa", () => {
  const modal = criarModal();
  modal.classList.remove("d-none");
  const pedidos = [];
  modal.addEventListener("pedido-fechar-modal", (evento) => {
    pedidos.push(evento);
    evento.preventDefault();
  });
  gesto(modal);
  jest.advanceTimersByTime(1000);
  expect(pedidos).toHaveLength(1);
  expect(pedidos[0].bubbles).toBe(true);
  expect(pedidos[0].cancelable).toBe(true);
  expect(modal.style.display).not.toBe("none");
  expect(modal.querySelector(".modal-content").style.transform).toBe("");
});

test.each([false, true])(
  "gesto usa fechamento admin e respeita podeFechar=%s",
  (podeFechar) => {
    const modal = criarModal();
    document
      .getElementById("fechar")
      .addEventListener("click", () => fecharModalAdmin(modal.id));
    abrirModalAdmin(modal.id, { podeFechar: () => podeFechar });
    gesto(modal);
    jest.advanceTimersByTime(1000);
    expect(modal.classList.contains("d-none")).toBe(podeFechar);
    expect(modal.style.display).not.toBe("none");
    expect(document.activeElement.id).toBe(podeFechar ? "origem" : "fechar");
  },
);

test.each(["busy", "shared", "bootstrap", "migrado"])(
  "gesto não transforma nem fecha modal protegido: %s",
  (bloqueio) => {
    const modal = criarModal();
    modal.classList.remove("d-none");
    if (bloqueio === "busy") modal.setAttribute("aria-busy", "true");
    else if (bloqueio === "migrado") modal.className = "modal show";
    else
      document.body.insertAdjacentHTML(
        "beforeend",
        `<div class="${bloqueio === "shared" ? "ui-dialogo" : "modal show"}"></div>`,
      );
    const cabecalho = modal.querySelector("header");
    arrastar(cabecalho, "touchstart", 100);
    arrastar(cabecalho, "touchmove", 300);
    expect(modal.querySelector(".modal-content").style.transform).toBe("");
    arrastar(cabecalho, "touchend", 300);
    jest.advanceTimersByTime(1000);
    expect(modal.style.display).not.toBe("none");
  },
);
