/**
 * Painel de ajuste de estoque de um produto. Envia os valores que o admin viu ao abrir
 * (estoque esperado), para o backend recusar o ajuste se outra venda mexeu no estoque
 * nesse meio tempo. O motivo é obrigatório e fica na auditoria.
 */
import { requisitar } from "./requests.js";
import { toast, avisarCampo } from "./ui.js";
import { abrirPainel, fecharPainel } from "./painel.js";
import { buscarProduto, carregarProdutos } from "./produtos.js";

const PAINEL = "painel-estoque";
let produtoAjustado = null;

const valorInteiro = (id) =>
  parseInt(document.getElementById(id).value, 10) || 0;

export function abrirAjusteEstoque(id) {
  const produto = buscarProduto(id);
  if (!produto) return;
  produtoAjustado = produto;
  document.getElementById("ajuste-estoque-bar").value = produto.estoque_bar;
  document.getElementById("ajuste-estoque-deposito").value =
    produto.estoque_deposito;
  document.getElementById("ajuste-estoque-min-bar").value =
    produto.estoque_min_bar || 0;
  document.getElementById("ajuste-estoque-min-deposito").value =
    produto.estoque_min_deposito || 0;
  document.getElementById("ajuste-estoque-motivo").value = "";
  abrirPainel(PAINEL, {
    complemento: produto.nome,
    aoSalvar: confirmarAjusteEstoque,
  });
}

export async function confirmarAjusteEstoque() {
  if (!produtoAjustado) return;
  const dados = {
    estoque_bar_esperado: produtoAjustado.estoque_bar,
    estoque_deposito_esperado: produtoAjustado.estoque_deposito,
    estoque_bar: valorInteiro("ajuste-estoque-bar"),
    estoque_deposito: valorInteiro("ajuste-estoque-deposito"),
    estoque_min_bar: valorInteiro("ajuste-estoque-min-bar"),
    estoque_min_deposito: valorInteiro("ajuste-estoque-min-deposito"),
    motivo: document.getElementById("ajuste-estoque-motivo").value.trim(),
  };
  if (!dados.motivo)
    return avisarCampo(
      "ajuste-estoque-motivo",
      "O motivo do ajuste é obrigatório.",
    );

  const dadosResposta = await requisitar(
    "POST",
    `/admin/produtos/${produtoAjustado.id}/estoque`,
    dados,
  );
  if (!dadosResposta) return;
  toast(dadosResposta.mensagem, dadosResposta.status === "ok");
  if (dadosResposta.status === "ok") {
    fecharPainel(PAINEL);
    carregarProdutos();
  }
}
