import { beforeEach, expect, jest, test } from "@jest/globals";

const request = jest.fn();
const confirm = jest.fn();
jest.unstable_mockModule("../static/js/shared/api.js", () => ({
  API: { request },
}));
jest.unstable_mockModule("../static/js/shared/modals.js", () => ({
  UIModal: { confirm },
}));
// Listas recarregadas depois de salvar: dependem do DOM do painel inteiro.
jest.unstable_mockModule("../static/js/features/admin/vendas.js", () => ({
  carregarVendas: jest.fn(),
}));
jest.unstable_mockModule("../static/js/features/admin/membros.js", () => ({
  carregarMembros: jest.fn(),
  atualizarExtratoAberto: jest.fn(),
}));
jest.unstable_mockModule("../static/js/features/admin/produtos.js", () => ({
  carregarProdutos: jest.fn(),
}));

const { administrarVenda, configurarEdicaoFinanceira } =
  await import("../static/js/features/admin/financeiro.js");

const venda = {
  id: 42,
  versao: 3,
  nome_cliente: "Balcão",
  metodo_pagamento: "dinheiro",
  tipo_venda: "normal",
  observacoes: "",
  valor_total: 10,
  itens: [
    {
      id: 5,
      produto_id: 7,
      nome_produto: "Produto de nome longo",
      quantidade: 2,
      preco_unitario: 5,
      preco_total: 10,
      observacoes: "Sem gelo",
    },
  ],
};

beforeEach(() => {
  request.mockReset();
  confirm.mockReset();
  document.body.innerHTML = `
        <div id="toast"></div>
        <div id="modalExtrato" class="modal-overlay d-none"></div>
        <div id="modalEdicaoFinanceira" class="modal-overlay d-none">
            <form id="form-edicao-financeira" class="modal-content modal-lg">
                <h2 id="edicao-financeira-titulo"><span data-titulo-texto></span><span id="edicao-financeira-subtitulo"></span></h2>
                <div id="edicao-financeira-campos" class="form-grid"></div>
                <button type="button" data-fechar-edicao>Cancelar</button>
                <button id="btn-salvar-edicao-financeira" type="submit">Salvar</button>
            </form>
        </div>`;
  configurarEdicaoFinanceira();
});

test("abre editor com loading sem aguardar a API e preenche quando a venda chega", async () => {
  let concluirBusca;
  request.mockReturnValueOnce(
    new Promise((resolve) => {
      concluirBusca = resolve;
    }),
  );
  const carregamento = administrarVenda(42, "editar");

  expect(
    document
      .getElementById("modalEdicaoFinanceira")
      .classList.contains("d-none"),
  ).toBe(false);
  expect(document.querySelector('[role="status"]').textContent).toContain(
    "Carregando",
  );
  expect(document.getElementById("btn-salvar-edicao-financeira").disabled).toBe(
    true,
  );
  expect(request).toHaveBeenCalledWith("GET", "/admin/vendas/42", undefined);

  concluirBusca({ venda });
  await carregamento;
  expect(
    document.querySelector(".edicao-item-produto strong").textContent,
  ).toBe(venda.itens[0].nome_produto);
  expect(
    document.querySelector(".edicao-item-preco").closest("td").dataset.label,
  ).toContain("Preço");
  expect(document.getElementById("btn-salvar-edicao-financeira").disabled).toBe(
    false,
  );
});

test("fechar durante a busca não reabre o modal nem exibe dados atrasados", async () => {
  let concluirBusca;
  request.mockReturnValueOnce(
    new Promise((resolve) => {
      concluirBusca = resolve;
    }),
  );
  const carregamento = administrarVenda(42, "editar");
  document.querySelector("[data-fechar-edicao]").click();
  concluirBusca({ venda });
  await carregamento;
  expect(document.querySelector(".edicao-item-produto")).toBeNull();
  expect(document.getElementById("btn-salvar-edicao-financeira").disabled).toBe(
    false,
  );
});

test("resposta inválida mantém o modal aberto com erro e bloqueia salvamento", async () => {
  request.mockResolvedValueOnce({ status: "ok" });
  await administrarVenda(42, "editar");
  expect(
    document
      .getElementById("modalEdicaoFinanceira")
      .classList.contains("d-none"),
  ).toBe(false);
  expect(document.querySelector('[role="alert"]').textContent).toContain(
    "Não foi possível carregar",
  );
  expect(document.getElementById("btn-salvar-edicao-financeira").disabled).toBe(
    true,
  );
});

