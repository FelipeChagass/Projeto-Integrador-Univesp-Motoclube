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
const { fecharModalAdmin } = await import("../static/js/features/admin/ui.js");
const { abrirFormNovoProduto } =
  await import("../static/js/features/admin/produtos.js");
const { abrirAjusteSaldo } =
  await import("../static/js/features/admin/membros.js");
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
    <div id="formNovoProduto" class="modal-overlay d-none"><div class="modal-content">
      <button id="btn-close-form-produto">Fechar</button>
      <input id="novo-nome"><button id="btn-cancel-novo-produto">Cancelar</button>
    </div></div>
    <div id="modalExtrato" class="modal-overlay d-none"></div>
    <div id="modalAjuste" class="modal-overlay d-none"><div class="modal-content">
      <h2 id="ajuste-membro-nome"></h2><button id="btn-close-modal-ajuste">Fechar</button>
      <input id="ajuste-valor"><input id="ajuste-descricao"><select id="ajuste-tipo"><option value="credito">Crédito</option></select>
      <button id="btn-confirmar-ajuste-saldo">Confirmar</button><button id="btn-cancel-modal-ajuste">Cancelar</button>
    </div></div>
    <div id="modalEdicaoFinanceira" class="modal-overlay d-none">
      <form id="form-edicao-financeira" class="modal-content">
        <h2 id="edicao-financeira-titulo"></h2><p id="edicao-financeira-subtitulo"></p>
        <div id="edicao-financeira-campos"></div>
        <button type="button" data-fechar-edicao>Cancelar</button>
        <button type="submit" id="btn-salvar-edicao-financeira">Salvar</button>
      </form>
    </div>`;
  setupEventListeners();
  document.getElementById("origem").focus();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
  document.body.innerHTML = "";
});

test.each(["Escape", "fundo", "botao"])(
  "%s fecha pelo mesmo ciclo, restaura foco e libera scroll",
  (modo) => {
    abrirFormNovoProduto();
    if (modo === "Escape") tecla("Escape");
    if (modo === "fundo")
      clicarFundo(document.getElementById("formNovoProduto"));
    if (modo === "botao")
      document.getElementById("btn-cancel-novo-produto").click();
    jest.advanceTimersByTime(300);
    expect(
      document.getElementById("formNovoProduto").classList.contains("d-none"),
    ).toBe(true);
    expect(document.body.classList.contains("modal-open")).toBe(false);
    expect(document.activeElement.id).toBe("origem");
  },
);

test("Tab e Shift+Tab permanecem no modal e ignoram controles ocultos", () => {
  abrirAjusteSaldo("membro", "Ana");
  expect(document.activeElement.id).toBe("ajuste-valor");
  const primeiro = document.getElementById("btn-close-modal-ajuste");
  const ultimo = document.getElementById("btn-cancel-modal-ajuste");
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
    document.getElementById("modalAjuste").contains(document.activeElement),
  ).toBe(true);
});

test("Escape fecha apenas o último modal e mantém scroll até fechar todos", () => {
  abrirFormNovoProduto();
  abrirAjusteSaldo("membro", "Ana");
  tecla("Escape");
  jest.advanceTimersByTime(300);
  expect(
    document.getElementById("modalAjuste").classList.contains("d-none"),
  ).toBe(true);
  expect(
    document.getElementById("formNovoProduto").classList.contains("d-none"),
  ).toBe(false);
  expect(document.body.classList.contains("modal-open")).toBe(true);
  expect(document.activeElement.id).toBe("novo-nome");
  tecla("Escape");
  jest.advanceTimersByTime(300);
  expect(document.body.classList.contains("modal-open")).toBe(false);
});

test("overlay escondido por display não mantém scroll bloqueado", () => {
  abrirFormNovoProduto();
  document.body.insertAdjacentHTML(
    "beforeend",
    '<div class="modal-overlay" style="display: none"></div>',
  );
  fecharModalAdmin("formNovoProduto");
  jest.advanceTimersByTime(300);
  expect(document.body.classList.contains("modal-open")).toBe(false);
});

test("arrasto iniciado dentro do conteúdo não fecha no backdrop", () => {
  abrirFormNovoProduto();
  document
    .getElementById("novo-nome")
    .dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  document.getElementById("formNovoProduto").click();
  jest.advanceTimersByTime(300);
  expect(
    document.getElementById("formNovoProduto").classList.contains("d-none"),
  ).toBe(false);
});

test("cadastro inline em card não vira diálogo nem prende teclado ou scroll", () => {
  const formulario = document.getElementById("formNovoProduto");
  formulario.classList.replace("modal-overlay", "card");
  abrirFormNovoProduto();
  expect(formulario.getAttribute("role")).not.toBe("dialog");
  expect(document.body.classList.contains("modal-open")).toBe(false);
  document.getElementById("origem").focus();
  expect(document.activeElement.id).toBe("origem");
  document.getElementById("btn-cancel-novo-produto").click();
  jest.advanceTimersByTime(300);
  expect(formulario.classList.contains("d-none")).toBe(true);
});

test("reabrir antes do timeout não deixa o fechamento antigo esconder o modal", () => {
  abrirFormNovoProduto();
  fecharModalAdmin("formNovoProduto");
  abrirFormNovoProduto();
  jest.advanceTimersByTime(300);
  expect(
    document.getElementById("formNovoProduto").classList.contains("d-none"),
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
