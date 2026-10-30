/**
 * Envio da fila do PDV (processarFilaVendas): só envia o que é do operador e está na hora,
 * preserva a operação quando o servidor falha e para tudo quando a sessão expira.
 */
import { beforeEach, expect, jest, test } from "@jest/globals";

const API = { processarVenda: jest.fn(), quitarContaMembro: jest.fn() };
const fila = {
  listarOperacoes: jest.fn(),
  registrarTentativa: jest.fn(),
  confirmarOperacao: jest.fn(),
  registrarFalha: jest.fn(),
  reenviarOperacao: jest.fn(),
};
const showToast = jest.fn();
jest.unstable_mockModule("../static/js/shared/api.js", () => ({ API }));
jest.unstable_mockModule("../static/js/features/pdv/ui.js", () => ({
  showToast,
  fecharModal: jest.fn(),
  abrirModal: jest.fn(),
  renderizarCatalogo: jest.fn(),
}));
jest.unstable_mockModule(
  "../static/js/features/pdv/offline-queue.js",
  () => fila,
);

const { estadoPdv } = await import("../static/js/features/pdv/state.js");
const { processarFilaVendas } =
  await import("../static/js/features/pdv/actions/sincronizacao.js");

const venda = (id, extra = {}) => ({
  id_externo: id,
  estado: "pendente",
  proxima_tentativa: 0,
  payload: { id_externo: id, usuario_origem_id: "u1" },
  ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  estadoPdv.usuarioAtual = { id: "u1" };
  estadoPdv.processandoFila = false;
  Object.defineProperty(navigator, "onLine", {
    value: true,
    configurable: true,
  });
});

test("envia só o que é do operador e já está na hora de tentar", async () => {
  fila.listarOperacoes.mockResolvedValue([
    venda("a"),
    venda("b", { payload: { id_externo: "b", usuario_origem_id: "outro" } }),
    venda("c", { estado: "conflito" }),
    venda("d", { proxima_tentativa: Date.now() + 60000 }),
  ]);
  API.processarVenda.mockResolvedValue({ total_calculado: 20 });
  await processarFilaVendas();
  expect(API.processarVenda).toHaveBeenCalledTimes(1);
  expect(API.processarVenda).toHaveBeenCalledWith(
    expect.objectContaining({ id_externo: "a" }),
  );
  expect(fila.confirmarOperacao).toHaveBeenCalledTimes(1);
  expect(estadoPdv.processandoFila).toBe(false);
});

test("recebimento de dívida vai para a rota de pagamento", async () => {
  fila.listarOperacoes.mockResolvedValue([
    venda("p", {
      payload: {
        id_externo: "p",
        usuario_origem_id: "u1",
        tipo_operacao: "pagamento",
      },
    }),
  ]);
  API.quitarContaMembro.mockResolvedValue({ total_calculado: 50 });
  await processarFilaVendas();
  expect(API.quitarContaMembro).toHaveBeenCalledTimes(1);
  expect(API.processarVenda).not.toHaveBeenCalled();
});

test("falha do servidor preserva a operação e avisa quando pedido", async () => {
  fila.listarOperacoes.mockResolvedValue([venda("a")]);
  API.processarVenda.mockRejectedValue(new Error("Servidor fora."));
  await processarFilaVendas({ notificarFalhas: true });
  expect(fila.registrarFalha).toHaveBeenCalledWith("a", expect.any(Error));
  expect(fila.confirmarOperacao).not.toHaveBeenCalled();
  expect(showToast).toHaveBeenCalledWith(
    "Operação preservada: Servidor fora. Consulte Operações pendentes.",
  );
});

test("sessão expirada (401) interrompe o envio das demais", async () => {
  fila.listarOperacoes.mockResolvedValue([venda("a"), venda("b")]);
  API.processarVenda.mockRejectedValue(
    Object.assign(new Error("Sessão expirada."), { status: 401 }),
  );
  await processarFilaVendas();
  expect(API.processarVenda).toHaveBeenCalledTimes(1);
});

test("sem rede ou sem operador não toca na fila", async () => {
  Object.defineProperty(navigator, "onLine", {
    value: false,
    configurable: true,
  });
  await processarFilaVendas();
  estadoPdv.usuarioAtual = null;
  Object.defineProperty(navigator, "onLine", {
    value: true,
    configurable: true,
  });
  await processarFilaVendas();
  expect(fila.listarOperacoes).not.toHaveBeenCalled();
});
