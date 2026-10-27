/**
 * Liga IDs/data-actions dos templates aos handlers de cada recurso.
 * setupEventListeners deve ser chamado uma vez pela entrada admin.js após criar o DOM.
 */
import { fecharModalAdmin } from "./ui.js";
import { switchTab } from "./navigation.js";
import {
  carregarProdutos,
  abrirFormNovoProduto,
  fecharFormNovoProduto,
  previaNovoProdutoImagem,
  removerNovaPrevia,
  criarNovoProduto,
  deletarProduto,
  reativarProduto,
  salvarProduto,
  abrirAjusteEstoque,
  confirmarAjusteEstoque,
  abrirUpload,
  uploadImagem,
} from "./produtos.js";
import {
  carregarMembros,
  abrirFormNovoMembro,
  criarNovoMembro,
  salvarMembro,
  excluirMembro,
  reativarMembro,
  verExtrato,
  abrirAjusteSaldo,
  confirmarAjusteSaldo,
} from "./membros.js";
import {
  abrirFormNovoUsuario,
  fecharFormNovoUsuario,
  criarNovoUsuario,
  salvarUsuario,
  alternarUsuario,
  excluirUsuario,
} from "./usuarios.js";
import { carregarVendas, exportarVendasCsv } from "./vendas.js";
import { salvarConfig } from "./configuracoes.js";
import { configurarEdicaoFinanceira } from "./financeiro.js";
import {
  configurarFormCombo,
  abrirEdicaoItensCombo,
  desativarCombo,
} from "./combos.js";

export function setupEventListeners() {
  configurarEdicaoFinanceira();
  configurarFormCombo();
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

  document
    .getElementById("btn-add-produto")
    ?.addEventListener("click", abrirFormNovoProduto);
  document
    .getElementById("btn-close-form-produto")
    ?.addEventListener("click", fecharFormNovoProduto);
  document
    .getElementById("novo-upload-zone")
    ?.addEventListener("click", () =>
      document.getElementById("novo-file-input").click(),
    );
  document
    .getElementById("novo-file-input")
    ?.addEventListener("change", (evento) =>
      previaNovoProdutoImagem(evento.target),
    );
  document
    .getElementById("btn-remove-preview-produto")
    ?.addEventListener("click", removerNovaPrevia);
  document
    .getElementById("btn-save-novo-produto")
    ?.addEventListener("click", criarNovoProduto);
  document
    .getElementById("btn-cancel-novo-produto")
    ?.addEventListener("click", fecharFormNovoProduto);

  document
    .getElementById("btn-add-membro")
    ?.addEventListener("click", abrirFormNovoMembro);
  document
    .getElementById("btn-close-form-membro")
    ?.addEventListener("click", () =>
      document.getElementById("formNovoMembro").classList.add("d-none"),
    );
  document
    .getElementById("btn-save-novo-membro")
    ?.addEventListener("click", criarNovoMembro);
  document
    .getElementById("btn-cancel-novo-membro")
    ?.addEventListener("click", () =>
      document.getElementById("formNovoMembro").classList.add("d-none"),
    );

  document
    .getElementById("btn-add-usuario")
    ?.addEventListener("click", abrirFormNovoUsuario);
  document
    .getElementById("btn-close-form-usuario")
    ?.addEventListener("click", fecharFormNovoUsuario);
  document
    .getElementById("btn-save-novo-usuario")
    ?.addEventListener("click", criarNovoUsuario);
  document
    .getElementById("btn-cancel-novo-usuario")
    ?.addEventListener("click", fecharFormNovoUsuario);

  document
    .getElementById("btn-filtrar-vendas")
    ?.addEventListener("click", carregarVendas);
  document
    .getElementById("btn-exportar-vendas")
    ?.addEventListener("click", exportarVendasCsv);
  document
    .getElementById("btn-save-config")
    ?.addEventListener("click", salvarConfig);

  document
    .getElementById("btn-close-modal-extrato")
    ?.addEventListener("click", () => fecharModalAdmin("modalExtrato"));
  document
    .getElementById("btn-close-modal-ajuste")
    ?.addEventListener("click", () => fecharModalAdmin("modalAjuste"));
  document
    .getElementById("btn-cancel-modal-ajuste")
    ?.addEventListener("click", () => fecharModalAdmin("modalAjuste"));
  document
    .getElementById("btn-confirmar-ajuste-saldo")
    ?.addEventListener("click", confirmarAjusteSaldo);

  document
    .getElementById("btn-close-modal-estoque")
    ?.addEventListener("click", () => fecharModalAdmin("modalAjusteEstoque"));
  document
    .getElementById("btn-cancel-modal-estoque")
    ?.addEventListener("click", () => fecharModalAdmin("modalAjusteEstoque"));
  document
    .getElementById("btn-confirmar-ajuste-estoque")
    ?.addEventListener("click", confirmarAjusteEstoque);

  document
    .getElementById("fileInput")
    ?.addEventListener("change", (evento) => uploadImagem(evento.target));

  // Foto quebrada some da miniatura. "error" não borbulha: escuta na captura.
  document.getElementById("tabelaProdutos")?.addEventListener(
    "error",
    (evento) => {
      if (evento.target.matches?.("img.img-thumb"))
        evento.target.classList.add("d-none");
    },
    true,
  );

  document
    .getElementById("tabelaProdutos")
    ?.addEventListener("click", (evento) => {
      const botaoAcao = evento.target.closest("[data-action]");
      if (!botaoAcao) return;
      const acao = botaoAcao.dataset.action;
      const id = parseInt(botaoAcao.dataset.id);
      if (acao === "upload-img") abrirUpload(id);
      if (acao === "salvar-produto") salvarProduto(id);
      if (acao === "ajuste-estoque") abrirAjusteEstoque(id);
      if (acao === "excluir-produto")
        deletarProduto(id, botaoAcao.dataset.nome);
      if (acao === "reativar-produto") reativarProduto(id);
      if (acao === "editar-combo") abrirEdicaoItensCombo(id);
      if (acao === "desativar-combo")
        desativarCombo(id, botaoAcao.dataset.nome);
    });

  document
    .getElementById("tabelaMembros")
    ?.addEventListener("click", (evento) => {
      const botaoAcao = evento.target.closest("[data-action]");
      if (!botaoAcao) return;
      const acao = botaoAcao.dataset.action;
      const id = botaoAcao.dataset.id;
      if (acao === "salvar-membro") salvarMembro(id);
      if (acao === "ver-extrato") verExtrato(id, botaoAcao.dataset.nome);
      if (acao === "ajuste-saldo") abrirAjusteSaldo(id, botaoAcao.dataset.nome);
      if (acao === "excluir-membro") excluirMembro(id, botaoAcao.dataset.nome);
      if (acao === "reativar-membro") reativarMembro(id);
    });

  document
    .getElementById("tabelaUsuarios")
    ?.addEventListener("click", (evento) => {
      const botaoAcao = evento.target.closest("[data-action]");
      if (!botaoAcao) return;
      const acao = botaoAcao.dataset.action;
      const id = botaoAcao.dataset.id;
      if (acao === "salvar-usuario") salvarUsuario(id);
      if (acao === "toggle-usuario")
        alternarUsuario(id, botaoAcao.dataset.ativo === "true");
      if (acao === "excluir-usuario")
        excluirUsuario(id, botaoAcao.dataset.nome || "usuário");
    });
}
