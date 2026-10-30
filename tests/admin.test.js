/**
 * Contratos dos módulos administrativos com DOM real de teste e API simulada.
 * Cobre delegação, IDs, valores esperados, navegação e interrupção em falhas HTTP.
 */
import { beforeAll, beforeEach, expect, jest, test } from "@jest/globals";
import { readFileSync } from "node:fs";
import {
  renderizarPaineis,
  instalarOffcanvas,
  enviarPainel,
  painelAberto,
} from "./helpers/admin.js";
import { reais } from "./helpers/moeda.js";

const request = jest.fn();
const confirm = jest.fn((_mensagem, aoConfirmar) => aoConfirmar());
jest.unstable_mockModule("../static/js/shared/api.js", () => ({
  API: { request },
}));
jest.unstable_mockModule("../static/js/shared/modals.js", () => ({
  UIModal: { confirm },
}));

const produtos = await import("../static/js/features/admin/produtos.js");
const membros = await import("../static/js/features/admin/membros.js");
const usuarios = await import("../static/js/features/admin/usuarios.js");
const produtoForm = await import("../static/js/features/admin/produto-form.js");
const ajusteEstoque =
  await import("../static/js/features/admin/ajuste-estoque.js");
const usuarioForm = await import("../static/js/features/admin/usuario-form.js");
const vendas = await import("../static/js/features/admin/vendas.js");
const configuracoes =
  await import("../static/js/features/admin/configuracoes.js");
const { setupEventListeners } =
  await import("../static/js/features/admin/events.js");
const { switchTab } = await import("../static/js/features/admin/navigation.js");
const { requisitar } = await import("../static/js/features/admin/requests.js");
const { esc, mostrarEsqueleto } =
  await import("../static/js/features/admin/ui.js");
const { criarCsv } = await import("../static/js/features/admin/csv.js");

const product = {
  id: 7,
  nome: "Água",
  preco_atual: 10,
  estoque_bar: 5,
  estoque_deposito: 10,
  categoria: "bebida",
  estoque_min_bar: 1,
  estoque_min_deposito: 2,
  ativo: true,
};
const member = {
  id: "member-uuid",
  nome: "Membro",
  saldo_devedor: 20,
  ativo: true,
};
const user = {
  id: "user-uuid",
  nome: "Admin",
  email: "test@example.test",
  perfil: "admin",
  ativo: true,
};
const settleEvents = () => new Promise((resolve) => setTimeout(resolve, 0));

const PAINEIS = ["produtos", "membros", "usuarios"]
  .map((arquivo) =>
    renderizarPaineis(`templates/admin/paineis/${arquivo}.html`),
  )
  .join("");

beforeAll(instalarOffcanvas);

beforeEach(() => {
  request.mockReset();
  confirm.mockClear();
  request.mockImplementation(async (method, endpoint) => {
    if (method !== "GET") return { status: "ok", mensagem: "Salvo" };
    if (endpoint === "/admin/produtos")
      return { status: "ok", produtos: [product] };
    if (endpoint === "/admin/membros")
      return { status: "ok", membros: [member] };
    if (endpoint === "/admin/usuarios")
      return { status: "ok", usuarios: [user] };
    if (endpoint === "/admin/config")
      return {
        config: { imprimir_automatico: true, largura_impressao: "ticket-58mm" },
      };
    if (endpoint.startsWith("/admin/vendas"))
      return {
        vendas: [
          {
            valor_total: 10,
            tipo_venda: "normal",
            metodo_pagamento: "pix",
            itens: [],
          },
        ],
      };
    throw new Error(`Unexpected test request: ${endpoint}`);
  });
  document.body.innerHTML = `
        <div id="toast"></div><button id="btn-exportar-vendas"></button>
        <input type="checkbox" id="mostrarProdutosInativos"><input type="checkbox" id="mostrarMembrosInativos">
        <table><tbody id="tabelaProdutos"></tbody></table>
        <table><tbody id="tabelaMembros"></tbody></table>
        <table><tbody id="tabelaUsuarios"></tbody></table>
        <table><tbody id="tabelaVendas"></tbody></table>
        <input id="vendas-data-inicio"><input id="vendas-data-fim"><input id="vendas-tipo"><div id="vendas-resumo"></div>
        <select id="cfg-imprimir"><option value="true">Sim</option><option value="false">Não</option></select>
        <select id="cfg-largura"><option value="ticket-80mm">80</option><option value="ticket-58mm">58</option></select>
        ${PAINEIS}
        ${["produtos", "membros", "usuarios", "vendas", "config"]
          .map(
            (name) =>
              `<button data-admin-tab="${name}" class="btn"></button><section id="tab-${name}" class="tab-pane"></section>`,
          )
          .join("")}
    `;
});

