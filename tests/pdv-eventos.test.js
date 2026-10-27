import {
  jest,
  beforeEach,
  afterEach,
  describe,
  test,
  expect,
} from "@jest/globals";
import { loadModules, ui } from "./helpers/pdv.js";
import { estadoPdv } from "../static/js/features/pdv/state.js";

let configurarEventosPdv;
let esconderSidebar;

const elemento = (id) => document.getElementById(id);

beforeEach(async () => {
  await loadModules();
  jest.useFakeTimers();
  estadoPdv.categoriaCatalogo = "todos";
  document.body.className = "page-pdv";
  document.body.insertAdjacentHTML(
    "beforeend",
    `
    <button id="btn-hamburger" type="button" data-bs-toggle="offcanvas"
      data-bs-target="#sidebar-mobile" aria-controls="sidebar-mobile" aria-expanded="false"></button>
    <div id="sidebar-mobile" class="offcanvas offcanvas-end" tabindex="-1">
      <button id="sidebar-close-btn" data-bs-dismiss="offcanvas"></button>
      <button id="sidebar-config">Configurações</button>
      <button id="sidebar-gestao">Relatórios</button>
      <button id="sidebar-btn-estoque">Estoque</button>
      <button id="sidebar-logout">Sair</button>
    </div>
    <button id="btn-alternar-carrinho" type="button" aria-controls="carrinho-lista" aria-expanded="false"><span>Carrinho</span></button>
    <span id="carrinho-badge-mobile"></span>
    <nav id="filtro-catalogo"><button data-categoria="bebida">Bebidas</button><button data-categoria="combo">Combos</button></nav>
    <button id="btn-pag-dinheiro">Dinheiro</button><button id="btn-pag-cartao">Cartão</button>
    <button id="btn-confirmar-obs">Confirmar</button>
    <button id="btn-cancelar-obs">Cancelar</button>
    <button data-acionar="btn-cancelar-obs" id="fechar-obs">Fechar</button>
    <div id="modal-dinheiro" class="modal-overlay" style="display:none"></div>
    <div id="modal-cartao" class="modal-overlay" style="display:none"></div>
    <div id="valor-total-dinheiro"></div><input id="valor-recebido"><div id="display-troco"></div>
    <button id="btn-confirmar-dinheiro"></button>
    <span id="nome-operador-atual"></span><input id="data-inicio"><input id="data-fim">
  `,
  );
  elemento("carrinho-section").append(elemento("btn-alternar-carrinho"));
  esconderSidebar = jest.fn();
  window.bootstrap = {
    Offcanvas: {
      getOrCreateInstance: jest.fn(() => ({ hide: esconderSidebar })),
    },
  };
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

function simularViewport(largura) {
  window.matchMedia = jest.fn((consulta) => ({
    matches: largura <= Number(consulta.match(/max-width:\s*([\d.]+)/)?.[1]),
    addEventListener: jest.fn(),
  }));
}

async function configurar() {
  // A asserção explicita o contrato ausente antes da extração, sem erro de import.
  const eventos = await import("../static/js/features/pdv/events.js").catch(
    () => ({}),
  );
  expect(typeof eventos.configurarEventosPdv).toBe("function");
  configurarEventosPdv = eventos.configurarEventosPdv;
  configurarEventosPdv();
}

function eventoSidebar(tipo) {
  elemento("sidebar-mobile").dispatchEvent(new Event(tipo, { bubbles: true }));
}

function toque(tipo, y) {
  const evento = new Event(tipo, { bubbles: true, cancelable: true });
  Object.defineProperty(evento, "touches", {
    value: tipo === "touchend" ? [] : [{ clientX: 100, clientY: y }],
  });
  elemento("carrinho-section").dispatchEvent(evento);
}

describe("catálogo e carrinho acessíveis", () => {
  test.each([false, true])(
    "produto e combo têm botão nativo separado e nome escapado (estoque=%s)",
    (modoEstoque) => {
      estadoPdv.modoGerenciaEstoque = modoEstoque;
      estadoPdv.produtos[0].nome =
        'Cerveja "especial" <img src=x onerror=alert(1)>';
      estadoPdv.produtos.push({
        id: 3,
        nome: "Combo <b>duplo</b>",
        categoria: "COMBO",
        preco_atual: 18,
        itens_combo: [
          {
            produto_id: 1,
            nome: "Cerveja",
            quantidade: 2,
            categoria: "BEBIDA",
          },
        ],
      });
      ui.renderizarCatalogo();
      const cartoes = document.querySelectorAll(".card.pdv-produto-card");
      expect(cartoes).toHaveLength(3);
      for (const cartao of cartoes) {
        const botao = cartao.querySelector(
          "button.pdv-produto-acionador.stretched-link",
        );
        expect(botao).not.toBeNull();
        expect(botao.type).toBe("button");
        expect(botao.querySelector("div, ul, li, button")).toBeNull();
        const produto = estadoPdv.produtos.find(
          (item) => item.id == cartao.dataset.produtoId,
        );
        expect(botao.getAttribute("aria-label")).toBe(
          `${modoEstoque ? "Editar" : "Adicionar"} ${produto.nome}`,
        );
        expect(botao.textContent).toContain(
          modoEstoque ? "Editar" : "Adicionar",
        );
      }
      expect(document.querySelector('img[src="x"]')).toBeNull();
    },
  );

  test("atualizarUI soma quantidades string e zera badge sem observar mutações", () => {
    estadoPdv.carrinho = [
      { id: 1, nome: "Cerveja", preco: 10, qtd: "2" },
      { id: 2, nome: "Hamburguer", preco: 25, qtd: "3" },
    ];
    ui.atualizarUI();
    expect(elemento("carrinho-badge-mobile").textContent).toBe("5");
    expect(elemento("carrinho-badge-mobile").classList.contains("show")).toBe(
      true,
    );
    estadoPdv.carrinho = [];
    ui.atualizarUI();
    expect(elemento("carrinho-badge-mobile").textContent).toBe("0");
    expect(elemento("carrinho-badge-mobile").classList.contains("show")).toBe(
      false,
    );
  });

  test("botões de quantidade não submetem formulário e identificam o produto", () => {
    estadoPdv.carrinho = [
      { id: 1, nome: 'Cerveja "A" <b>B</b>', preco: 10, qtd: 1 },
    ];
    ui.atualizarUI();
    const diminuir = document.querySelector('[data-action="decrement"]');
    const aumentar = document.querySelector('[data-action="increment"]');
    expect(diminuir.getAttribute("type")).toBe("button");
    expect(aumentar.getAttribute("type")).toBe("button");
    expect(diminuir.getAttribute("aria-label")).toBe(
      'Diminuir quantidade de Cerveja "A" <b>B</b>',
    );
    expect(aumentar.getAttribute("aria-label")).toBe(
      'Aumentar quantidade de Cerveja "A" <b>B</b>',
    );
  });

  test("768px usa fluxo desktop, não animação de sheet", () => {
    simularViewport(768);
    elemento("modal-obs").innerHTML = '<div class="modal-content"></div>';
    ui.abrirModal("modal-obs");
    expect(elemento("modal-obs").classList.contains("sheet-open")).toBe(false);
  });
});

describe("eventos extraídos do PDV", () => {
  test("configuração idempotente delega somente ao botão e preserva item/payload", async () => {
    await configurar();
    configurarEventosPdv();
    ui.renderizarCatalogo();
    document.querySelector('.card[data-produto-id="1"] .card-name').click();
    expect(estadoPdv.carrinho).toEqual([]);
    document.querySelector('.card[data-produto-id="1"] button').click();
    expect(estadoPdv.carrinho).toEqual([
      { id: 1, nome: "Cerveja", preco: 10, obs: "", qtd: 1 },
    ]);
    document.querySelector('[data-action="increment"]').click();
    expect(estadoPdv.carrinho[0].qtd).toBe(2);
    document.querySelector('[data-action="decrement"]').click();
    expect(estadoPdv.carrinho[0].qtd).toBe(1);
    expect(elemento("carrinho-badge-mobile").textContent).toBe("1");
  });

  test("comida mantém observação e botão fechar delega ao cancelamento", async () => {
    await configurar();
    ui.renderizarCatalogo();
    document.querySelector('.card[data-produto-id="2"] button').click();
    expect(elemento("modal-obs").style.display).toBe("flex");
    elemento("custom-obs").value = "Sem cebola";
    elemento("btn-confirmar-obs").click();
    expect(estadoPdv.carrinho).toEqual([
      { id: 2, nome: "Hamburguer", preco: 25, qtd: 1, obs: "Sem cebola" },
    ]);
    elemento("fechar-obs").click();
    jest.advanceTimersByTime(350);
    expect(elemento("modal-obs").style.display).toBe("none");
  });

  test.each([
    ["btn-pag-dinheiro", "modal-dinheiro"],
    ["btn-pag-cartao", "modal-cartao"],
  ])("%s preserva pagamento pendente", async (botao, modal) => {
    await configurar();
    estadoPdv.carrinho = [
      { id: 1, nome: "Cerveja", preco: 10, qtd: 2, obs: "" },
    ];
    elemento("input-cliente").value = "Visitante";
    elemento(botao).click();
    expect(estadoPdv.pagamentoPendente).toEqual({
      tipo: "VENDA",
      valorTotal: 20,
      dados: "Visitante",
    });
    expect(elemento(modal).style.display).toBe("flex");
  });

  test.each([
    ["sidebar-config", "modal-config"],
    ["sidebar-gestao", "modal-relatorios"],
  ])(
    "%s só abre modal depois de hidden.bs.offcanvas, uma vez",
    async (botao, modal) => {
      await configurar();
      elemento("sidebar-mobile").classList.add("show");
      eventoSidebar("shown.bs.offcanvas");
      expect(elemento("btn-hamburger").getAttribute("aria-expanded")).toBe(
        "true",
      );
      elemento(botao).click();
      elemento(botao).click();
      expect(esconderSidebar).toHaveBeenCalledTimes(1);
      expect(elemento(modal).style.display).toBe("none");
      eventoSidebar("hide.bs.offcanvas");
      jest.advanceTimersByTime(1000);
      expect(elemento(modal).style.display).toBe("none");
      eventoSidebar("hidden.bs.offcanvas");
      expect(elemento(modal).style.display).toBe("flex");
      expect(elemento("btn-hamburger").getAttribute("aria-expanded")).toBe(
        "false",
      );
      elemento(modal).style.display = "none";
      eventoSidebar("hidden.bs.offcanvas");
      expect(elemento(modal).style.display).toBe("none");
    },
  );

  test("toggle e dismiss da sidebar ficam exclusivamente com a Data API Bootstrap", async () => {
    await configurar();
    elemento("btn-hamburger").click();
    elemento("sidebar-close-btn").click();
    expect(elemento("sidebar-mobile").classList.contains("open")).toBe(false);
    expect(
      window.bootstrap.Offcanvas.getOrCreateInstance,
    ).not.toHaveBeenCalled();
  });

  test("carrinho sincroniza botão e classe por clique e gesto existente", async () => {
    simularViewport(767.98);
    await configurar();
    const secao = elemento("carrinho-section");
    const botao = elemento("btn-alternar-carrinho");
    botao.querySelector("span").click();
    expect(secao.classList.contains("mobile-aberto")).toBe(true);
    expect(botao.getAttribute("aria-expanded")).toBe("true");
    toque("touchstart", 100);
    toque("touchmove", 250);
    toque("touchend", 250);
    expect(secao.classList.contains("mobile-aberto")).toBe(false);
    expect(botao.getAttribute("aria-expanded")).toBe("false");
    toque("touchstart", 250);
    toque("touchmove", 100);
    toque("touchend", 100);
    expect(secao.classList.contains("mobile-aberto")).toBe(true);
    expect(botao.getAttribute("aria-expanded")).toBe("true");
  });

  test("desktop mantém carrinho expandido sem alternar classe mobile", async () => {
    simularViewport(768);
    await configurar();
    elemento("btn-alternar-carrinho").click();
    expect(
      elemento("btn-alternar-carrinho").getAttribute("aria-expanded"),
    ).toBe("true");
    expect(
      elemento("carrinho-section").classList.contains("mobile-aberto"),
    ).toBe(false);
  });
});
