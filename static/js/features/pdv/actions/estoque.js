/**
 * Modo de estoque e envio de ajustes com valores esperados ao backend.
 * A senha é validada no backend e permanece apenas em memória enquanto o modo está ativo.
 */
import { API } from "../../../shared/api.js";
import { UIModal } from "../../../shared/modals.js";
import { estadoPdv, salvarDadosLocais } from "../state.js";
import {
  showToast,
  fecharModal,
  renderizarCatalogo,
  sincronizarTextoModoEstoque,
} from "../ui.js";
import { mensagemErro } from "../../../shared/utils.js";

/* ─── Stock Management ─── */

/** Moldura vermelha na página e no cabeçalho enquanto o modo estoque está ativo (utilities). */
function marcarModoEstoque(ativo) {
  for (const classe of ["border", "border-3", "border-primary"])
    document.body.classList.toggle(classe, ativo);
  const cabecalho = document.getElementById("app-header");
  for (const classe of ["border-bottom", "border-3", "border-primary"])
    cabecalho?.classList.toggle(classe, ativo);
}

export function alternarModoEstoque() {
  if (estadoPdv.modoGerenciaEstoque) {
    estadoPdv.modoGerenciaEstoque = false;
    estadoPdv.senhaEstoque = null;
    const botaoEstoque = document.getElementById("btn-estoque");
    const secaoCarrinho = document.getElementById("carrinho-section");
    if (botaoEstoque) botaoEstoque.classList.remove("active");
    if (secaoCarrinho) secaoCarrinho.classList.remove("minimizado");
    marcarModoEstoque(false);
    sincronizarTextoModoEstoque();
    showToast("MODO ESTOQUE DESATIVADO");
    renderizarCatalogo();
    return;
  }
  if (estadoPdv.usuarioAtual?.perfil === "admin") {
    estadoPdv.senhaEstoque = null;
    ativarModoEstoque();
    return;
  }
  UIModal.prompt("Digite a senha para gerenciar o estoque:", async (senha) => {
    if (!senha) return showToast("Digite a senha do estoque.", "err");
    try {
      await API.verificarSenhaEstoque(senha);
      estadoPdv.senhaEstoque = senha;
      ativarModoEstoque();
    } catch (erroValidacaoSenha) {
      showToast(
        mensagemErro(erroValidacaoSenha, "Senha do estoque incorreta."),
        "err",
      );
    }
  });
}

function ativarModoEstoque() {
  estadoPdv.modoGerenciaEstoque = true;
  const botaoEstoque = document.getElementById("btn-estoque");
  const secaoCarrinho = document.getElementById("carrinho-section");
  if (botaoEstoque) botaoEstoque.classList.add("active");
  if (secaoCarrinho) secaoCarrinho.classList.add("minimizado");
  marcarModoEstoque(true);
  sincronizarTextoModoEstoque();
  showToast("MODO ESTOQUE ATIVADO");
  renderizarCatalogo();
}

export async function salvarEdicaoEstoque() {
  const novoEstoqueBar = Number(document.getElementById("edit-est-bar").value);
  let novoEstoqueDeposito = Number(
    document.getElementById("edit-est-dep").value,
  );
  const novoEstoqueMinimoBar = document.getElementById("edit-min-bar").value;
  const novoEstoqueMinimoDeposito =
    document.getElementById("edit-min-dep").value;
  if (novoEstoqueBar < 0 || novoEstoqueDeposito < 0)
    return showToast("Erro: Não é permitido valores negativos.");
  const diferencaEstoqueBar = novoEstoqueBar - estadoPdv.estoqueOriginalBar;
  if (diferencaEstoqueBar > 0) {
    if (novoEstoqueDeposito - diferencaEstoqueBar < 0)
      return showToast("OPERAÇÃO NEGADA: Depósito insuficiente.");
    novoEstoqueDeposito -= diferencaEstoqueBar;
  }
  try {
    await API.salvarDadosProduto(
      estadoPdv.produtoEdicao.id,
      novoEstoqueBar,
      novoEstoqueDeposito,
      Number(novoEstoqueMinimoBar),
      Number(novoEstoqueMinimoDeposito),
      estadoPdv.estoqueOriginalBar,
      Number(estadoPdv.produtoEdicao.estoque_deposito),
      estadoPdv.senhaEstoque,
    );
    estadoPdv.produtoEdicao.estoque_bar = novoEstoqueBar;
    estadoPdv.produtoEdicao.estoque_deposito = novoEstoqueDeposito;
    salvarDadosLocais();
    renderizarCatalogo();
    fecharModal("modal-estoque");
    showToast("Estoque atualizado.");
  } catch (erroAtualizacaoEstoque) {
    showToast(
      `Estoque não atualizado: ${mensagemErro(erroAtualizacaoEstoque)}`,
    );
  }
}
