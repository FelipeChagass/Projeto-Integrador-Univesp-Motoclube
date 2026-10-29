/**
 * Catálogo do painel: cache local dos produtos, tabela (linhas só de leitura) e as ações de
 * linha que não precisam de formulário (excluir, reativar). Cadastro e edição ficam em
 * produto-form.js; ajuste de estoque em ajuste-estoque.js; combos em combos.js.
 */
import { UIModal } from "../../shared/modals.js";
import { BASE, authFetch } from "./requests.js";
import { esc, toast, CLASSES_TABELA as T, badgeStatus } from "./ui.js";
import { htmlAcoes, ACAO } from "./acoes-linha.js";
import { temCategoriaCombo, descricaoCombo } from "../../shared/combos.js";
import { formatCurrency } from "../../shared/utils.js";

let produtos = [];
let todosProdutos = [];

const NOME_CATEGORIA = { bebida: "Bebida", comida: "Comida", outro: "Outro" };

/** Cadastro completo, inclusive desativados: formulários e combos precisam ver todos. */
export function produtosCarregados() {
  return todosProdutos;
}

export function buscarProduto(id) {
  return todosProdutos.find((produto) => produto.id === id);
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
    linhaProduto.innerHTML = temCategoriaCombo(produto)
      ? htmlLinhaCombo(produto)
      : htmlLinhaProduto(produto);
    corpoTabela.appendChild(linhaProduto);
  });
}

function htmlCelulaImagem(produto) {
  const imagem = produto.url_imagem
    ? `<img src="${esc(produto.url_imagem)}" class="img-thumb mx-md-auto" alt="">`
    : `<span class="img-placeholder d-flex align-items-center justify-content-center mx-md-auto" aria-hidden="true">—</span>`;
  return `<td class="${T.celulaImagem}" data-label="Img">${imagem}</td>`;
}

function htmlCelulasComuns(produto) {
  return `
            ${htmlCelulaImagem(produto)}
            <td class="${T.celula} fw-semibold" data-label="Nome">${esc(produto.nome)}</td>
            <td class="${T.celula}" data-label="Preço">${formatCurrency(Number(produto.preco_atual) || 0)}</td>`;
}

function htmlLinhaProduto(produto) {
  const registro = { id: produto.id, nome: produto.nome };
  return `
            ${htmlCelulasComuns(produto)}
            <td class="${T.celula}" data-label="Categ.">${NOME_CATEGORIA[produto.categoria] || esc(produto.categoria)}</td>
            <td class="${T.celula} small" data-label="Estoque"><div>Bar: <b>${produto.estoque_bar}</b><br>Dep: <b>${produto.estoque_deposito}</b></div></td>
            <td class="${T.celula} small" data-label="Mínimos"><div>Mín Bar: <b>${produto.estoque_min_bar}</b><br>Mín Dep: <b>${produto.estoque_min_deposito}</b></div></td>
            <td class="${T.celulaStatus}" data-label="Status">${badgeStatus(produto.ativo)}</td>
            <td class="${T.celulaAcoes}">${htmlAcoes(registro, {
              editar: ACAO.editar("editar-produto"),
              excluir: ACAO.excluir("excluir-produto"),
              mais: [
                {
                  acao: "ajuste-estoque",
                  rotulo: "Ajustar estoque",
                  icone: "bi-boxes",
                },
                ...(produto.ativo ? [] : [ACAO.reativar("reativar-produto")]),
              ],
            })}</td>`;
}

/** Combo: categoria fixa, estoque derivado dos itens e desativação pelo admin. */
function htmlLinhaCombo(combo) {
  const registro = { id: combo.id, nome: combo.nome };
  const itensInativos = (combo.itens_combo || []).filter(
    (itemCombo) => !itemCombo.ativo,
  );
  const alertaHtml = itensInativos.length
    ? `<div class="td-combo-alerta mt-1">Item desativado: ${esc(itensInativos.map((itemCombo) => itemCombo.nome).join(", "))}</div>`
    : "";
  return `
            ${htmlCelulasComuns(combo)}
            <td class="${T.celula} align-items-md-center" data-label="Categ."><span class="badge rounded-pill text-uppercase badge-combo">Combo</span>
                <div class="td-combo-itens mt-1">${esc(descricaoCombo(combo.itens_combo))}</div>${alertaHtml}</td>
            <td class="${T.celula} small" data-label="Estoque"><div>Monta no bar: <b>${combo.estoque_bar}</b><br>Depósito cobre: <b>${combo.estoque_deposito}</b></div></td>
            <td class="${T.celula} small" data-label="Mínimos"><div>Pelos itens</div></td>
            <td class="${T.celulaStatus}" data-label="Status">${badgeStatus(combo.ativo)}</td>
            <td class="${T.celulaAcoes}">${htmlAcoes(registro, {
              editar: ACAO.editar("editar-produto"),
              excluir: ACAO.excluir("excluir-produto"),
              mais: [
                {
                  acao: "editar-combo",
                  rotulo: "Itens do combo",
                  icone: "bi-list-ul",
                },
                combo.ativo
                  ? {
                      acao: "desativar-combo",
                      rotulo: "Desativar",
                      icone: "bi-slash-circle",
                    }
                  : ACAO.reativar("reativar-produto"),
              ],
            })}</td>`;
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
