/** Consulta compartilhada e integração real com os módulos das duas telas. */
import { beforeEach, expect, jest, test } from "@jest/globals";
import { readFileSync } from "node:fs";
import {
  criarConsultaExtrato,
  periodoExtrato,
} from "../static/js/shared/extrato-membro.js";

const partial = readFileSync(
  "templates/shared/extrato-membro.html",
  "utf8",
).replace(/\{#[\s\S]*?#\}/g, "");
const dados = (total = 350, itens = []) => ({
  total,
  itens,
  resumo: {
    total_periodo: 200,
    total_pago_periodo: 0,
    total_aberto_periodo: 200,
    divida_total_atual: total,
  },
  paginacao: { total: itens.length, tem_mais: false },
});
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
let root, buscar, notificar, consulta;
beforeEach(() => {
  document.body.innerHTML = `<div id="consulta">${partial}</div>`;
  root = document.getElementById("consulta");
  buscar = jest.fn(async () => dados());
  notificar = jest.fn();
  consulta = criarConsultaExtrato(root, { buscar, notificar });
});
const campo = (nome) => root.querySelector(`[name="${nome}"]`);
function aplicar(modo, valores) {
  campo("modo").value = modo;
  campo("modo").dispatchEvent(new Event("change", { bubbles: true }));
  Object.entries(valores).forEach(([k, v]) => {
    campo(k).value = v;
  });
  root
    .querySelector("form")
    .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

test("consulta todo o histórico ou intervalo de datas; bloqueia períodos inválidos", () => {
  expect(periodoExtrato({ modo: "todos" })).toEqual({});
  expect(
    periodoExtrato({ modo: "datas", inicio: "2026-02-01", fim: "2026-02-28" }),
  ).toEqual({ data_inicio: "2026-02-01", data_fim: "2026-02-28" });
  for (const filtro of [
    { modo: "desconhecido" },
    { modo: "datas", inicio: "2026-02-30", fim: "2026-03-01" },
    { modo: "datas", inicio: "2026-03-01", fim: "2026-02-01" },
    { modo: "datas", inicio: "2026-01-01", fim: "" },
  ]) {
    expect(() => periodoExtrato(filtro)).toThrow();
  }
  expect([...campo("modo").options].map((option) => option.value)).toEqual([
    "todos",
    "datas",
  ]);
});

test("aplicar e limpar filtros preserva membro e saldo total; repetir estado não consulta novamente", async () => {
  await consulta.selecionar("a");
  aplicar("datas", { inicio: "2026-02-01", fim: "2026-02-28" });
  await tick();
  expect(buscar).toHaveBeenLastCalledWith("a", {
    data_inicio: "2026-02-01",
    data_fim: "2026-02-28",
    limite: 20,
    offset: 0,
  });
  expect(root.querySelector("[data-total-atual]").textContent).toBe(
    "R$ 350.00",
  );
  expect(root.querySelector("[data-resumo]").textContent).toContain(
    "R$ 200.00",
  );
  aplicar("datas", { inicio: "2026-02-01", fim: "2026-02-28" });
  await tick();
  expect(buscar).toHaveBeenCalledTimes(2);
  root.querySelector("[data-limpar]").click();
  await tick();
  expect(buscar).toHaveBeenLastCalledWith("a", { limite: 20, offset: 0 });
  expect(root.textContent).toContain(
    "Nenhum lançamento encontrado para o período selecionado.",
  );
});

test("invalidez bloqueia consulta e erro permite tentar novamente", async () => {
  await consulta.selecionar("a");
  aplicar("datas", { inicio: "2026-03-01", fim: "2026-02-01" });
  expect(buscar).toHaveBeenCalledTimes(1);
  expect(notificar).toHaveBeenCalled();
  buscar.mockRejectedValueOnce(new Error("Indisponível"));
  aplicar("datas", { inicio: "2026-02-01", fim: "2026-02-28" });
  await tick();
  expect(root.querySelector("[data-estado]").textContent).toContain(
    "tentar novamente",
  );
  aplicar("datas", { inicio: "2026-02-01", fim: "2026-02-28" });
  await tick();
  expect(root.getAttribute("aria-busy")).toBe("false");
  expect(root.querySelector("[data-total-atual]").textContent).toBe(
    "R$ 350.00",
  );
});

test("troca rápida de membro ignora resposta antiga e limpa dívida anterior", async () => {
  let resolver;
  buscar.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolver = resolve;
      }),
  );
  const antiga = consulta.selecionar("a");
  await consulta.selecionar("b");
  resolver(dados(999));
  await antiga;
  expect(root.querySelector("[data-total-atual]").textContent).toBe(
    "R$ 350.00",
  );
  await consulta.selecionar(null);
  expect(root.querySelector("[data-total-atual]").textContent).toBe("—");
});

