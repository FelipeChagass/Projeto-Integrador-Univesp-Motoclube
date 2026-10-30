/**
 * @jest-environment jsdom
 */
import {
  jest,
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
} from "@jest/globals";
import { estadoPdv } from "../static/js/features/pdv/state.js";
import { reais } from "./helpers/moeda.js";

function mockMatchMedia() {
  window.matchMedia = jest.fn().mockImplementation(() => ({
    matches: false,
    media: "(max-width: 768px)",
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }));
}

/* ── Helpers: minimal DOM for ui.js ── */
function setupDOM() {
  estadoPdv.categoriaCatalogo = "todos";
  document.body.innerHTML = `
        <div id="loading" style="display:flex"><div class="spinner"></div></div>
        <div id="toast">...</div>
        <div id="barra-operador">CAIXA FECHADO</div>
        <button id="container-abrir-caixa" class="d-none"></button>
        <button id="btn-admin" class="d-none"></button>
        <button id="sidebar-btn-admin" class="d-none"></button>
        <button id="sidebar-abrir-caixa" class="d-none"></button>
        <div id="grid-produtos" class="grid-produtos"></div>
        <div id="carrinho-lista" class="carrinho-lista"></div>
        <div id="total-display">R$ 0,00</div>
        <img id="logo-preload" class="d-none" />
        <div id="resultado-relatorio" class="d-none"></div>
    `;
}

test("filtro fixo separa categorias sem alterar produtos ou carrinho", async () => {
  setupDOM();
  const { selecionarCategoria } =
    await import("../static/js/features/pdv/ui.js");
  document.body.insertAdjacentHTML(
    "afterbegin",
    '<nav id="filtro-catalogo"><button data-categoria="bebida"></button><button data-categoria="comida"></button></nav>',
  );
  estadoPdv.produtos = [
    {
      id: 1,
      nome: "Cerveja",
      categoria: "bebida",
      preco_atual: 10,
      estoque_bar: 5,
    },
    {
      id: 2,
      nome: "Lanche",
      categoria: "comida",
      preco_atual: 20,
      estoque_bar: 5,
    },
  ];
  estadoPdv.carrinho = [{ id: 1, qtd: 1 }];
  selecionarCategoria("bebida");
  expect(document.querySelectorAll(".card")).toHaveLength(1);
  expect(document.getElementById("grid-produtos").textContent).toContain(
    "Cerveja",
  );
  selecionarCategoria("comida");
  expect(document.getElementById("grid-produtos").textContent).toContain(
    "Lanche",
  );
  expect(
    document
      .querySelector('[data-categoria="comida"]')
      .getAttribute("aria-pressed"),
  ).toBe("true");
  expect(estadoPdv.produtos).toHaveLength(2);
  expect(estadoPdv.carrinho).toEqual([{ id: 1, qtd: 1 }]);
  selecionarCategoria("outro");
  expect(document.querySelector(".catalogo-vazio")).not.toBeNull();
});

test("mudar o carrinho refaz só o cartão do item e dos combos que usam o estoque dele", async () => {
  setupDOM();
  mockMatchMedia();
  const { renderizarCatalogo, atualizarUI } =
    await import("../static/js/features/pdv/ui.js");
  estadoPdv.produtos = [
    { id: 1, nome: "Cerveja", categoria: "bebida", estoque_bar: 4 },
    { id: 2, nome: "Água", categoria: "bebida", estoque_bar: 5 },
    {
      id: 3,
      nome: "Balde",
      categoria: "combo",
      itens_combo: [{ produto_id: 1, nome: "Cerveja", quantidade: 2 }],
    },
  ];
  estadoPdv.carrinho = [];
  renderizarCatalogo();
  const cartao = (id) =>
    document.querySelector(`.pdv-produto-card[data-produto-id="${id}"]`);
  const [cerveja, agua, balde] = [cartao(1), cartao(2), cartao(3)];

  estadoPdv.carrinho = [{ id: 1, nome: "Cerveja", preco: 10, qtd: 1 }];
  atualizarUI();
  expect(cartao(2)).toBe(agua);
  expect(cartao(1)).not.toBe(cerveja);
  expect(cartao(1).textContent).toContain("Bar: 3");
  // 4 cervejas montam 2 baldes; com 1 no carrinho sobram 3, que montam 1.
  expect(cartao(3)).not.toBe(balde);
  expect(cartao(3).textContent).toContain("Monta no bar: 1");
  expect(
    [...document.querySelectorAll(".pdv-produto-card")].map(
      (elemento) => elemento.dataset.produtoId,
    ),
  ).toEqual(["1", "2", "3"]);
});