test("os módulos de domínio não fazem requisições ao importar", () => {
  expect(request).not.toHaveBeenCalled();
  expect(esc("<nome>")).toBe("&lt;nome&gt;");
});

test("produtos: editar abre o painel preenchido e envia o ID numérico e o payload", async () => {
  setupEventListeners();
  await produtos.carregarProdutos();
  document.querySelector('[data-action="editar-produto"]').click();
  expect(painelAberto("painel-produto")).toBe(true);
  expect(
    document.getElementById("painel-produto-complemento").textContent,
  ).toBe("Água");
  expect(document.getElementById("produto-nome").value).toBe("Água");
  document.getElementById("produto-preco").value = "12.5";
  enviarPainel("painel-produto");
  await settleEvents();
  expect(request).toHaveBeenCalledWith("PUT", "/admin/produtos/7", {
    nome: "Água",
    preco_atual: 12.5,
    categoria: "bebida",
  });
  expect(painelAberto("painel-produto")).toBe(false);
  expect(document.querySelectorAll("#tabelaProdutos tr")).toHaveLength(1);
});

test("falha ao salvar mantém o painel aberto, sem confirmação visual ou recarga", async () => {
  setupEventListeners();
  await produtos.carregarProdutos();
  produtoForm.abrirEdicaoProduto(7);
  request.mockClear();
  request.mockRejectedValueOnce(new Error("Conflito de edição"));
  await produtoForm.salvarProduto();
  expect(request).toHaveBeenCalledTimes(1);
  expect(document.getElementById("toast").textContent).toBe(
    "Conflito de edição",
  );
  expect(painelAberto("painel-produto")).toBe(true);
  expect(document.querySelectorAll("#tabelaProdutos tr")).toHaveLength(1);
});

test("ações da linha: ícones com nome acessível e ações específicas no menu", async () => {
  await produtos.carregarProdutos();
  const editar = document.querySelector('[data-action="editar-produto"]');
  expect(editar.getAttribute("aria-label")).toBe("Editar Água");
  expect(editar.textContent.trim()).toBe("");
  const excluir = document.querySelector('[data-action="excluir-produto"]');
  expect(excluir.getAttribute("aria-label")).toBe("Excluir Água");
  const menu = document.querySelector("#tabelaProdutos .dropdown-menu");
  expect(
    menu.querySelector('[data-action="ajuste-estoque"]').textContent,
  ).toContain("Ajustar estoque");
  const gatilho = document.querySelector('[data-bs-toggle="dropdown"]');
  expect(gatilho.getAttribute("aria-label")).toBe("Mais ações para Água");
  expect(JSON.parse(gatilho.dataset.bsConfig).popperConfig.strategy).toBe(
    "fixed",
  );
});

test("estoque mantém a fotografia esperada e o ID do produto no módulo correto", async () => {
  await produtos.carregarProdutos();
  ajusteEstoque.abrirAjusteEstoque(7);
  expect(painelAberto("painel-estoque")).toBe(true);
  document.getElementById("ajuste-estoque-bar").value = "6";
  document.getElementById("ajuste-estoque-motivo").value = "Reposição";
  await ajusteEstoque.confirmarAjusteEstoque();
  expect(request).toHaveBeenCalledWith(
    "POST",
    "/admin/produtos/7/estoque",
    expect.objectContaining({
      estoque_bar: 6,
      estoque_bar_esperado: 5,
      estoque_deposito_esperado: 10,
      motivo: "Reposição",
    }),
  );
});

test("membros: evento conserva UUID e atualização de nome", async () => {
  setupEventListeners();
  await membros.carregarMembros();
  document.querySelector('[data-action="editar-membro"]').click();
  document.getElementById("membro-nome").value = "Nome atualizado";
  enviarPainel("painel-membro");
  await settleEvents();
  expect(request).toHaveBeenCalledWith("PUT", "/admin/membros/member-uuid", {
    nome: "Nome atualizado",
  });
});

