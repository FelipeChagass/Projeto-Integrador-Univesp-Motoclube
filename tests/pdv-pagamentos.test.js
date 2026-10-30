/**
 * Pagamentos do PDV (actions/pagamentos.js): troco, recebimento de dívida e a regra central
 * da venda: nada sai do carrinho antes de a operação estar gravada no aparelho.
 */
import { beforeEach, expect, jest, test } from "@jest/globals";
import { reais } from "./helpers/moeda.js";

const ui = {
  showToast: jest.fn(),
  fecharModal: jest.fn(),
  abrirModal: jest.fn(),
  atualizarUI: jest.fn(),
  renderizarCatalogo: jest.fn(),
  mostrarCarregamento: jest.fn(),
};
const fila = {
  novoIdExterno: jest.fn(() => "id-externo-1"),
  persistirOperacao: jest.fn(),
  listarOperacoes: jest.fn(),
};
const processarFilaVendas = jest.fn();
jest.unstable_mockModule("../static/js/features/pdv/ui.js", () => ui);
jest.unstable_mockModule("../static/js/features/pdv/reports.js", () => ({
  montarImpressao: jest.fn(),
}));
jest.unstable_mockModule(
  "../static/js/features/pdv/offline-queue.js",
  () => fila,
);
jest.unstable_mockModule(
  "../static/js/features/pdv/actions/sincronizacao.js",
  () => ({ processarFilaVendas }),
);

const { estadoPdv } = await import("../static/js/features/pdv/state.js");
const pagamentos =
  await import("../static/js/features/pdv/actions/pagamentos.js");

beforeEach(() => {
  jest.clearAllMocks();
  fila.listarOperacoes.mockResolvedValue([]);
  fila.persistirOperacao.mockResolvedValue(undefined);
  document.body.innerHTML = `
    <div id="valor-total-dinheiro"></div><input id="valor-recebido">
    <div id="display-troco"></div><button id="btn-confirmar-dinheiro"></button>
    <input id="input-cliente">`;
  Object.assign(estadoPdv, {
    operadorAtual: "Felipe",
    usuarioAtual: { id: "u1" },
    caixaAberto: true,
    caixaId: "cx-1",
    enviandoVenda: false,
    config: { imprimir: false },
    carrinho: [{ id: 1, nome: "Cerveja", preco: 10, qtd: 2 }],
    produtos: [{ id: 1, categoria: "bebida", estoque_bar: 5 }],
    pagamentoPendente: null,
    dadosFechamentoAtual: null,
  });
});

test("troco: mostra o valor em reais e só libera a confirmação quando cobre o total", () => {
  pagamentos.prepararPagamentoGlobal("VENDA", 20, "DINHEIRO", "BALCÃO");
  expect(ui.abrirModal).toHaveBeenCalledWith("modal-dinheiro");
  const confirmar = document.getElementById("btn-confirmar-dinheiro");
  const troco = document.getElementById("display-troco");
  expect(confirmar.disabled).toBe(true);

  document.getElementById("valor-recebido").value = "15,50";
  pagamentos.calcularTroco();
  expect(troco.innerText).toBe(`Faltam: ${reais("4,50")}`);
  expect(troco.classList.contains("text-danger")).toBe(true);
  expect(confirmar.disabled).toBe(true);

  document.getElementById("valor-recebido").value = "25";
  pagamentos.calcularTroco();
  expect(troco.innerText).toBe(`Troco: ${reais("5,00")}`);
  expect(troco.classList.contains("text-success")).toBe(true);
  expect(confirmar.disabled).toBe(false);
});

test("venda é gravada no aparelho antes de limpar o carrinho e baixar o estoque", async () => {
  const ordem = [];
  fila.persistirOperacao.mockImplementation(async () => ordem.push("gravou"));
  ui.atualizarUI.mockImplementation(() =>
    ordem.push(`carrinho:${estadoPdv.carrinho.length}`),
  );
  await pagamentos.registrarVendaOtimista("PIX", "BALCÃO");
  expect(fila.persistirOperacao).toHaveBeenCalledWith(
    expect.objectContaining({
      id_externo: "id-externo-1",
      usuario_origem_id: "u1",
      caixa_id: "cx-1",
      total: 20,
      metodo: "PIX",
    }),
  );
  expect(ordem).toEqual(["gravou", "carrinho:0"]);
  expect(estadoPdv.produtos[0].estoque_bar).toBe(3);
  expect(processarFilaVendas).toHaveBeenCalledWith({ notificarFalhas: true });
});

test("falha ao gravar no aparelho mantém o carrinho e o estoque", async () => {
  fila.persistirOperacao.mockRejectedValue(new Error("Armazenamento cheio."));
  await pagamentos.registrarVendaOtimista("PIX", "BALCÃO");
  expect(estadoPdv.carrinho).toHaveLength(1);
  expect(estadoPdv.produtos[0].estoque_bar).toBe(5);
  expect(ui.showToast).toHaveBeenCalledWith(
    "Erro ao registrar venda: Armazenamento cheio.",
  );
  expect(estadoPdv.enviandoVenda).toBe(false);
});

test("sem caixa aberto a venda nem chega à fila", async () => {
  estadoPdv.caixaAberto = false;
  await pagamentos.registrarVendaOtimista("PIX", "BALCÃO");
  expect(fila.persistirOperacao).not.toHaveBeenCalled();
});

test("recebimento de dívida grava a operação com o saldo esperado do membro", async () => {
  estadoPdv.dadosFechamentoAtual = { membro_id: "m1", nome: "Ana", total: 80 };
  estadoPdv.pagamentoPendente = { tipo: "DIVIDA", valorTotal: 80 };
  await pagamentos.executarPagamentoFinal("PIX");
  expect(fila.persistirOperacao).toHaveBeenCalledWith({
    id_externo: "id-externo-1",
    tipo_operacao: "pagamento",
    usuario_origem_id: "u1",
    caixa_id: "cx-1",
    membro_id: "m1",
    metodo: "PIX",
    saldo_esperado: 80,
    valor: 80,
  });
  expect(estadoPdv.enviandoVenda).toBe(false);
});

test("segundo recebimento do mesmo membro com um já pendente é recusado", async () => {
  fila.listarOperacoes.mockResolvedValue([
    { payload: { tipo_operacao: "pagamento", membro_id: "m1" } },
  ]);
  estadoPdv.dadosFechamentoAtual = { membro_id: "m1", nome: "Ana", total: 80 };
  estadoPdv.pagamentoPendente = { tipo: "DIVIDA", valorTotal: 80 };
  await pagamentos.executarPagamentoFinal("PIX");
  expect(fila.persistirOperacao).not.toHaveBeenCalled();
  expect(ui.showToast).toHaveBeenCalledWith(
    expect.stringContaining("Já existe um recebimento pendente deste membro"),
  );
});

test("liquidação sem nada a pagar não abre pagamento", () => {
  estadoPdv.dadosFechamentoAtual = { membro_id: "m1", nome: "Ana", total: 0 };
  pagamentos.iniciarLiquidacao("PIX");
  expect(ui.showToast).toHaveBeenCalledWith("Nada a pagar.");
  expect(estadoPdv.pagamentoPendente).toBeNull();
});