describe("ui.js — showToast()", () => {
  let showToast;
  beforeEach(async () => {
    setupDOM();
    mockMatchMedia();
    const mod = await import("../static/js/features/pdv/ui.js");
    showToast = mod.showToast;
  });

  test("exibe mensagem no element toast", () => {
    showToast("Venda OK!");
    const toast = document.getElementById("toast");
    expect(toast.innerText).toBe("Venda OK!");
    expect(toast.className).toContain("show");
  });

  test("adiciona classe toast-error para tipo err", () => {
    showToast("Falha!", "err");
    const toast = document.getElementById("toast");
    expect(toast.className).toContain("toast-error");
  });
});

describe("ui.js — fecharModal()", () => {
  let fecharModal;
  beforeEach(async () => {
    setupDOM();
    mockMatchMedia();
    document.body.insertAdjacentHTML(
      "beforeend",
      '<div id="modal-teste" class="modal-overlay" style="display:flex"></div>',
    );
    const mod = await import("../static/js/features/pdv/ui.js");
    fecharModal = mod.fecharModal;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("esconde o modal setando display none", () => {
    jest.useFakeTimers();
    fecharModal("modal-teste");
    jest.runAllTimers();
    expect(document.getElementById("modal-teste").style.display).toBe("none");
  });

  test("não quebra com ID inexistente", () => {
    expect(() => fecharModal("modal-inexistente")).not.toThrow();
  });
});

describe("ui.js — atualizarEstadoBotoes()", () => {
  let atualizarEstadoBotoes;
  beforeEach(async () => {
    setupDOM();
    mockMatchMedia();
    estadoPdv.operadorAtual = "";
    estadoPdv.caixaAberto = false;
    estadoPdv.usuarioAtual = null;
    const mod = await import("../static/js/features/pdv/ui.js");
    atualizarEstadoBotoes = mod.atualizarEstadoBotoes;
  });

  test("mostra BLOQUEADO quando sem operador", () => {
    estadoPdv.operadorAtual = "";
    atualizarEstadoBotoes();
    const barra = document.getElementById("barra-operador");
    expect(barra.innerText).toContain("BLOQUEADO");
  });

  test("mostra nome do operador quando logado", () => {
    estadoPdv.operadorAtual = "Felipe";
    estadoPdv.caixaAberto = false;
    atualizarEstadoBotoes();
    const barra = document.getElementById("barra-operador");
    expect(barra.innerText).toContain("FELIPE");
    expect(barra.innerText).toContain("FECHADO");
  });

  test("mostra CAIXA ABERTO quando caixa aberto", () => {
    estadoPdv.operadorAtual = "Maria";
    estadoPdv.caixaAberto = true;
    atualizarEstadoBotoes();
    const barra = document.getElementById("barra-operador");
    expect(barra.innerText).toContain("ABERTO");
  });

  test("mostra botão admin para perfil admin", () => {
    estadoPdv.operadorAtual = "Admin";
    estadoPdv.usuarioAtual = { perfil: "admin" };
    atualizarEstadoBotoes();
    expect(
      document.getElementById("btn-admin").classList.contains("d-none"),
    ).toBe(false);
  });

  test("esconde botão admin para perfil operador", () => {
    estadoPdv.operadorAtual = "Operador";
    estadoPdv.usuarioAtual = { perfil: "operador" };
    atualizarEstadoBotoes();
    expect(
      document.getElementById("btn-admin").classList.contains("d-none"),
    ).toBe(true);
  });
});

describe("ui.js — renderizarCatalogo()", () => {
  let renderizarCatalogo;
  beforeEach(async () => {
    setupDOM();
    mockMatchMedia();
    estadoPdv.produtos = [];
    estadoPdv.carrinho = [];
    estadoPdv.modoGerenciaEstoque = false;
    const mod = await import("../static/js/features/pdv/ui.js");
    renderizarCatalogo = mod.renderizarCatalogo;
  });

  test("mostra mensagem quando sem produtos", () => {
    estadoPdv.produtos = [];
    renderizarCatalogo();
    const grid = document.getElementById("grid-produtos");
    expect(grid.innerHTML).toContain("Nenhum produto encontrado");
  });

  test("renderiza cards para cada produto", () => {
    estadoPdv.produtos = [
      {
        id: 1,
        nome: "Cerveja",
        preco_atual: 10,
        estoque_bar: 20,
        estoque_deposito: 50,
        estoque_min_bar: 5,
        estoque_min_deposito: 10,
        url_imagem: "",
      },
      {
        id: 2,
        nome: "Água",
        preco_atual: 5,
        estoque_bar: 15,
        estoque_deposito: 30,
        estoque_min_bar: 3,
        estoque_min_deposito: 5,
        url_imagem: "",
      },
    ];
    renderizarCatalogo();
    const cards = document.querySelectorAll(".card");
    expect(cards.length).toBe(2);
  });

  test("cards contêm nome e preço sanitizados", () => {
    estadoPdv.produtos = [
      {
        id: 1,
        nome: "<script>Evil</script>",
        preco_atual: 99.9,
        estoque_bar: 10,
        estoque_deposito: 20,
        estoque_min_bar: 2,
        estoque_min_deposito: 5,
        url_imagem: "",
      },
    ];
    renderizarCatalogo();
    const card = document.querySelector(".card");
    // O nome vira texto, nunca elemento: o texto aparece literal e não há <script> no DOM.
    expect(card.querySelector("script")).toBeNull();
    expect(card.querySelector(".card-name").textContent).toBe(
      "<script>Evil</script>",
    );
    expect(card.innerHTML).toContain("&lt;script&gt;");
    expect(card.querySelector(".card-price").textContent).toBe(reais("99,90"));
  });

  test("marca card esgotado quando estoque_bar <= 0", () => {
    estadoPdv.produtos = [
      {
        id: 1,
        nome: "Esgotado",
        preco_atual: 10,
        estoque_bar: 0,
        estoque_deposito: 5,
        estoque_min_bar: 1,
        estoque_min_deposito: 1,
        url_imagem: "",
      },
    ];
    renderizarCatalogo();
    const card = document.querySelector(".card");
    expect(card.dataset.barZerado).toBe("true");
    expect(card.innerHTML).toContain("ACABOU");
  });

  test("desconta quantidade do carrinho do estoque visível", () => {
    estadoPdv.produtos = [
      {
        id: 1,
        nome: "Cerveja",
        preco_atual: 10,
        estoque_bar: 5,
        estoque_deposito: 20,
        estoque_min_bar: 1,
        estoque_min_deposito: 5,
        url_imagem: "",
      },
    ];
    estadoPdv.carrinho = [
      { id: 1, nome: "Cerveja", preco: 10, qtd: 3, obs: "" },
    ];
    renderizarCatalogo();
    const stock = document.querySelector(".card-stock");
    expect(stock.textContent).toContain("Bar: 2");
  });

  test("mostra badge ESTOQUE BAIXO quando abaixo do mínimo", () => {
    estadoPdv.produtos = [
      {
        id: 1,
        nome: "Pouco",
        preco_atual: 10,
        estoque_bar: 2,
        estoque_deposito: 20,
        estoque_min_bar: 5,
        estoque_min_deposito: 3,
        url_imagem: "",
      },
    ];
    renderizarCatalogo();
    const card = document.querySelector(".card");
    expect(card.classList.contains("card-alerta")).toBe(true);
    expect(card.innerHTML).toContain("ESTOQUE BAIXO");
  });
});

describe("ui.js — atualizarUI()", () => {
  let atualizarUI;
  beforeEach(async () => {
    setupDOM();
    mockMatchMedia();
    estadoPdv.produtos = [
      {
        id: 1,
        nome: "Cerveja",
        preco_atual: 10,
        estoque_bar: 50,
        estoque_deposito: 100,
        estoque_min_bar: 5,
        estoque_min_deposito: 10,
        url_imagem: "",
      },
    ];
    estadoPdv.carrinho = [];
    estadoPdv.modoGerenciaEstoque = false;
    const mod = await import("../static/js/features/pdv/ui.js");
    atualizarUI = mod.atualizarUI;
  });

  test("mostra total R$ 0,00 com carrinho vazio", () => {
    estadoPdv.carrinho = [];
    atualizarUI();
    expect(document.getElementById("total-display").innerText).toBe(
      reais("0,00"),
    );
  });

  test("calcula total correto com múltiplos itens", () => {
    estadoPdv.carrinho = [
      { id: 1, nome: "Cerveja", preco: 10, qtd: 3, obs: "" },
      { id: 2, nome: "Água", preco: 5, qtd: 2, obs: "" },
    ];
    atualizarUI();
    expect(document.getElementById("total-display").innerText).toBe(
      reais("40,00"),
    );
  });

  test("renderiza itens do carrinho no DOM", () => {
    estadoPdv.carrinho = [
      { id: 1, nome: "Cerveja", preco: 10, qtd: 1, obs: "Gelada" },
    ];
    atualizarUI();
    const items = document.querySelectorAll(".item-carrinho");
    expect(items.length).toBe(1);
    expect(items[0].innerHTML).toContain("Cerveja");
    expect(items[0].innerHTML).toContain("Gelada");
  });

  test("sanitiza observações no carrinho", () => {
    estadoPdv.carrinho = [
      { id: 1, nome: "Item", preco: 10, qtd: 1, obs: "<img onerror=alert(1)>" },
    ];
    atualizarUI();
    const item = document.querySelector(".item-carrinho");
    expect(item.innerHTML).not.toContain("<img");
    expect(item.innerHTML).toContain("&lt;img");
  });
});
