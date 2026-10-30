/**
 * Catálogo do PDV: filtros por categoria e cartões de produto e combo. Consumido por ui.js,
 * que reexporta a API pública. O disponível no bar desconta o carrinho, por isso cada mudança
 * no carrinho chama atualizarCartoesCatalogo em vez de refazer a grade.
 */
import { estadoPdv } from "./state.js";
import { esc, sanitizeUrl, formatCurrency } from "../../shared/utils.js";
import {
  temCategoriaCombo,
  disponivelNoBar,
  precoAvulso,
  descricaoCombo,
} from "../../shared/combos.js";

/** Disponível no bar mostrado em cada cartão, por id de produto. */
const disponivelExibido = new Map();

/** Unidades que ainda podem entrar no carrinho; combos e avulsos dividem o estoque dos itens. */
export function obterDisponivelBar(produto) {
  return disponivelNoBar(produto, estadoPdv.produtos, estadoPdv.carrinho);
}

function htmlCartaoCombo(produto, disponivel, comboZerado) {
  const urlImagem = sanitizeUrl(produto.url_imagem);
  const itensCombo = produto.itens_combo || [];
  const precoCombo = Number(produto.preco_atual) || 0;
  const avulso = precoAvulso(itensCombo, estadoPdv.produtos);
  const composicaoHtml = itensCombo
    .map(
      (itemCombo) =>
        `<li><b>${Number(itemCombo.quantidade)}×</b> ${esc(itemCombo.nome)}</li>`,
    )
    .join("");
  const vitrineHtml = produto.url_imagem
    ? `<img src="${esc(urlImagem)}" alt="">`
    : `<ul class="combo-composicao d-flex flex-column justify-content-center gap-1 h-100 m-0 pt-4 px-2 pb-2 list-unstyled text-start">${composicaoHtml}</ul>`;
  const legendaHtml = produto.url_imagem
    ? `<div class="combo-itens mb-1">${esc(descricaoCombo(itensCombo))}</div>`
    : "";
  const avulsoHtml =
    avulso > precoCombo
      ? `<s class="combo-avulso d-block" aria-label="Preço dos itens avulsos">${formatCurrency(avulso)}</s>`
      : "";
  const zeradoHtml =
    comboZerado && !estadoPdv.modoGerenciaEstoque
      ? '<div class="overlay-esgotado-bar"><span class="icon-lock"></span>ITENS EM<br>FALTA</div>'
      : "";
  return `
            <div class="img-container combo-vitrine">
                <span class="combo-selo px-2 py-1">Combo</span>
                ${vitrineHtml}
                ${zeradoHtml}
            </div>
            <div class="card-info d-flex flex-column justify-content-between text-center">
                <div class="card-name">${esc(produto.nome)}</div>
                ${legendaHtml}
                <div class="card-price">${formatCurrency(precoCombo)} ${avulsoHtml}</div>
                <div class="card-stock combo-stock justify-content-center">
                    <span>Monta no bar: <b>${disponivel}</b></span>
                </div>
            </div>`;
}

function htmlAcionadorProduto(produto) {
  const rotulo = `${estadoPdv.modoGerenciaEstoque ? "Editar" : "Adicionar"} ${produto.nome}`;
  return `<button type="button" class="pdv-produto-acionador stretched-link border-0 p-0 bg-transparent" aria-label="${esc(rotulo)}"><span class="visually-hidden">${esc(rotulo)}</span></button>`;
}

export function selecionarCategoria(categoria) {
  if (!["todos", "bebida", "comida", "combo", "outro"].includes(categoria))
    return;
  estadoPdv.categoriaCatalogo = categoria;
  renderizarCatalogo();
}

