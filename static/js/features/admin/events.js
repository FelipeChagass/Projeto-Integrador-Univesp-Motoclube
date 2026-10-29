/**
 * Liga IDs/data-actions dos templates aos handlers de cada recurso.
 * setupEventListeners deve ser chamado uma vez pela entrada admin.js após criar o DOM.
 * Cada tabela delega os cliques das ações de linha (acoes-linha.js) por data-action.
 */
import { fecharModalAdmin, configurarModaisAdmin } from "./ui.js";
import { switchTab } from "./navigation.js";
import {
  carregarProdutos,
  deletarProduto,
  reativarProduto,
} from "./produtos.js";
import {
  abrirNovoProduto,
  abrirEdicaoProduto,
  configurarFormProduto,
} from "./produto-form.js";
import { abrirAjusteEstoque } from "./ajuste-estoque.js";
import {
  carregarMembros,
  excluirMembro,
  reativarMembro,
  verExtrato,
} from "./membros.js";
import {
  abrirNovoMembro,
  abrirEdicaoMembro,
  abrirAjusteSaldo,
} from "./membro-form.js";
import { alternarUsuario, excluirUsuario } from "./usuarios.js";
import { abrirNovoUsuario, abrirEdicaoUsuario } from "./usuario-form.js";
import { carregarVendas, exportarVendasCsv } from "./vendas.js";
import { salvarConfig } from "./configuracoes.js";
import { configurarEdicaoFinanceira } from "./financeiro.js";
import {
  configurarFormCombo,
  abrirEdicaoItensCombo,
  desativarCombo,
} from "./combos.js";

/**
 * Delegação dos cliques de uma tabela: cada data-action vira uma chamada (id, nome).
 * Os itens do menu "Mais ações" também estão dentro da tabela e chegam aqui.
 */
function delegarAcoes(idTabela, handlers, converterId = (id) => id) {
  document.getElementById(idTabela)?.addEventListener("click", (evento) => {
    const botao = evento.target.closest("[data-action]");
    const handler = botao && handlers[botao.dataset.action];
    if (handler) handler(converterId(botao.dataset.id), botao.dataset.nome);
  });
}

const aoClicar = (id, handler) =>
  document.getElementById(id)?.addEventListener("click", handler);

export function setupEventListeners() {
  configurarModaisAdmin();
  configurarEdicaoFinanceira();
  configurarFormCombo();
  configurarFormProduto();
  // Abas do cabeçalho e do menu lateral; o offcanvas fecha sozinho (data-bs-dismiss).
  document.querySelectorAll("[data-admin-tab]").forEach((botaoAba) => {
    botaoAba.addEventListener("click", () =>
      switchTab(botaoAba.dataset.adminTab),
    );
  });

  document
    .getElementById("mostrarProdutosInativos")
    ?.addEventListener("change", carregarProdutos);
  document
    .getElementById("mostrarMembrosInativos")
    ?.addEventListener("change", carregarMembros);

  aoClicar("btn-add-produto", abrirNovoProduto);
  aoClicar("btn-add-membro", abrirNovoMembro);
  aoClicar("btn-add-usuario", abrirNovoUsuario);
  aoClicar("btn-filtrar-vendas", carregarVendas);
  aoClicar("btn-exportar-vendas", exportarVendasCsv);
  aoClicar("btn-save-config", salvarConfig);
  aoClicar("btn-close-modal-extrato", () => fecharModalAdmin("modalExtrato"));

  // Foto quebrada some da miniatura. "error" não borbulha: escuta na captura.
  document.getElementById("tabelaProdutos")?.addEventListener(
    "error",
    (evento) => {
      if (evento.target.matches?.("img.img-thumb"))
        evento.target.classList.add("d-none");
    },
    true,
  );

  delegarAcoes(
    "tabelaProdutos",
    {
      "editar-produto": abrirEdicaoProduto,
      "ajuste-estoque": abrirAjusteEstoque,
      "excluir-produto": deletarProduto,
      "reativar-produto": reativarProduto,
      "editar-combo": abrirEdicaoItensCombo,
      "desativar-combo": desativarCombo,
    },
    (id) => parseInt(id, 10),
  );

  delegarAcoes("tabelaMembros", {
    "editar-membro": abrirEdicaoMembro,
    "ver-extrato": verExtrato,
    "ajuste-saldo": abrirAjusteSaldo,
    "excluir-membro": excluirMembro,
    "reativar-membro": reativarMembro,
  });

  delegarAcoes("tabelaUsuarios", {
    "editar-usuario": abrirEdicaoUsuario,
    "reativar-usuario": (id) => alternarUsuario(id, true),
    "excluir-usuario": (id, nome) => excluirUsuario(id, nome || "usuário"),
  });
}