test("troca rápida de período descarta resposta atrasada e paginação mantém o filtro", async () => {
  await consulta.selecionar("a");
  let resolver;
  buscar.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolver = resolve;
      }),
  );
  aplicar("datas", { inicio: "2026-01-01", fim: "2026-01-31" });
  buscar.mockResolvedValueOnce({
    ...dados(350, [
      { id: "1", tipo: "debito", valor: 200, situacao: "em_aberto" },
    ]),
    paginacao: { tem_mais: true, total: 21 },
  });
  aplicar("datas", { inicio: "2026-02-01", fim: "2026-02-28" });
  await tick();
  resolver(dados(999));
  await tick();
  expect(root.querySelector("[data-total-atual]").textContent).toBe(
    "R$ 350.00",
  );
  root.querySelector("[data-proxima]").click();
  await tick();
  expect(buscar).toHaveBeenLastCalledWith(
    "a",
    expect.objectContaining({ data_inicio: "2026-02-01", offset: 20 }),
  );
});

test("voltar ao filtro anterior durante uma requisição não aceita dados do filtro abandonado", async () => {
  await consulta.selecionar("a");
  let resolver;
  buscar.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolver = resolve;
      }),
  );
  aplicar("datas", { inicio: "2026-01-01", fim: "2026-01-31" });
  root.querySelector("[data-limpar]").click();
  await tick();
  resolver(dados(999));
  await tick();
  expect(buscar).toHaveBeenCalledTimes(3);
  expect(root.querySelector("[data-total-atual]").textContent).toBe(
    "R$ 350.00",
  );
  expect(root.querySelector("[data-periodo]").textContent).toBe(
    "Todo o histórico",
  );
});

test("atualizar após edição invalida a consulta que já estava em andamento", async () => {
  let resolver;
  buscar.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolver = resolve;
      }),
  );
  const antiga = consulta.selecionar("a");
  buscar.mockResolvedValueOnce(dados(200));
  await consulta.atualizar();
  resolver(dados(999));
  await antiga;
  expect(root.querySelector("[data-total-atual]").textContent).toBe(
    "R$ 200.00",
  );
});

test("resumo e movimentos preservam valores financeiros, rótulos e escape de HTML", async () => {
  buscar.mockResolvedValueOnce({
    ...dados(350, [
      {
        id: "movimento-1",
        descricao: "<img src=x onerror=alert(1)>",
        tipo: "debito",
        origem: "venda_fiado",
        situacao: "parcial",
        data: "01/02/2026 20:35",
        valor: 500,
        valor_abatido: 150,
        valor_aberto: 350,
      },
    ]),
    resumo: {
      total_periodo: 500,
      total_pago_periodo: 150,
      total_aberto_periodo: 350,
      total_creditos_ajuste_periodo: 25,
    },
  });

  await consulta.selecionar("membro-1");

  const resumoPeriodo = root.querySelector("[data-resumo]");
  expect(
    [...resumoPeriodo.querySelectorAll("strong")].map(
      (valorResumo) => valorResumo.textContent,
    ),
  ).toEqual(["R$ 500.00", "R$ 150.00", "R$ 350.00"]);
  expect(resumoPeriodo.textContent).toContain(
    "Créditos de ajuste no período: R$ 25.00 (não são pagamentos).",
  );
  const movimento = root.querySelector("[data-itens] article");
  expect(movimento.textContent).toContain("<img src=x onerror=alert(1)>");
  expect(movimento.querySelector("img")).toBeNull();
  expect(movimento.textContent).toContain("Venda pendurada");
  expect(movimento.textContent).toContain("Parcialmente pago");
  expect(movimento.textContent).toContain(
    "Abatido: R$ 150.00 · Em aberto: R$ 350.00",
  );
  expect(root.querySelector("[data-pagina]").textContent).toBe("1–1 de 1");
});

test("ações administrativas delegadas preservam membro, movimento e ação selecionada", async () => {
  const administrar = jest.fn();
  const movimento = {
    id: "movimento-1",
    descricao: "Venda",
    tipo: "debito",
    valor: 200,
    situacao: "em_aberto",
  };
  consulta = criarConsultaExtrato(root, { buscar, notificar, administrar });
  buscar.mockResolvedValueOnce(dados(200, [movimento]));

  await consulta.selecionar("membro-1");
  root.querySelector('[data-acao="editar"]').click();
  root.querySelector('[data-acao="excluir"]').click();

  expect(administrar.mock.calls).toEqual([
    ["membro-1", movimento, "editar"],
    ["membro-1", movimento, "excluir"],
  ]);
  root.querySelector("[data-itens] article strong").click();
  expect(administrar).toHaveBeenCalledTimes(2);
});
