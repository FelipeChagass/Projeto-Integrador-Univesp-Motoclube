import { prepararEdicao } from "./edicao-linha.js";
/**
 * Cadastro, imagens e ajustes de estoque do painel; mantém o cache local de produtos.
 * Usa requests/API e ui; ajustes enviam o estoque esperado para detectar concorrência.
 */
import { API } from "../../shared/api.js";
import { UIModal } from "../../shared/modals.js";
import { BASE, authFetch } from "./requests.js";
import {
  abrirModalAdmin,
  fecharModalAdmin,
  esc,
  toast,
  CLASSES_TABELA as T,
  badge,
  badgeStatus,
} from "./ui.js";
import { temCategoriaCombo, descricaoCombo } from "../../shared/combos.js";
import { mensagemErro } from "../../shared/utils.js";

let produtos = [];
let todosProdutos = [];
let produtoIdEnvioImagem = null;

/** Cadastro completo, inclusive desativados: o formulário de combo precisa ver todos. */
export function produtosCarregados() {
  return todosProdutos;
}

export async function carregarProdutos() {
  const resposta = await authFetch(`${BASE}/api/admin/produtos`);
  if (!resposta) return;
  const dadosResposta = await resposta.json();
  const incluirInativos = document.getElementById(
    "mostrarProdutosInativos",
  ).checked;
  todosProdutos = dadosResposta.produtos || [];
  produtos = todosProdutos.filter(
    (produto) => incluirInativos || produto.ativo,
  );
  renderizarProdutos();
}

export function renderizarProdutos() {
  const corpoTabela = document.getElementById("tabelaProdutos");
  corpoTabela.innerHTML = "";
  produtos.forEach((produto) => {
    const linhaProduto = document.createElement("tr");
    linhaProduto.className = T.linha;
    if (!produto.ativo) linhaProduto.classList.add("opacity-50");
    if (temCategoriaCombo(produto)) {
      linhaProduto.innerHTML = htmlLinhaCombo(produto);
      prepararEdicao(linhaProduto);
      corpoTabela.appendChild(linhaProduto);
      return;
    }
    linhaProduto.innerHTML = `
            ${htmlCelulaImagem(produto)}
            <td class="${T.celula}" data-label="Nome"><input class="${T.campo}" value="${esc(produto.nome)}" data-pid="${produto.id}" data-campo="nome" aria-label="Nome"></td>
            <td class="${T.celula}" data-label="Preço"><input class="${T.campoCurto}" type="number" step="0.01" value="${produto.preco_atual}" data-pid="${produto.id}" data-campo="preco_atual" aria-label="Preço"></td>
            <td class="${T.celula}" data-label="Categ."><select class="${T.selecao}" data-pid="${produto.id}" data-campo="categoria" aria-label="Categoria">
                <option value="bebida" ${produto.categoria === "bebida" ? "selected" : ""}>Bebida</option>
                <option value="comida" ${produto.categoria === "comida" ? "selected" : ""}>Comida</option>
                <option value="outro"  ${produto.categoria === "outro" ? "selected" : ""}>Outro</option>
            </select></td>
            <td class="${T.celula} small" data-label="Estoque"><div>Bar: <b>${produto.estoque_bar}</b><br>Dep: <b>${produto.estoque_deposito}</b></div></td>
            <td class="${T.celula} small" data-label="Mínimos"><div>Mín Bar: <b>${produto.estoque_min_bar}</b><br>Mín Dep: <b>${produto.estoque_min_deposito}</b></div></td>
            <td class="${T.celulaStatus}" data-label="Status">${badgeStatus(produto.ativo)}</td>
            <td class="${T.celulaAcoes}"><div class="${T.acoes}">
                <button class="btn btn-escuro flex-fill" data-action="salvar-produto" data-id="${produto.id}">Salvar</button>
                <button class="btn btn-escuro flex-fill" data-action="ajuste-estoque" data-id="${produto.id}">Estoque</button>
                <button class="btn btn-excluir flex-fill" data-action="excluir-produto" data-id="${produto.id}" data-nome="${esc(produto.nome)}">Excluir</button> ${!produto.ativo ? `<button class="btn btn-escuro flex-fill" data-action="reativar-produto" data-id="${produto.id}">Reativar</button>` : ""}
            </div></td>`;
    prepararEdicao(linhaProduto);
    corpoTabela.appendChild(linhaProduto);
  });
}

/** Foto (ou espaço para ela) e o botão de envio; no celular ocupa a largura do cartão. */
function htmlCelulaImagem(produto) {
  const imagem = produto.url_imagem
    ? `<img src="${esc(produto.url_imagem)}" class="img-thumb mx-md-auto" alt="">`
    : `<span class="img-placeholder d-flex align-items-center justify-content-center mx-md-auto" data-action="upload-img" data-id="${produto.id}">—</span>`;
  return `<td class="${T.celulaImagem}" data-label="Img">${imagem}
                <button class="btn btn-escuro btn-sm mx-3 my-2 mx-md-auto mt-md-1 mb-md-0 d-block" data-action="upload-img" data-id="${produto.id}">Foto</button></td>`;
}

