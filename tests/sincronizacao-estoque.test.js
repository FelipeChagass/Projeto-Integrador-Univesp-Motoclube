/**
 * Atualização silenciosa do estoque no PDV: só espera pelas vendas que este aparelho ainda
 * vai enviar. Operação travada (conflito, reconciliação) ou de outro operador não pode
 * deixar o estoque do aparelho parado.
 */
import { beforeEach, expect, jest, test } from "@jest/globals";

const getProdutos = jest.fn();
jest.unstable_mockModule("../static/js/shared/api.js", () => ({
  API: { getProdutos },
}));
jest.unstable_mockModule("../static/js/features/pdv/ui.js", () => ({
  showToast: jest.fn(),
  fecharModal: jest.fn(),
  abrirModal: jest.fn(),
  renderizarCatalogo: jest.fn(),
}));
jest.unstable_mockModule("../static/js/features/pdv/offline-queue.js", () => ({
  listarOperacoes: jest.fn(),
  registrarTentativa: jest.fn(),
  confirmarOperacao: jest.fn(),
  registrarFalha: jest.fn(),
  reenviarOperacao: jest.fn(),
}));

const { estadoPdv } = await import("../static/js/features/pdv/state.js");
const { sincronizarProdutosEmSegundoPlano, operacaoParaEnviar } =
  await import("../static/js/features/pdv/actions/sincronizacao.js");

const operacao = (estado, usuario = "operador-atual") => ({
  estado,
  payload: { usuario_origem_id: usuario },
});
const aguardar = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  getProdutos.mockReset();
  getProdutos.mockResolvedValue({
    produtos: [{ id: 1, estoque_bar: 3, estoque_deposito: 9 }],
  });
  estadoPdv.usuarioAtual = { id: "operador-atual" };
  estadoPdv.produtos = [{ id: 1, estoque_bar: 10, estoque_deposito: 10 }];
});

test.each([
  ["conflito", operacao("conflito")],
  ["reconciliação", operacao("reconciliacao")],
  ["pendente de outro operador", operacao("pendente", "outro-operador")],
])(
  "operação em %s não impede a atualização do estoque",
  async (_caso, registro) => {
    estadoPdv.filaVendas = [registro];
    sincronizarProdutosEmSegundoPlano();
    await aguardar();
    expect(getProdutos).toHaveBeenCalledTimes(1);
    expect(estadoPdv.produtos[0]).toMatchObject({
      estoque_bar: 3,
      estoque_deposito: 9,
    });
  },
);

test.each(["pendente", "aguardando_reenvio"])(
  "venda %s do operador atual segura a atualização até ser enviada",
  async (estado) => {
    estadoPdv.filaVendas = [operacao("conflito"), operacao(estado)];
    sincronizarProdutosEmSegundoPlano();
    await aguardar();
    expect(getProdutos).not.toHaveBeenCalled();
    expect(estadoPdv.produtos[0].estoque_bar).toBe(10);
  },
);

test("o envio automático e a espera do estoque usam a mesma regra", () => {
  expect(operacaoParaEnviar(operacao("pendente"), "operador-atual")).toBe(true);
  expect(operacaoParaEnviar(operacao("conflito"), "operador-atual")).toBe(
    false,
  );
  expect(
    operacaoParaEnviar(operacao("pendente", "outro"), "operador-atual"),
  ).toBe(false);
});
