/**
 * Cadastro e edição de combos no painel. Um combo reúne 2 ou mais unidades de
 * produtos já cadastrados; o resumo mostra a economia e quantos o bar monta.
 * Desativar é decisão do admin: o combo sem itens no bar continua ativo, só esgotado.
 * O formulário abre no painel lateral "painel-combo" (templates/admin/paineis/produtos.html).
 */
import { UIModal } from "../../shared/modals.js";
import {
  temCategoriaCombo,
  disponivelNoBar,
  precoAvulso,
} from "../../shared/combos.js";
import { formatCurrency } from "../../shared/utils.js";
import { BASE, authFetch } from "./requests.js";
import { esc, toast, avisarCampo } from "./ui.js";
import { abrirPainel, fecharPainel } from "./painel.js";
import { carregarProdutos, produtosCarregados } from "./produtos.js";

const PAINEL = "painel-combo";
let comboEmEdicao = null;

const lista = () => document.getElementById("combo-itens-lista");

function produtosElegiveis(idSelecionado) {
  // Inativo só aparece se já estava no combo, para o admin ver e trocar.
  return produtosCarregados().filter(
    (produto) =>
      !temCategoriaCombo(produto) &&
      (produto.ativo || produto.id == idSelecionado),
  );
}

function adicionarLinhaItem(produtoId = "", quantidade = 1) {
  const linhaItem = document.createElement("div");
  linhaItem.className = "combo-item-linha d-flex align-items-center gap-2";
  const opcoes = produtosElegiveis(produtoId)
    .map(
      (produto) =>
        `<option value="${produto.id}" ${produto.id == produtoId ? "selected" : ""}>${esc(produto.nome)} (bar: ${Number(produto.estoque_bar) || 0})${produto.ativo ? "" : " desativado"}</option>`,
    )
    .join("");
  linhaItem.innerHTML = `
        <select class="form-select py-2 combo-item-produto flex-grow-1" aria-label="Produto do combo">
            <option value="">Escolha um produto</option>${opcoes}
        </select>
        <input type="number" class="form-control py-2 combo-item-qtd flex-shrink-0" min="1" max="100" step="1" inputmode="numeric"
            value="${Number(quantidade) || 1}" aria-label="Quantidade por combo">
        <button type="button" class="btn btn-escuro combo-item-remover d-flex align-items-center justify-content-center flex-shrink-0 p-0" aria-label="Remover item" title="Remover item">
            <i class="bi bi-x-lg" aria-hidden="true"></i>
        </button>`;
  lista().appendChild(linhaItem);
  return linhaItem;
}

/** Itens preenchidos; linhas sem produto são ignoradas, repetidos são somados. */
export function itensDoFormulario() {
  const porProduto = new Map();
  lista()
    .querySelectorAll(".combo-item-linha")
    .forEach((linhaItem) => {
      const produtoId = parseInt(
        linhaItem.querySelector(".combo-item-produto").value,
        10,
      );
      const quantidade = parseInt(
        linhaItem.querySelector(".combo-item-qtd").value,
        10,
      );
      if (!produtoId || !(quantidade > 0)) return;
      porProduto.set(produtoId, (porProduto.get(produtoId) || 0) + quantidade);
    });
  return [...porProduto].map(([produto_id, quantidade]) => ({
    produto_id,
    quantidade,
  }));
}

export function atualizarResumoCombo() {
  const resumo = document.getElementById("combo-resumo");
  const itens = itensDoFormulario();
  const unidades = itens.reduce((total, item) => total + item.quantidade, 0);
  if (unidades < 2) {
    resumo.innerHTML = `<p class="combo-resumo-aviso m-0">Inclua 2 ou mais itens para formar o combo.</p>`;
    return;
  }
  const produtos = produtosCarregados();
  const avulso = precoAvulso(itens, produtos);
  const precoCampo = document.getElementById("combo-preco");
  const preco = comboEmEdicao
    ? Number(comboEmEdicao.preco_atual)
    : parseFloat(precoCampo.value) || 0;
  const monta = disponivelNoBar(
    { categoria: "combo", itens_combo: itens },
    produtos,
  );
  const economia = avulso - preco;
  const economiaHtml =
    preco > 0 && economia > 0
      ? `<span>Cliente economiza <b>${formatCurrency(economia)}</b> (${Math.round((economia / avulso) * 100)}%)</span>`
      : preco > 0
        ? `<span class="combo-resumo-aviso">Preço igual ou acima dos itens avulsos</span>`
        : "";
  resumo.innerHTML = `
        <span>Itens avulsos somam <b>${formatCurrency(avulso)}</b></span>
        ${economiaHtml}
        <span>O bar monta <b>${monta}</b> ${monta === 1 ? "combo" : "combos"} agora</span>`;
}