/** Combo: categoria fixa, estoque derivado dos itens e desativação pelo admin. */
function htmlLinhaCombo(combo) {
  const itensInativos = (combo.itens_combo || []).filter(
    (itemCombo) => !itemCombo.ativo,
  );
  const alertaHtml = itensInativos.length
    ? `<div class="td-combo-alerta mt-1">Item desativado: ${esc(itensInativos.map((itemCombo) => itemCombo.nome).join(", "))}</div>`
    : "";
  return `
            ${htmlCelulaImagem(combo)}
            <td class="${T.celula}" data-label="Nome"><input class="${T.campo}" value="${esc(combo.nome)}" data-pid="${combo.id}" data-campo="nome" aria-label="Nome do combo"></td>
            <td class="${T.celula}" data-label="Preço"><input class="${T.campoCurto}" type="number" step="0.01" value="${combo.preco_atual}" data-pid="${combo.id}" data-campo="preco_atual" aria-label="Preço do combo"></td>
            <td class="${T.celula} align-items-md-center" data-label="Categ."><span class="badge rounded-pill text-uppercase badge-combo">Combo</span>
                <div class="td-combo-itens mt-1">${esc(descricaoCombo(combo.itens_combo))}</div>${alertaHtml}</td>
            <td class="${T.celula} small" data-label="Estoque"><div>Monta no bar: <b>${combo.estoque_bar}</b><br>Depósito cobre: <b>${combo.estoque_deposito}</b></div></td>
            <td class="${T.celula} small" data-label="Mínimos"><div>Pelos itens</div></td>
            <td class="${T.celulaStatus}" data-label="Status">${badgeStatus(combo.ativo)}</td>
            <td class="${T.celulaAcoes}"><div class="${T.acoes}">
                <button class="btn btn-escuro flex-fill" data-action="salvar-produto" data-id="${combo.id}">Salvar</button>
                <button class="btn btn-escuro flex-fill" data-action="editar-combo" data-id="${combo.id}">Itens</button>
                ${
                  combo.ativo
                    ? `<button class="btn btn-desativar flex-fill" data-action="desativar-combo" data-id="${combo.id}" data-nome="${esc(combo.nome)}">Desativar</button>`
                    : `<button class="btn btn-escuro flex-fill" data-action="reativar-produto" data-id="${combo.id}">Reativar</button>`
                }
                <button class="btn btn-excluir flex-fill" data-action="excluir-produto" data-id="${combo.id}" data-nome="${esc(combo.nome)}">Excluir</button>
            </div></td>`;
}

export function abrirFormNovoProduto() {
  abrirModalAdmin("formNovoProduto");
  document.getElementById("novo-nome").focus();
}
export function fecharFormNovoProduto() {
  fecharModalAdmin("formNovoProduto");
}

export function previaNovoProdutoImagem(campoArquivo) {
  if (!campoArquivo.files || !campoArquivo.files[0]) return;
  const leitorArquivo = new FileReader();
  leitorArquivo.onload = (eventoLeitura) => {
    document.getElementById("novo-img-tag").src = eventoLeitura.target.result;
    document
      .getElementById("novo-img-preview")
      .classList.replace("d-none", "d-flex");
    document.getElementById("novo-upload-zone").classList.add("d-none");
  };
  leitorArquivo.readAsDataURL(campoArquivo.files[0]);
}
export function removerNovaPrevia() {
  document
    .getElementById("novo-img-preview")
    .classList.replace("d-flex", "d-none");
  document.getElementById("novo-upload-zone").classList.remove("d-none");
  document.getElementById("novo-file-input").value = "";
}

export async function criarNovoProduto() {
  const nome = document.getElementById("novo-nome").value.trim();
  const preco = parseFloat(document.getElementById("novo-preco").value) || 0;
  const categoria = document.getElementById("novo-categoria").value;
  const campoArquivo = document.getElementById("novo-file-input");
  if (!nome) return toast("Nome é obrigatório", false);
  if (preco <= 0) return toast("Preço deve ser maior que zero", false);

  const resposta = await authFetch(`${BASE}/api/admin/produtos`, {
    method: "POST",
    body: JSON.stringify({ nome, preco_atual: preco, categoria }),
  });
  if (!resposta) return;
  const dadosResposta = await resposta.json();
  if (dadosResposta.status !== "ok")
    return toast(dadosResposta.mensagem || "Erro", false);
  toast("Produto criado!", true);
  if (campoArquivo.files && campoArquivo.files[0] && dadosResposta.produto)
    await uploadImagemParaProduto(
      dadosResposta.produto.id,
      campoArquivo.files[0],
    );
  fecharFormNovoProduto();
  carregarProdutos();
}

