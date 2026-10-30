/**
 * Combos no painel com o template real da aba de produtos: payload enviado,
 * resumo de economia e desativação restrita à ação do administrador.
 */
import { beforeAll, beforeEach, expect, jest, test } from "@jest/globals";
import { readFileSync } from "node:fs";
import {
  renderizarPaineis,
  instalarOffcanvas,
  enviarPainel,
  painelAberto,
} from "./helpers/admin.js";

const request = jest.fn();
const confirm = jest.fn((_mensagem, aoConfirmar) => aoConfirmar());
jest.unstable_mockModule("../static/js/shared/api.js", () => ({
  API: { request },
}));
jest.unstable_mockModule("../static/js/shared/modals.js", () => ({
  UIModal: { confirm },
}));

const produtos = await import("../static/js/features/admin/produtos.js");
const combos = await import("../static/js/features/admin/combos.js");
const { setupEventListeners } =
  await import("../static/js/features/admin/events.js");

const catalogo = [
  {
    id: 1,
    nome: "Cerveja",
    preco_atual: 12,
    categoria: "bebida",
    estoque_bar: 9,
    estoque_deposito: 20,
    ativo: true,
  },
  {
    id: 2,
    nome: "Porção",
    preco_atual: 30,
    categoria: "comida",
    estoque_bar: 2,
    estoque_deposito: 0,
    ativo: true,
  },
  {
    id: 3,
    nome: "Antigo",
    preco_atual: 5,
    categoria: "bebida",
    estoque_bar: 0,
    estoque_deposito: 0,
    ativo: false,
  },
  {
    id: 9,
    nome: "Combo da estrada",
    preco_atual: 40,
    categoria: "combo",
    estoque_bar: 2,
    estoque_deposito: 0,
    ativo: true,
    itens_combo: [
      { produto_id: 1, nome: "Cerveja", quantidade: 2, ativo: true },
      { produto_id: 2, nome: "Porção", quantidade: 1, ativo: true },
    ],
  },
];
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeAll(instalarOffcanvas);

beforeEach(async () => {
  request.mockReset();
  confirm.mockClear();
  request.mockImplementation(async (method, endpoint) => {
    if (method === "GET" && endpoint === "/admin/produtos")
      return { status: "ok", produtos: catalogo };
    return { status: "ok", mensagem: "Salvo" };
  });
  const template = readFileSync(
    "templates/admin/produtos.html",
    "utf8",
  ).replace(/\{#[\s\S]*?#\}/g, "");
  document.body.innerHTML = `<div id="toast"></div>${template}${renderizarPaineis(
    "templates/admin/paineis/produtos.html",
  )}`;
  setupEventListeners();
  await produtos.carregarProdutos();
});

function escolher(linha, produtoId, quantidade) {
  linha.querySelector(".combo-item-produto").value = String(produtoId);
  linha.querySelector(".combo-item-qtd").value = String(quantidade);
  linha
    .querySelector(".combo-item-qtd")
    .dispatchEvent(new Event("input", { bubbles: true }));
}

test("novo combo envia itens do estoque e mostra a economia", async () => {
  document.getElementById("btn-add-combo").click();
  expect(painelAberto("painel-combo")).toBe(true);
  const opcoes = [
    ...document.querySelectorAll(".combo-item-produto option"),
  ].map((o) => o.value);
  expect(opcoes).not.toContain("3"); // desativado
  expect(opcoes).not.toContain("9"); // combo não entra em combo
  document.getElementById("combo-nome").value = "Combo da noite";
  document.getElementById("combo-preco").value = "45";
  const [primeira, segunda] = document.querySelectorAll(".combo-item-linha");
  escolher(primeira, 1, 2);
  escolher(segunda, 2, 1);
  const resumo = document.getElementById("combo-resumo").textContent;
  expect(resumo).toContain("54,00");
  expect(resumo).toContain("9,00");
  expect(resumo).toMatch(/monta\s+2\s+combos/);
  enviarPainel("painel-combo");
  await settle();
  expect(request).toHaveBeenCalledWith("POST", "/admin/combos", {
    nome: "Combo da noite",
    preco_atual: 45,
    itens: [
      { produto_id: 1, quantidade: 2 },
      { produto_id: 2, quantidade: 1 },
    ],
  });
});

test("combo com menos de 2 unidades não é enviado", async () => {
  document.getElementById("btn-add-combo").click();
  document.getElementById("combo-nome").value = "Solo";
  document.getElementById("combo-preco").value = "10";
  escolher(document.querySelector(".combo-item-linha"), 1, 1);
  await combos.salvarCombo();
  expect(request).not.toHaveBeenCalledWith(
    "POST",
    "/admin/combos",
    expect.anything(),
  );
});

test("linha do combo edita itens e desativa somente pela ação do admin", async () => {
  const linha = document
    .querySelector('[data-action="editar-combo"]')
    .closest("tr");
  expect(linha.textContent).toContain("2× Cerveja + 1× Porção");
  expect(linha.querySelector('[data-action="ajuste-estoque"]')).toBeNull();
  expect(linha.querySelector("select")).toBeNull();

  linha.querySelector('[data-action="editar-combo"]').click();
  expect(document.getElementById("painel-combo-complemento").textContent).toBe(
    "Combo da estrada",
  );
  expect(document.querySelectorAll(".combo-item-linha")).toHaveLength(2);
  escolher(document.querySelectorAll(".combo-item-linha")[0], 1, 3);
  enviarPainel("painel-combo");
  await settle();
  expect(request).toHaveBeenCalledWith("PUT", "/admin/combos/9/itens", {
    itens: [
      { produto_id: 1, quantidade: 3 },
      { produto_id: 2, quantidade: 1 },
    ],
  });

  document.querySelector('[data-action="desativar-combo"]').click();
  await settle();
  expect(confirm).toHaveBeenCalledTimes(1);
  expect(request).toHaveBeenCalledWith("PUT", "/admin/produtos/9", {
    ativo: false,
  });
});
