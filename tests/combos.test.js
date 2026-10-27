/**
 * Combos no PDV: o card e o carrinho respeitam o estoque dos itens, que é
 * dividido com as vendas avulsas; a venda otimista e o ticket expandem o combo.
 */
import { describe, test, expect, beforeEach } from "@jest/globals";
import { estadoPdv } from "../static/js/features/pdv/state.js";
import {
  consumoDoCarrinho,
  disponivelNoBar,
  precoAvulso,
  descricaoCombo,
} from "../static/js/shared/combos.js";
import { actions, ui, reports, loadModules } from "./helpers/pdv.js";

const combo = {
  id: 9,
  nome: "Combo da estrada",
  categoria: "combo",
  preco_atual: 40,
  estoque_bar: 0,
  estoque_deposito: 0,
  url_imagem: "",
  ativo: true,
  itens_combo: [
    { produto_id: 1, nome: "Cerveja", quantidade: 2, categoria: "BEBIDA" },
    { produto_id: 2, nome: "Hamburguer", quantidade: 1, categoria: "COMIDA" },
  ],
};

describe("regras compartilhadas", () => {
  const produtos = [
    { id: 1, estoque_bar: 5, preco_atual: 10 },
    { id: 2, estoque_bar: 10, preco_atual: 25 },
    combo,
  ];

  test("combo monta pelo item mais escasso e descontado do carrinho", () => {
    expect(disponivelNoBar(combo, produtos)).toBe(2);
    const carrinho = [{ id: 1, qtd: 2 }];
    expect(disponivelNoBar(combo, produtos, carrinho)).toBe(1);
  });

  test("combo no carrinho reserva os itens para a venda avulsa", () => {
    const carrinho = [{ id: 9, qtd: 2 }];
    expect(consumoDoCarrinho(carrinho, produtos).get(1)).toBe(4);
    expect(disponivelNoBar(produtos[0], produtos, carrinho)).toBe(1);
  });

  test("item fora do catálogo ativo zera o combo", () => {
    expect(disponivelNoBar(combo, [produtos[0], combo])).toBe(0);
  });

  test("preço avulso e descrição usam a composição", () => {
    expect(precoAvulso(combo.itens_combo, produtos)).toBe(45);
    expect(descricaoCombo(combo.itens_combo)).toBe(
      "2× Cerveja + 1× Hamburguer",
    );
  });
});

describe("PDV com combo", () => {
  beforeEach(async () => {
    await loadModules();
    estadoPdv.produtos.push(structuredClone(combo));
    estadoPdv.categoriaCatalogo = "todos";
  });

  test("card mostra a composição, a economia e quantos o bar monta", () => {
    ui.renderizarCatalogo();
    const card = document.querySelector('.card-combo[data-produto-id="9"]');
    expect(card.querySelector(".combo-selo").textContent).toBe("Combo");
    expect(card.querySelector(".combo-composicao").textContent).toContain(
      "Hamburguer",
    );
    expect(card.querySelector(".combo-avulso").textContent).toContain("45");
    expect(card.querySelector(".combo-stock b").textContent).toBe("10");
  });

  test("filtro Combos mostra somente combos", () => {
    ui.selecionarCategoria("combo");
    expect(document.querySelectorAll(".card")).toHaveLength(1);
    ui.selecionarCategoria("outro");
    expect(document.querySelectorAll(".card-combo")).toHaveLength(0);
  });

  test("carrinho para quando um item do combo acaba no bar", () => {
    estadoPdv.produtos[1].estoque_bar = 1;
    actions.adicionarAoCarrinho(9, "Combo da estrada", 40, "");
    actions.adicionarAoCarrinho(9, "Combo da estrada", 40, "");
    expect(estadoPdv.carrinho).toEqual([
      { id: 9, nome: "Combo da estrada", preco: 40, obs: "", qtd: 1 },
    ]);
    actions.adicionarAoCarrinho(2, "Hamburguer", 25, "");
    expect(estadoPdv.carrinho).toHaveLength(1);
    expect(document.querySelector(".item-combo").textContent).toBe(
      "2× Cerveja + 1× Hamburguer",
    );
  });

  test("combo com comida pede observação e modo estoque não edita combo", () => {
    actions.cliqueProduto(estadoPdv.produtos[2], false);
    expect(document.getElementById("modal-prod-nome").innerText).toBe(
      "Combo da estrada",
    );
    estadoPdv.modoGerenciaEstoque = true;
    actions.cliqueProduto(estadoPdv.produtos[2], false);
    expect(document.getElementById("toast").innerText).toContain(
      "estoque dos itens",
    );
  });

  test("venda otimista baixa os itens, não o combo", async () => {
    estadoPdv.carrinho = [
      { id: 9, nome: "Combo da estrada", preco: 40, obs: "", qtd: 2 },
      { id: 1, nome: "Cerveja", preco: 10, obs: "", qtd: 1 },
    ];
    await actions.registrarVendaOtimista("PIX", "Cliente");
    expect(estadoPdv.produtos[0].estoque_bar).toBe(20 - 5);
    expect(estadoPdv.produtos[1].estoque_bar).toBe(10 - 2);
    expect(estadoPdv.produtos[2].estoque_bar).toBe(0);
  });

  test("ticket do combo lista os itens e sai também para a cozinha", () => {
    reports.montarImpressao(
      [{ id: 9, nome: "Combo da estrada", qtd: 1, obs: "" }],
      "PIX",
      "Cliente",
    );
    const tickets = document.querySelectorAll("#area-impressao .ticket");
    expect(tickets).toHaveLength(2);
    expect(tickets[1].textContent).toContain("VIA COZINHA");
    expect(tickets[0].textContent).toContain("2× CERVEJA + 1× HAMBURGUER");
  });
});