function criarCartaoProduto(produto) {
  const estoqueBarDisponivel = obterDisponivelBar(produto);
  disponivelExibido.set(String(produto.id), estoqueBarDisponivel);
  if (temCategoriaCombo(produto)) {
    const cartaoCombo = document.createElement("div");
    cartaoCombo.className = "card pdv-produto-card card-combo";
    cartaoCombo.dataset.produtoId = produto.id;
    cartaoCombo.dataset.barZerado = estoqueBarDisponivel <= 0;
    cartaoCombo.innerHTML =
      htmlCartaoCombo(
        produto,
        estoqueBarDisponivel,
        estoqueBarDisponivel <= 0,
      ) + htmlAcionadorProduto(produto);
    // Foto quebrada: o combo volta a mostrar só o selo e a legenda.
    cartaoCombo
      .querySelector("img")
      ?.addEventListener("error", (evento) => evento.target.remove(), {
        once: true,
      });
    return cartaoCombo;
  }
  const estoqueDeposito = Number(produto.estoque_deposito) || 0;
  const estoqueMinimoBar = Number(produto.estoque_min_bar) || 0;
  const estoqueMinimoDeposito = Number(produto.estoque_min_deposito) || 0;
  const estoqueBarZerado = estoqueBarDisponivel <= 0;
  const estoqueDepositoZerado = estoqueDeposito <= 0;
  const estoqueBaixo =
    !estoqueBarZerado &&
    (estoqueBarDisponivel <= estoqueMinimoBar ||
      estoqueDeposito <= estoqueMinimoDeposito);
  const cartaoProduto = document.createElement("div");
  cartaoProduto.className = `card pdv-produto-card${estoqueBaixo ? " card-alerta" : ""}`;
  cartaoProduto.dataset.produtoId = produto.id;
  cartaoProduto.dataset.barZerado = estoqueBarZerado;
  const urlImagem = sanitizeUrl(produto.url_imagem);
  const alertaHtml = estoqueBaixo
    ? '<div class="badge-alerta">ESTOQUE BAIXO</div>'
    : "";
  const edicaoHtml = estadoPdv.modoGerenciaEstoque
    ? '<div class="badge-edit">EDITAR</div>'
    : "";
  const depositoZeradoHtml = estoqueDepositoZerado
    ? '<div class="faixa-sem-geral">SEM ESTOQUE GERAL</div>'
    : "";
  const barZeradoHtml =
    estoqueBarZerado && !estadoPdv.modoGerenciaEstoque
      ? '<div class="overlay-esgotado-bar"><span class="icon-lock"></span>ACABOU<br>NO BAR</div>'
      : "";
  const precoAtual = Number(produto.preco_atual) || 0;
  cartaoProduto.innerHTML = `
          <div class="img-container">
              ${alertaHtml}${edicaoHtml}
              <img src="${esc(urlImagem)}" alt="">
              ${depositoZeradoHtml}${barZeradoHtml}
          </div>
          <div class="card-info d-flex flex-column justify-content-between text-center">
              <div class="card-name">${esc(produto.nome)}</div>
              <div class="card-price">${formatCurrency(precoAtual)}</div>
              <div class="card-stock">
                  <span>Bar: <b>${estoqueBarDisponivel}</b></span>
                  <span>Dep: <b>${estoqueDeposito}</b></span>
              </div>
          </div>`;
  cartaoProduto.insertAdjacentHTML("beforeend", htmlAcionadorProduto(produto));
  // once: se o próprio substituto falhar, não entra em laço.
  cartaoProduto.querySelector("img").addEventListener(
    "error",
    (evento) => {
      evento.target.src = "https://placehold.co/150x150/333/FFF?text=Erro";
    },
    { once: true },
  );
  return cartaoProduto;
}

export function renderizarCatalogo() {
  const gradeProdutos = document.getElementById("grid-produtos");
  gradeProdutos.innerHTML = "";
  disponivelExibido.clear();
  document
    .querySelectorAll("#filtro-catalogo [data-categoria]")
    .forEach((botaoCategoria) => {
      const categoriaSelecionada =
        botaoCategoria.dataset.categoria === estadoPdv.categoriaCatalogo;
      botaoCategoria.classList.toggle("active", categoriaSelecionada);
      botaoCategoria.setAttribute("aria-pressed", String(categoriaSelecionada));
    });
  if (
    !estadoPdv.produtos ||
    !Array.isArray(estadoPdv.produtos) ||
    estadoPdv.produtos.length === 0
  ) {
    gradeProdutos.innerHTML = `
            <div class="catalogo-vazio">
                <h3 class="m-0">Nenhum produto encontrado.</h3>
                <p class="m-0">Cadastre itens no banco de dados ou verifique a conexão.</p>
            </div>`;
    return;
  }
  const produtosFiltrados = estadoPdv.produtos.filter((produto) => {
    const categoria = String(produto.categoria || "")
      .trim()
      .toLowerCase();
    if (estadoPdv.categoriaCatalogo === "todos") return true;
    if (estadoPdv.categoriaCatalogo === "outro")
      return !["bebida", "comida", "combo"].includes(categoria);
    return categoria === estadoPdv.categoriaCatalogo;
  });
  if (!produtosFiltrados.length) {
    gradeProdutos.innerHTML =
      '<p class="catalogo-vazio m-0">Nenhum produto nesta categoria.</p>';
    return;
  }
  const fragmentoProdutos = document.createDocumentFragment();
  produtosFiltrados.forEach((produto) =>
    fragmentoProdutos.appendChild(criarCartaoProduto(produto)),
  );
  gradeProdutos.appendChild(fragmentoProdutos);
}

/**
 * Depois de mudar o carrinho, refaz só os cartões cujo disponível no bar mudou (o item e os
 * combos que dividem estoque com ele), sem recriar a grade e recarregar todas as imagens.
 * Grade vazia ou produto que sumiu da lista caem na renderização completa.
 */
export function atualizarCartoesCatalogo() {
  const cartoes = document.querySelectorAll("#grid-produtos .pdv-produto-card");
  if (!cartoes.length) return renderizarCatalogo();
  for (const cartao of cartoes) {
    const produto = estadoPdv.produtos.find(
      (item) => String(item.id) === cartao.dataset.produtoId,
    );
    if (!produto) return renderizarCatalogo();
    if (
      disponivelExibido.get(cartao.dataset.produtoId) !==
      obterDisponivelBar(produto)
    )
      cartao.replaceWith(criarCartaoProduto(produto));
  }
}
