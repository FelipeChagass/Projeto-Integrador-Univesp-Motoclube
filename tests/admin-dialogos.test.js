import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";

const requisitar = jest.fn();
jest.unstable_mockModule("../static/js/shared/api.js", () => ({
  API: { request: requisitar },
}));
jest.unstable_mockModule("../static/js/shared/modals.js", () => ({
  UIModal: { confirm: jest.fn() },
}));

const { setupEventListeners } =
  await import("../static/js/features/admin/events.js");
const { abrirModalAdmin, fecharModalAdmin } =
  await import("../static/js/features/admin/ui.js");
const { administrarMovimento, administrarVenda } =
  await import("../static/js/features/admin/financeiro.js");

const tecla = (key, shiftKey = false) =>
  document.activeElement.dispatchEvent(
    new KeyboardEvent("keydown", {
      key,
      shiftKey,
      bubbles: true,
      cancelable: true,
    }),
  );
const clicarFundo = (modal) => {
  modal.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  modal.click();
};

beforeEach(() => {
  jest.useFakeTimers();
  requisitar.mockReset();
  document.body.className = "";
  document.body.innerHTML = `
    <button id="origem">Abrir</button><div id="toast"></div>
    <div id="modalTeste" class="modal-overlay d-none"><div class="modal-content">
      <button id="teste-fechar">Fechar</button>
      <input id="teste-campo"><button id="teste-cancelar">Cancelar</button>
    </div></div>
    <div id="modalExtrato" class="modal-overlay d-none"></div>
    <div id="modalTeste2" class="modal-overlay d-none"><div class="modal-content">
      <h2>Segundo</h2><button id="teste2-fechar">Fechar</button>
      <input id="teste2-valor"><input id="teste2-descricao">
      <button id="teste2-confirmar">Confirmar</button><button id="teste2-cancelar">Cancelar</button>
    </div></div>
    <div id="modalEdicaoFinanceira" class="modal-overlay d-none">
      <form id="form-edicao-financeira" class="modal-content">
        <h2 id="edicao-financeira-titulo"><span data-titulo-texto></span><span id="edicao-financeira-subtitulo"></span></h2>
        <div id="edicao-financeira-campos"></div>
        <button type="button" data-fechar-edicao>Cancelar</button>
        <button type="submit" id="btn-salvar-edicao-financeira">Salvar</button>
      </form>
    </div>`;
  setupEventListeners();
  // Overlays genéricos: o contrato de dialogos.js (Escape, fundo, Tab, foco, scroll)
  // continua valendo para o extrato e a edição de venda, que seguem como modais.
  for (const [botao, modal] of [
    ["teste-fechar", "modalTeste"],
    ["teste-cancelar", "modalTeste"],
    ["teste2-fechar", "modalTeste2"],
    ["teste2-cancelar", "modalTeste2"],
  ])
    document
      .getElementById(botao)
      .addEventListener("click", () => fecharModalAdmin(modal));
  document.getElementById("origem").focus();
});

const abrirPrimeiro = () => abrirModalAdmin("modalTeste");
const abrirSegundo = () => abrirModalAdmin("modalTeste2");

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
  document.body.innerHTML = "";
});

test.each(["Escape", "fundo", "botao"])(
  "%s fecha pelo mesmo ciclo, restaura foco e libera scroll",
  (modo) => {
    abrirPrimeiro();
    if (modo === "Escape") tecla("Escape");
    if (modo === "fundo") clicarFundo(document.getElementById("modalTeste"));
    if (modo === "botao") document.getElementById("teste-cancelar").click();
    jest.advanceTimersByTime(300);
    expect(
      document.getElementById("modalTeste").classList.contains("d-none"),
    ).toBe(true);
    expect(document.body.classList.contains("modal-open")).toBe(false);
    expect(document.activeElement.id).toBe("origem");
  },
);

