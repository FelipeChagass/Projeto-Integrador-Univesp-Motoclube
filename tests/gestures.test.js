/**
 * Arrasto do menu lateral: o Offcanvas do Bootstrap (admin) acompanha o dedo e fecha
 * pela API do Bootstrap quando o arrasto passa do limite; abaixo dele volta ao lugar.
 */
import { jest, test, expect, beforeAll, beforeEach } from "@jest/globals";
import { initBottomSheetGestures } from "../static/js/shared/gestures.js";

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