export async function deletarProduto(id, nome) {
  UIModal.confirm(`Excluir definitivamente "${nome}"?`, async function () {
    const resposta = await authFetch(`${BASE}/api/admin/produtos/${id}`, {
      method: "DELETE",
    });
    if (!resposta) return;
    const dadosResposta = await resposta.json();
    toast(dadosResposta.mensagem, dadosResposta.status === "ok");
    if (dadosResposta.status === "ok") carregarProdutos();
  });
}

export async function reativarProduto(id) {
  const resposta = await authFetch(`${BASE}/api/admin/produtos/${id}`, {
    method: "PUT",
    body: JSON.stringify({ ativo: true }),
  });
  if (!resposta) return;
  const dadosResposta = await resposta.json();
  toast(dadosResposta.mensagem, dadosResposta.status === "ok");
  if (dadosResposta.status === "ok") carregarProdutos();
}

export async function salvarProduto(id) {
  const dados = {};
  document.querySelectorAll(`[data-pid="${id}"]`).forEach((campoProduto) => {
    dados[campoProduto.dataset.campo] =
      campoProduto.type === "number"
        ? Number(campoProduto.value)
        : campoProduto.value;
  });
  const resposta = await authFetch(`${BASE}/api/admin/produtos/${id}`, {
    method: "PUT",
    body: JSON.stringify(dados),
  });
  if (!resposta) return;
  const dadosResposta = await resposta.json();
  toast(dadosResposta.mensagem, dadosResposta.status === "ok");
  if (dadosResposta.status === "ok") carregarProdutos();
}

let ajusteProdutoId = null;

export function abrirAjusteEstoque(id) {
  const produto = produtos.find(
    (produtoCadastrado) => produtoCadastrado.id === id,
  );
  if (!produto) return;
  ajusteProdutoId = id;
  document.getElementById("ajuste-estoque-nome").textContent = produto.nome;
  document.getElementById("ajuste-estoque-bar").value = produto.estoque_bar;
  document.getElementById("ajuste-estoque-deposito").value =
    produto.estoque_deposito;
  document.getElementById("ajuste-estoque-min-bar").value =
    produto.estoque_min_bar || 0;
  document.getElementById("ajuste-estoque-min-deposito").value =
    produto.estoque_min_deposito || 0;
  document.getElementById("ajuste-estoque-motivo").value = "";
  abrirModalAdmin("modalAjusteEstoque");
}

export async function confirmarAjusteEstoque() {
  const produtoOriginal = produtos.find(
    (produto) => produto.id === ajusteProdutoId,
  );
  const dados = {
    estoque_bar_esperado: produtoOriginal?.estoque_bar,
    estoque_deposito_esperado: produtoOriginal?.estoque_deposito,
    estoque_bar:
      parseInt(document.getElementById("ajuste-estoque-bar").value) || 0,
    estoque_deposito:
      parseInt(document.getElementById("ajuste-estoque-deposito").value) || 0,
    estoque_min_bar:
      parseInt(document.getElementById("ajuste-estoque-min-bar").value) || 0,
    estoque_min_deposito:
      parseInt(document.getElementById("ajuste-estoque-min-deposito").value) ||
      0,
    motivo: document.getElementById("ajuste-estoque-motivo").value.trim(),
  };
  if (!dados.motivo) return toast("O motivo do ajuste é obrigatório.", false);

  const resposta = await authFetch(
    `${BASE}/api/admin/produtos/${ajusteProdutoId}/estoque`,
    { method: "POST", body: JSON.stringify(dados) },
  );
  if (!resposta) return;
  const dadosResposta = await resposta.json();
  toast(dadosResposta.mensagem, dadosResposta.status === "ok");
  if (dadosResposta.status === "ok") {
    fecharModalAdmin("modalAjusteEstoque");
    carregarProdutos();
  }
}

export function abrirUpload(produtoId) {
  produtoIdEnvioImagem = produtoId;
  document.getElementById("fileInput").click();
}

export async function uploadImagem(campoArquivo) {
  if (!campoArquivo.files || !campoArquivo.files[0] || !produtoIdEnvioImagem)
    return;
  if (
    !(await uploadImagemParaProduto(
      produtoIdEnvioImagem,
      campoArquivo.files[0],
    ))
  )
    return;
  produtoIdEnvioImagem = null;
  toast("Imagem salva!", true);
  carregarProdutos();
}

export async function uploadImagemParaProduto(produtoId, arquivoImagem) {
  const dadosFormulario = new FormData();
  dadosFormulario.append("imagem", arquivoImagem);
  try {
    await API.request(
      "POST",
      `/admin/produtos/${produtoId}/imagem`,
      dadosFormulario,
    );
    return true;
  } catch (erro) {
    toast(mensagemErro(erro, "Não foi possível enviar a imagem."), false);
    return false;
  }
}