test("Tab e Shift+Tab permanecem no modal e ignoram controles ocultos", () => {
  abrirSegundo();
  expect(document.activeElement.id).toBe("teste2-valor");
  const primeiro = document.getElementById("teste2-fechar");
  const ultimo = document.getElementById("teste2-cancelar");
  ultimo.insertAdjacentHTML(
    "afterend",
    '<div class="d-none"><button>Oculto</button></div>',
  );
  ultimo.focus();
  tecla("Tab");
  expect(document.activeElement).toBe(primeiro);
  tecla("Tab", true);
  expect(document.activeElement).toBe(ultimo);
  document.getElementById("origem").focus();
  expect(
    document.getElementById("modalTeste2").contains(document.activeElement),
  ).toBe(true);
});

test("Escape fecha apenas o último modal e mantém scroll até fechar todos", () => {
  abrirPrimeiro();
  abrirSegundo();
  tecla("Escape");
  jest.advanceTimersByTime(300);
  expect(
    document.getElementById("modalTeste2").classList.contains("d-none"),
  ).toBe(true);
  expect(
    document.getElementById("modalTeste").classList.contains("d-none"),
  ).toBe(false);
  expect(document.body.classList.contains("modal-open")).toBe(true);
  expect(document.activeElement.id).toBe("teste-campo");
  tecla("Escape");
  jest.advanceTimersByTime(300);
  expect(document.body.classList.contains("modal-open")).toBe(false);
});

test("overlay escondido por display não mantém scroll bloqueado", () => {
  abrirPrimeiro();
  document.body.insertAdjacentHTML(
    "beforeend",
    '<div class="modal-overlay" style="display: none"></div>',
  );
  fecharModalAdmin("modalTeste");
  jest.advanceTimersByTime(300);
  expect(document.body.classList.contains("modal-open")).toBe(false);
});

test("arrasto iniciado dentro do conteúdo não fecha no backdrop", () => {
  abrirPrimeiro();
  document
    .getElementById("teste-campo")
    .dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  document.getElementById("modalTeste").click();
  jest.advanceTimersByTime(300);
  expect(
    document.getElementById("modalTeste").classList.contains("d-none"),
  ).toBe(false);
});

test("reabrir antes do timeout não deixa o fechamento antigo esconder o modal", () => {
  abrirPrimeiro();
  fecharModalAdmin("modalTeste");
  abrirPrimeiro();
  jest.advanceTimersByTime(300);
  expect(
    document.getElementById("modalTeste").classList.contains("d-none"),
  ).toBe(false);
  expect(document.body.classList.contains("modal-open")).toBe(true);
});

test.each(["Escape", "fundo", "botao"])(
  "salvamento pendente bloqueia %s, mas falha libera fechamento",
  async (modo) => {
    let concluir;
    requisitar.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        concluir = reject;
      }),
    );
    administrarMovimento(
      "membro",
      { id: 1, versao: 2, tipo: "credito", valor: 10, descricao: "Teste" },
      "editar",
    );
    document
      .getElementById("form-edicao-financeira")
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    const modal = document.getElementById("modalEdicaoFinanceira");
    if (modo === "Escape") tecla("Escape");
    if (modo === "fundo") clicarFundo(modal);
    if (modo === "botao")
      document.querySelector("[data-fechar-edicao]").click();
    jest.advanceTimersByTime(300);
    expect(modal.classList.contains("d-none")).toBe(false);
    expect(
      document.getElementById("btn-salvar-edicao-financeira").disabled,
    ).toBe(true);
    concluir(new Error("Falha de rede"));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    tecla("Escape");
    jest.advanceTimersByTime(300);
    expect(modal.classList.contains("d-none")).toBe(true);
  },
);

test("Escape durante busca invalida resposta tardia sem bloquear cancelamento", async () => {
  let concluir;
  requisitar.mockReturnValueOnce(
    new Promise((resolve) => {
      concluir = resolve;
    }),
  );
  const consulta = administrarVenda(42, "editar");
  tecla("Escape");
  jest.advanceTimersByTime(300);
  concluir({ venda: { id: 42, valor_total: 10, itens: [] } });
  await consulta;
  expect(
    document
      .getElementById("modalEdicaoFinanceira")
      .classList.contains("d-none"),
  ).toBe(true);
  expect(document.getElementById("btn-salvar-edicao-financeira").disabled).toBe(
    false,
  );
  expect(document.activeElement.id).toBe("origem");
});