const catalogo = [
  { id: 7, nome: "Produto de nome longo", preco_atual: 6, ativo: true },
  { id: 8, nome: "Refrigerante", preco_atual: 4, estoque_bar: 3, ativo: true },
  { id: 9, nome: "Antigo", preco_atual: 1, ativo: false },
];

/** Abre a venda com o catálogo e devolve o corpo do PUT ao salvar. */
async function abrirComCatalogo() {
  request.mockImplementation(async (metodo, caminho) => {
    if (caminho === "/admin/produtos") return { produtos: catalogo };
    if (metodo === "GET") return { venda };
    return { status: "ok", mensagem: "Venda atualizada" };
  });
  await administrarVenda(42, "editar");
}

function escolher(seletor, valor) {
  seletor.value = valor;
  seletor.dispatchEvent(new Event("change", { bubbles: true }));
}

async function salvarEdicao() {
  document
    .getElementById("form-edicao-financeira")
    .dispatchEvent(new Event("submit", { cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  return request.mock.calls.find(([metodo]) => metodo === "PUT")[2];
}

test("trocar o produto zera o item vendido e inclui o escolhido com o preço atual", async () => {
  await abrirComCatalogo();
  const opcoes = [
    ...document.querySelectorAll('select[name="produto-0"] option'),
  ].map((opcao) => opcao.value);
  expect(opcoes).toEqual(["7", "8"]); // inativo fica de fora

  document.querySelector("[data-alternar-troca]").click();
  escolher(document.querySelector('select[name="produto-0"]'), "8");
  expect(document.querySelector("[data-nome-item]").textContent).toBe(
    "Refrigerante",
  );
  expect(document.querySelector('[name="preco-0"]').value).toBe("4.00");
  expect(document.querySelector("[data-resumo-total]").textContent).toContain(
    "8,00",
  );

  const corpo = await salvarEdicao();
  expect(corpo.itens).toEqual([
    {
      id: 5,
      quantidade: 0,
      preco_unitario: "4.00",
      observacoes: "Sem gelo",
    },
  ]);
  expect(corpo.novos_itens).toEqual([
    {
      produto_id: 8,
      quantidade: 2,
      preco_unitario: "4.00",
      observacoes: "Sem gelo",
    },
  ]);
});

test("adicionar produto inclui um item novo e removê-lo o tira da tabela", async () => {
  await abrirComCatalogo();
  const botaoAdicionar = document.querySelector("[data-adicionar-item]");
  botaoAdicionar.click();
  botaoAdicionar.click();
  const novos = document.querySelectorAll("[data-item-novo]");
  expect(novos).toHaveLength(2);
  escolher(novos[0].querySelector("select"), "8");
  novos[0].querySelector('[data-quantidade-delta="1"]').click();
  novos[1].querySelector("[data-remover-item]").click();
  expect(document.querySelectorAll("[data-item-novo]")).toHaveLength(1);
  expect(document.querySelector("[data-resumo-total]").textContent).toContain(
    "18,00",
  );

  const corpo = await salvarEdicao();
  expect(corpo.itens[0]).toMatchObject({ id: 5, quantidade: 2 });
  expect(corpo.novos_itens).toEqual([
    { produto_id: 8, quantidade: 2, preco_unitario: "4.00", observacoes: "" },
  ]);
});

test("sem catálogo a venda abre sem trocar nem adicionar produtos", async () => {
  request.mockImplementation(async (metodo, caminho) =>
    caminho === "/admin/produtos" ? null : { venda },
  );
  await administrarVenda(42, "editar");
  expect(document.querySelector(".edicao-item-produto strong")).not.toBeNull();
  expect(document.querySelector("[data-adicionar-item]")).toBeNull();
  expect(document.querySelector("[data-alternar-troca]")).toBeNull();
});

test("confirma exclusão antes de requisitar a versão atual da venda", async () => {
  await administrarVenda(42, "excluir");
  expect(confirm).toHaveBeenCalledTimes(1);
  expect(request).not.toHaveBeenCalled();

  request
    .mockResolvedValueOnce({ venda })
    .mockRejectedValueOnce(new Error("Falha de rede"));
  await confirm.mock.calls[0][1]();
  expect(request).toHaveBeenNthCalledWith(
    1,
    "GET",
    "/admin/vendas/42",
    undefined,
  );
  expect(request).toHaveBeenNthCalledWith(2, "DELETE", "/admin/vendas/42", {
    versao: 3,
  });
});
