/**
 * Modo estoque do PDV (actions/estoque.js): quem entra sem senha, a senha só em memória e
 * o ajuste que puxa do depósito quando o bar aumenta, sempre com os valores esperados.
 */
import { beforeEach, expect, jest, test } from "@jest/globals";

const API = {
  verificarSenhaEstoque: jest.fn(),
  salvarDadosProduto: jest.fn(),
};
const prompt = jest.fn();
const ui = {
  showToast: jest.fn(),
  fecharModal: jest.fn(),
  renderizarCatalogo: jest.fn(),
  sincronizarTextoModoEstoque: jest.fn(),
};
jest.unstable_mockModule("../static/js/shared/api.js", () => ({ API }));
jest.unstable_mockModule("../static/js/shared/modals.js", () => ({
  UIModal: { prompt },
}));
jest.unstable_mockModule("../static/js/features/pdv/ui.js", () => ui);

const { estadoPdv } = await import("../static/js/features/pdv/state.js");
const { alternarModoEstoque, salvarEdicaoEstoque } =
  await import("../static/js/features/pdv/actions/estoque.js");

const aguardar = () => new Promise((resolve) => setTimeout(resolve, 0));
const campo = (id, valor) => (document.getElementById(id).value = valor);

beforeEach(() => {
  jest.clearAllMocks();
  document.body.className = "";
  document.body.innerHTML = `
    <header id="app-header"></header><button id="btn-estoque"></button>
    <section id="carrinho-section"></section>
    <input id="edit-est-bar"><input id="edit-est-dep">
    <input id="edit-min-bar"><input id="edit-min-dep">`;
  Object.assign(estadoPdv, {
    modoGerenciaEstoque: false,
    senhaEstoque: null,
    usuarioAtual: { id: "u1", perfil: "operador" },
    estoqueOriginalBar: 5,
    produtoEdicao: { id: 7, estoque_bar: 5, estoque_deposito: 10 },
  });
});

test("admin entra no modo estoque sem senha e sair limpa a senha da memória", () => {
  estadoPdv.usuarioAtual.perfil = "admin";
  alternarModoEstoque();
  expect(prompt).not.toHaveBeenCalled();
  expect(estadoPdv.modoGerenciaEstoque).toBe(true);
  expect(document.body.classList.contains("border-primary")).toBe(true);
  expect(
    document
      .getElementById("carrinho-section")
      .classList.contains("minimizado"),
  ).toBe(true);

  estadoPdv.senhaEstoque = "qualquer";
  alternarModoEstoque();
  expect(estadoPdv.modoGerenciaEstoque).toBe(false);
  expect(estadoPdv.senhaEstoque).toBeNull();
  expect(document.body.classList.contains("border-primary")).toBe(false);
});

test("operador só entra com a senha validada no servidor", async () => {
  prompt.mockImplementation((_mensagem, aoConfirmar) => aoConfirmar("1234"));
  API.verificarSenhaEstoque.mockResolvedValue({ status: "ok" });
  alternarModoEstoque();
  await aguardar();
  expect(API.verificarSenhaEstoque).toHaveBeenCalledWith("1234");
  expect(estadoPdv.modoGerenciaEstoque).toBe(true);
  expect(estadoPdv.senhaEstoque).toBe("1234");
});

test("senha recusada mantém o modo venda e não guarda a senha", async () => {
  prompt.mockImplementation((_mensagem, aoConfirmar) => aoConfirmar("errada"));
  API.verificarSenhaEstoque.mockRejectedValue(new Error("Senha inválida."));
  alternarModoEstoque();
  await aguardar();
  expect(estadoPdv.modoGerenciaEstoque).toBe(false);
  expect(estadoPdv.senhaEstoque).toBeNull();
  expect(ui.showToast).toHaveBeenCalledWith("Senha inválida.", "err");
});

test("aumentar o bar puxa do depósito e envia os valores esperados com a senha", async () => {
  estadoPdv.senhaEstoque = "1234";
  campo("edit-est-bar", "8");
  campo("edit-est-dep", "10");
  campo("edit-min-bar", "2");
  campo("edit-min-dep", "3");
  await salvarEdicaoEstoque();
  expect(API.salvarDadosProduto).toHaveBeenCalledWith(
    7,
    8,
    7,
    2,
    3,
    5,
    10,
    "1234",
  );
  expect(estadoPdv.produtoEdicao).toMatchObject({
    estoque_bar: 8,
    estoque_deposito: 7,
  });
  expect(ui.fecharModal).toHaveBeenCalledWith("modal-estoque");
});

test.each([
  ["valor negativo", "-1", "10", "Erro: Não é permitido valores negativos."],
  [
    "depósito insuficiente",
    "20",
    "10",
    "OPERAÇÃO NEGADA: Depósito insuficiente.",
  ],
])(
  "%s é recusado sem chamar o servidor",
  async (_caso, bar, deposito, aviso) => {
    campo("edit-est-bar", bar);
    campo("edit-est-dep", deposito);
    await salvarEdicaoEstoque();
    expect(API.salvarDadosProduto).not.toHaveBeenCalled();
    expect(ui.showToast).toHaveBeenCalledWith(aviso);
  },
);

test("falha no servidor não altera o estoque mostrado nem fecha o modal", async () => {
  API.salvarDadosProduto.mockRejectedValue(new Error("Estoque mudou."));
  campo("edit-est-bar", "6");
  campo("edit-est-dep", "10");
  await salvarEdicaoEstoque();
  expect(estadoPdv.produtoEdicao.estoque_bar).toBe(5);
  expect(ui.fecharModal).not.toHaveBeenCalled();
  expect(ui.showToast).toHaveBeenCalledWith(
    "Estoque não atualizado: Estoque mudou.",
  );
});