test("extrato administrativo mantém membro ao filtrar, limpar e mostrar período vazio", async () => {
  const partial = readFileSync(
    "templates/shared/extrato-membro.html",
    "utf8",
  ).replace(/\{#[\s\S]*?#\}/g, "");
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div id="modalExtrato" class="d-none"><h2 id="extrato-titulo">Extrato de saldo devedor</h2><p id="extrato-membro-nome"></p><div id="extrato-body">${partial}</div></div>`,
  );
  request.mockResolvedValue({
    total: 350,
    itens: [],
    resumo: {
      total_periodo: 0,
      total_pago_periodo: 0,
      total_aberto_periodo: 0,
    },
    paginacao: { total: 0, tem_mais: false },
  });
  await membros.verExtrato("membro-a", "Ana");
  const form = document.querySelector("#extrato-body form");
  form.elements.modo.value = "datas";
  form.elements.inicio.value = "2026-02-01";
  form.elements.fim.value = "2026-02-28";
  form.dispatchEvent(new Event("submit", { cancelable: true }));
  await settleEvents();
  expect(request).toHaveBeenLastCalledWith(
    "GET",
    "/admin/membros/membro-a/extrato?data_inicio=2026-02-01&data_fim=2026-02-28&limite=20&offset=0",
    undefined,
  );
  expect(document.getElementById("extrato-membro-nome").textContent).toBe(
    "Ana",
  );
  expect(document.getElementById("extrato-body").textContent).toContain(
    "Nenhum lançamento encontrado para o período selecionado.",
  );
  expect(document.querySelector("[data-total-atual]").textContent).toBe(
    reais("350,00"),
  );
  document.querySelector("[data-limpar]").click();
  await settleEvents();
  expect(request).toHaveBeenLastCalledWith(
    "GET",
    "/admin/membros/membro-a/extrato?limite=20&offset=0",
    undefined,
  );
});

test("usuários: evento conserva UUID e booleano de ativação", async () => {
  setupEventListeners();
  await usuarios.carregarUsuarios();
  document.querySelector('[data-action="excluir-usuario"]').click();
  await settleEvents();
  expect(request).toHaveBeenCalledWith(
    "DELETE",
    "/admin/usuarios/user-uuid",
    undefined,
  );
});

test("navegação reutiliza dados de membros já carregados", async () => {
  await membros.carregarMembros();
  request.mockClear();
  switchTab("membros");
  expect(
    document.getElementById("tab-membros").classList.contains("active"),
  ).toBe(true);
  expect(request).not.toHaveBeenCalled();
});

test("vendas mantém filtros e configurações mantém booleanos", async () => {
  document.getElementById("vendas-data-inicio").value = "2026-09-01";
  await vendas.carregarVendas();
  expect(request).toHaveBeenCalledWith(
    "GET",
    "/admin/vendas?data_inicio=2026-09-01&limite=200",
    undefined,
  );
  await configuracoes.carregarConfig();
  expect(document.getElementById("cfg-largura").value).toBe("ticket-58mm");
  document.getElementById("cfg-imprimir").value = "false";
  await configuracoes.salvarConfig();
  expect(request).toHaveBeenCalledWith("PUT", "/admin/config", {
    imprimir_automatico: false,
    largura_impressao: "ticket-58mm",
  });
});

test("adapter compartilhado mantém tratamento de erro do painel", async () => {
  request.mockRejectedValueOnce(new Error("Não autorizado"));
  expect(await requisitar("GET", "/admin/usuarios")).toBeNull();
  expect(document.getElementById("toast").textContent).toBe("Não autorizado");
});

test("painel fecha direto sem alterações e pede confirmação para descartar", async () => {
  setupEventListeners();
  await produtos.carregarProdutos();
  const cancelar = () =>
    document
      .querySelector(
        '#painel-produto .modal-rodape [data-bs-dismiss="offcanvas"]',
      )
      .click();
  produtoForm.abrirEdicaoProduto(7);
  cancelar();
  expect(confirm).not.toHaveBeenCalled();
  expect(painelAberto("painel-produto")).toBe(false);

  produtoForm.abrirEdicaoProduto(7);
  document.getElementById("produto-nome").value = "Alteração descartada";
  confirm.mockImplementationOnce(() => {}); // o admin escolhe continuar editando
  cancelar();
  expect(confirm).toHaveBeenCalledTimes(1);
  expect(painelAberto("painel-produto")).toBe(true);
  cancelar(); // agora aceita descartar
  expect(painelAberto("painel-produto")).toBe(false);
  expect(request.mock.calls.every(([method]) => method === "GET")).toBe(true);
});

test("usuário: cadastro exige senha e edição mantém a atual quando vazia", async () => {
  setupEventListeners();
  await usuarios.carregarUsuarios();
  usuarioForm.abrirNovoUsuario();
  document.getElementById("usuario-nome").value = "Novo";
  document.getElementById("usuario-email").value = "novo@example.test";
  await usuarioForm.salvarUsuario();
  expect(document.getElementById("toast").textContent).toBe(
    "Informe a senha inicial.",
  );
  expect(request).not.toHaveBeenCalledWith(
    "POST",
    "/admin/usuarios",
    expect.anything(),
  );

  document.querySelector('[data-action="editar-usuario"]').click();
  expect(document.getElementById("usuario-senha-rotulo").textContent).toBe(
    "Nova senha (opcional)",
  );
  enviarPainel("painel-usuario");
  await settleEvents();
  expect(request).toHaveBeenCalledWith("PUT", "/admin/usuarios/user-uuid", {
    nome: "Admin",
    email: "test@example.test",
    senha: "",
    perfil: "admin",
  });
});

test("CSV protege fórmulas, aspas, acentos e separadores", () => {
  const csv = criarCsv([
    {
      nome_cliente: "=SUM(A1)",
      usuario_nome: 'João; "Teste"\nLinha',
      valor_total: 12.5,
      itens: [],
    },
  ]);
  expect(csv.startsWith("\uFEFF")).toBe(true);
  expect(csv).toContain('"\'=SUM(A1)"');
  expect(csv).toContain('"João; ""Teste""\nLinha"');
  expect(csv).toContain('"12,50"');
});

test("exportação percorre todas as páginas e mantém filtros", async () => {
  document.getElementById("vendas-data-inicio").value = "2026-09-01";
  document.getElementById("vendas-data-fim").value = "2026-09-30";
  request.mockResolvedValueOnce({
    vendas: [{ id: "1", valor_total: 10 }],
    paginacao: { tem_mais: true },
  });
  request.mockResolvedValueOnce({
    vendas: [{ id: "2", valor_total: 20 }],
    paginacao: { tem_mais: false },
  });
  URL.createObjectURL = jest.fn(() => "blob:test");
  URL.revokeObjectURL = jest.fn();
  const clique = jest
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {});
  await vendas.exportarVendasCsv();
  expect(request).toHaveBeenCalledWith(
    "GET",
    expect.stringContaining(
      "data_inicio=2026-09-01&data_fim=2026-09-30&limite=500&offset=1",
    ),
    undefined,
  );
  expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  expect(clique).toHaveBeenCalledTimes(1);
  expect(document.getElementById("btn-exportar-vendas").disabled).toBe(false);
  clique.mockRestore();
});

test("falha na segunda página não baixa um CSV parcial", async () => {
  request.mockResolvedValueOnce({
    vendas: [{ id: "1", valor_total: 10 }],
    paginacao: { tem_mais: true },
  });
  request.mockRejectedValueOnce(new Error("Sem conexão"));
  URL.createObjectURL = jest.fn();
  await vendas.exportarVendasCsv();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(document.getElementById("btn-exportar-vendas").disabled).toBe(false);
});

test("esqueleto de carregamento ocupa todas as colunas do cabeçalho", () => {
  document.body.insertAdjacentHTML(
    "beforeend",
    `<table><thead><tr>${"<th></th>".repeat(8)}</tr></thead><tbody id="tabela-esqueleto"></tbody></table>`,
  );
  mostrarEsqueleto("tabela-esqueleto");
  const linhas = document.querySelectorAll("#tabela-esqueleto tr");
  expect(linhas.length).toBeGreaterThan(0);
  for (const linha of linhas) expect(linha.children.length).toBe(8);
});