/** Novo combo (nome, preço e itens) ou só os itens de um combo existente. */
function abrirFormulario(combo) {
  comboEmEdicao = combo;
  const formulario = document.getElementById(PAINEL);
  formulario.querySelectorAll("[data-combo-basico]").forEach((campo) => {
    campo.classList.toggle("d-none", Boolean(combo));
  });
  document.getElementById("combo-nome").value = "";
  document.getElementById("combo-preco").value = "";
  lista().innerHTML = "";
  const itens = combo ? combo.itens_combo || [] : [];
  if (itens.length)
    itens.forEach((item) =>
      adicionarLinhaItem(item.produto_id, item.quantidade),
    );
  else {
    adicionarLinhaItem();
    adicionarLinhaItem();
  }
  atualizarResumoCombo();
  abrirPainel(PAINEL, {
    titulo: combo ? "Itens do combo" : "Novo combo",
    complemento: combo?.nome || "",
    aoSalvar: salvarCombo,
  });
}

export function abrirFormNovoCombo() {
  abrirFormulario(null);
}

export function abrirEdicaoItensCombo(id) {
  const combo = produtosCarregados().find((produto) => produto.id === id);
  if (combo) abrirFormulario(combo);
}

export async function salvarCombo() {
  const itens = itensDoFormulario();
  if (itens.reduce((total, item) => total + item.quantidade, 0) < 2)
    return toast("O combo precisa reunir 2 ou mais itens.", false);
  let resposta;
  if (comboEmEdicao) {
    resposta = await authFetch(
      `${BASE}/api/admin/combos/${comboEmEdicao.id}/itens`,
      { method: "PUT", body: JSON.stringify({ itens }) },
    );
  } else {
    const nome = document.getElementById("combo-nome").value.trim();
    const preco_atual =
      parseFloat(document.getElementById("combo-preco").value) || 0;
    if (!nome) return avisarCampo("combo-nome", "Dê um nome ao combo.");
    if (preco_atual <= 0)
      return avisarCampo(
        "combo-preco",
        "O preço do combo deve ser maior que zero.",
      );
    resposta = await authFetch(`${BASE}/api/admin/combos`, {
      method: "POST",
      body: JSON.stringify({ nome, preco_atual, itens }),
    });
  }
  if (!resposta) return;
  const dadosResposta = await resposta.json();
  if (dadosResposta.status !== "ok")
    return toast(dadosResposta.mensagem || "Combo não salvo.", false);
  toast(comboEmEdicao ? "Itens do combo salvos." : "Combo criado.", true);
  fecharPainel(PAINEL);
  carregarProdutos();
}

export function desativarCombo(id, nome) {
  UIModal.confirm(
    `Desativar o combo "${nome}"? Ele sai do PDV; as vendas já feitas continuam registradas.`,
    async () => {
      const resposta = await authFetch(`${BASE}/api/admin/produtos/${id}`, {
        method: "PUT",
        body: JSON.stringify({ ativo: false }),
      });
      if (!resposta) return;
      const dadosResposta = await resposta.json();
      if (dadosResposta.status !== "ok")
        return toast(dadosResposta.mensagem || "Combo não desativado.", false);
      toast("Combo desativado.", true);
      carregarProdutos();
    },
  );
}

export function configurarFormCombo() {
  document
    .getElementById("btn-add-combo")
    ?.addEventListener("click", abrirFormNovoCombo);
  document
    .getElementById("combo-preco")
    ?.addEventListener("input", atualizarResumoCombo);
  document
    .getElementById("btn-add-item-combo")
    ?.addEventListener("click", () => {
      adicionarLinhaItem().querySelector("select").focus();
      atualizarResumoCombo();
    });
  const listaItens = lista();
  listaItens?.addEventListener("input", atualizarResumoCombo);
  listaItens?.addEventListener("change", atualizarResumoCombo);
  listaItens?.addEventListener("click", (evento) => {
    const botaoRemover = evento.target.closest(".combo-item-remover");
    if (!botaoRemover) return;
    botaoRemover.closest(".combo-item-linha").remove();
    atualizarResumoCombo();
    document.getElementById("btn-add-item-combo").focus();
  });
}
