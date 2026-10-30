/** Contratos da outbox IndexedDB vigente: identidade, ACK, retry e reconciliação. */
import { beforeEach, expect, jest, test } from "@jest/globals";
import { IDBFactory } from "fake-indexeddb";
import * as queue from "../static/js/features/pdv/offline-queue.js";

const payload = {
  id_externo: "sale-original",
  usuario_origem_id: "user-a",
  caixa_id: "box-a",
  itens: [{ id: 1, qtd: 1 }],
};
const ack = {
  status: "ok",
  id_externo: payload.id_externo,
  usuario_id: "user-a",
  caixa_id: "box-a",
  venda_id: "server-sale",
  total_calculado: 10,
};
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
});

test("persists immutable payload across module reload and rejects overwriting identifier", async () => {
  await queue.persistirOperacao(payload);
  await expect(
    queue.persistirOperacao({ ...payload, caixa_id: "another" }),
  ).rejects.toBeDefined();
  jest.resetModules();
  const reloaded = await import("../static/js/features/pdv/offline-queue.js");
  expect((await reloaded.listarOperacoes())[0].payload).toEqual(payload);
});

test.each(["ok", "duplicado"])(
  "only valid %s ACK retires pending record, retaining receipt",
  async (status) => {
    await queue.persistirOperacao(payload);
    await queue.confirmarOperacao(payload, { ...ack, status });
    expect(await queue.listarOperacoes()).toEqual([]);
    const [receipt] = await queue.listarOperacoes({ incluirConfirmadas: true });
    expect(receipt.confirmacao.venda_id).toBe("server-sale");
    expect(receipt.payload).toEqual(payload);
  },
);

test.each([
  { status: "erro" },
  { id_externo: "foreign" },
  { usuario_id: "foreign" },
  { caixa_id: "foreign" },
  { venda_id: null },
  { total_calculado: null },
  { total_calculado: -1 },
])("rejects ambiguous or foreign ACK %j", async (change) => {
  await queue.persistirOperacao(payload);
  await expect(
    queue.confirmarOperacao(payload, { ...ack, ...change }),
  ).rejects.toMatchObject({ code: "INVALID_ACK" });
  expect(await queue.listarOperacoes()).toHaveLength(1);
});

test.each([
  [401, "autenticacao"],
  [403, "autenticacao"],
  [409, "conflito"],
  [422, "reconciliacao"],
  [500, "aguardando_reenvio"],
  [0, "aguardando_reenvio"],
])(
  "preserves HTTP/network failure %s without replacing identity",
  async (status, state) => {
    await queue.persistirOperacao(payload);
    await queue.registrarTentativa(payload.id_externo);
    await queue.registrarFalha(payload.id_externo, {
      status,
      retryable: status === 0 || status >= 500,
      message: "public error",
    });
    const [record] = await queue.listarOperacoes();
    expect(record).toMatchObject({ estado: state, tentativas: 1, payload });
    expect(record.proxima_tentativa).toBeGreaterThan(Date.now());
  },
);

test("preserves failure diagnostics for reconciliation", async () => {
  await queue.persistirOperacao(payload);
  await queue.registrarFalha(payload.id_externo, {
    code: "SERVER_UNREACHABLE",
    message: "Servidor inacessível.",
    retryable: true,
    details: { endpoint: "/vendas" },
    requestId: "request-test",
  });
  const [record] = await queue.listarOperacoes();
  expect(record.ultimo_erro).toMatchObject({
    code: "SERVER_UNREACHABLE",
    details: { endpoint: "/vendas" },
    request_id: "request-test",
  });
  expect(record.ultimo_erro.ocorrido_em).toBeTruthy();
});

test("bounded automatic retries and explicit same-owner reconciliation", async () => {
  await queue.persistirOperacao(payload);
  for (let i = 0; i < 8; i++)
    await queue.registrarTentativa(payload.id_externo);
  await queue.registrarFalha(payload.id_externo, {
    retryable: true,
    message: "network",
  });
  expect((await queue.listarOperacoes())[0].estado).toBe("reconciliacao");
  await expect(
    queue.reenviarOperacao(payload.id_externo, "user-b"),
  ).rejects.toThrow("origem");
  await queue.reenviarOperacao(payload.id_externo, "user-a");
  expect((await queue.listarOperacoes())[0]).toMatchObject({
    estado: "pendente",
    payload,
  });
});

test("storage failure prevents accepting a sale", async () => {
  globalThis.indexedDB = undefined;
  await expect(queue.persistirOperacao(payload)).rejects.toThrow(
    "indisponível",
  );
});

test("falha do IndexedDB chega em português, não como DOMException em inglês", async () => {
  globalThis.indexedDB = {
    open: () => {
      const requisicao = {};
      setTimeout(() => {
        requisicao.error = new DOMException(
          "The quota has been exceeded.",
          "QuotaExceededError",
        );
        requisicao.onerror();
      });
      return requisicao;
    },
  };
  await expect(queue.listarOperacoes()).rejects.toThrow(
    "Sem espaço no armazenamento do navegador. Libere espaço e tente de novo.",
  );
});

test("listagem padrão lê pelo índice de estado e ignora recibos confirmados", async () => {
  const outra = { ...payload, id_externo: "sale-2" };
  await queue.persistirOperacao(payload);
  await queue.persistirOperacao(outra);
  await queue.confirmarOperacao(payload, ack);
  await queue.registrarFalha("sale-2", { status: 409, message: "Conflito" });
  expect(
    (await queue.listarOperacoes()).map((operacao) => operacao.estado),
  ).toEqual(["conflito"]);
  expect(
    await queue.listarOperacoes({ incluirConfirmadas: true }),
  ).toHaveLength(2);
});

test("poda apaga só recibos confirmados há mais de 30 dias", async () => {
  const antiga = { ...payload, id_externo: "sale-antiga" };
  const recente = { ...payload, id_externo: "sale-recente" };
  const pendente = { ...payload, id_externo: "sale-pendente" };
  for (const operacao of [antiga, recente, pendente])
    await queue.persistirOperacao(operacao);
  await queue.confirmarOperacao(antiga, { ...ack, id_externo: "sale-antiga" });
  await queue.confirmarOperacao(recente, {
    ...ack,
    id_externo: "sale-recente",
  });
  const daquiA31Dias = Date.now() + 31 * 24 * 60 * 60 * 1000;
  // Do ponto de vista de daqui a 31 dias, as duas confirmadas estão vencidas...
  expect(await queue.podarConfirmadas({ agora: daquiA31Dias, dias: 30 })).toBe(
    2,
  );
  // ...e a pendente nunca é apagada, por mais antiga que seja.
  const restantes = await queue.listarOperacoes({ incluirConfirmadas: true });
  expect(restantes.map((operacao) => operacao.id_externo)).toEqual([
    "sale-pendente",
  ]);
  expect(await queue.podarConfirmadas()).toBe(0);
});

test("aparelho com o banco na v1 migra para a v2 sem perder a fila", async () => {
  await new Promise((resolver) => {
    const abertura = indexedDB.open("motoBarOperacoes", 1);
    abertura.onupgradeneeded = () =>
      abertura.result
        .createObjectStore("operacoes", { keyPath: "id_externo" })
        .add({ id_externo: "sale-v1", estado: "pendente", payload });
    abertura.onsuccess = () => {
      abertura.result.close();
      resolver();
    };
  });
  const operacoes = await queue.listarOperacoes();
  expect(operacoes.map((operacao) => operacao.id_externo)).toEqual(["sale-v1"]);
});
