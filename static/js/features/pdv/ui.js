import { API } from "../../shared/api.js";
import { UIModal } from "../../shared/modals.js";
import {
  elementoVisivel,
  sincronizarScrollDialogos,
} from "../../shared/dialogs.js";
import { estadoPdv, salvarEstadoLocal, salvarDadosLocais } from "./state.js";
import {
  esc,
  sanitizeUrl,
  formatCurrency,
  LocalDB,
} from "../../shared/utils.js";
import {
  temCategoriaCombo,
  disponivelNoBar,
  precoAvulso,
  descricaoCombo,
} from "../../shared/combos.js";

export function viewportIsMobile() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(max-width: 767.98px)").matches
  );
}

/** Cobre a tela durante operações longas; a visibilidade é só classe do Bootstrap. */
export function mostrarCarregamento(visivel) {
  const carregamento = document.getElementById("loading");
  if (!carregamento) return;
  carregamento.classList.toggle("d-flex", visivel);
  carregamento.classList.toggle("d-none", !visivel);
}

export function showToast(mensagem, tipoMensagem) {
  const elementoNotificacao = document.getElementById("toast");
  elementoNotificacao.innerText = mensagem;
  elementoNotificacao.className = `show${tipoMensagem === "err" ? " toast-error" : ""}`;
  setTimeout(() => {
    elementoNotificacao.className = elementoNotificacao.className
      .replace("show", "")
      .replace("toast-error", "")
      .trim();
  }, 3000);
}

export function abrirModal(modalId) {
  const elementoModal = document.getElementById(modalId);
  if (!elementoModal) return;
  // Estado restrito ao ciclo abrir/fechar, sem acoplar os demais recursos do PDV.
  const estados = (abrirModal.estados ??= new WeakMap());
  const anterior = estados.get(elementoModal);
  anterior?.cancelarTransicao?.();
  if (elementoModal.matches(".modal.show")) return;
  const estado = {
    retorno:
      anterior && elementoVisivel(elementoModal)
        ? anterior.retorno
        : document.activeElement,
  };
  estados.set(elementoModal, estado);
  if (elementoModal.matches(".modal")) {
    if (!anterior)
      elementoModal.addEventListener("hidden.bs.modal", () => {
        sincronizarScrollDialogos();
        const retorno = estados.get(elementoModal)?.retorno;
        if (
          !document.querySelector(".modal.show, .ui-dialogo") &&
          elementoVisivel(retorno)
        )
          retorno.focus();
      });
    window.bootstrap.Modal.getOrCreateInstance(elementoModal).show();
    return;
  }
  elementoModal.dataset.pdvModalOrdem = String(
    (abrirModal.sequencia = (abrirModal.sequencia || 0) + 1),
  );
  elementoModal.classList.remove("d-none", "closing");
  elementoModal.style.display = "flex";
  elementoModal.removeAttribute("aria-hidden");
  elementoModal.setAttribute("role", "dialog");
  elementoModal.setAttribute("aria-modal", "true");
  elementoModal.tabIndex = -1;
  const conteudo = elementoModal.querySelector(".modal-content");
  if (conteudo) {
    conteudo.classList.remove("sheet-dismissing");
    conteudo.style.transform = "";
    conteudo.style.transition = "";
    void conteudo.offsetHeight;
  }
  elementoModal.classList.toggle("sheet-open", viewportIsMobile());
  sincronizarScrollDialogos();
  // Fixtures sem .modal-overlay também continuam usando o ciclo legado.
  document.body.classList.add("modal-open");
  const campo = [
    ...elementoModal.querySelectorAll(
      "input, select, textarea, button, [tabindex]",
    ),
  ].find(
    (item) => item.tabIndex >= 0 && !item.disabled && elementoVisivel(item),
  );
  (campo || elementoModal).focus();
}

export function fecharModal(modalId) {
  const elementoModal = document.getElementById(modalId);
  if (!elementoModal) return;
  if (elementoModal.matches(".modal")) {
    window.bootstrap.Modal.getOrCreateInstance(elementoModal).hide();
    return;
  }
  if (
    !elementoVisivel(elementoModal) ||
    elementoModal.classList.contains("closing")
  )
    return;
  const estados = (abrirModal.estados ??= new WeakMap());
  const estado = estados.get(elementoModal) || {};
  estados.set(elementoModal, estado);
  const conteudo = elementoModal.querySelector(".modal-content");
  const movel = viewportIsMobile() && conteudo;
  let concluido = false;
  let temporizador;
  estado.cancelarTransicao = () => {
    concluido = true;
    clearTimeout(temporizador);
    conteudo?.removeEventListener("transitionend", concluir);
  };
  const concluir = (evento) => {
    if (
      concluido ||
      (evento &&
        (evento.target !== conteudo ||
          (evento.propertyName && evento.propertyName !== "transform")))
    )
      return;
    estado.cancelarTransicao();
    const tinhaFoco = elementoModal.contains(document.activeElement);
    elementoModal.style.display = "none";
    elementoModal.classList.remove("closing", "sheet-open");
    elementoModal.setAttribute("aria-hidden", "true");
    elementoModal.removeAttribute("aria-modal");
    if (conteudo) {
      conteudo.classList.remove("sheet-dismissing");
      conteudo.style.transform = "";
      conteudo.style.transition = "";
    }
    sincronizarScrollDialogos();
    if (!tinhaFoco || document.querySelector(".modal.show, .ui-dialogo"))
      return;
    const atual = [
      ...document.querySelectorAll(".modal-overlay, [data-pdv-modal-ordem]"),
    ]
      .filter(elementoVisivel)
      .sort(
        (a, b) =>
          Number(a.dataset.pdvModalOrdem || 0) -
          Number(b.dataset.pdvModalOrdem || 0),
      )
      .at(-1);
    if (
      elementoVisivel(estado.retorno) &&
      (!atual || atual.contains(estado.retorno))
    )
      estado.retorno.focus();
    else atual?.focus();
  };
  elementoModal.classList.add("closing");
  elementoModal.classList.remove("sheet-open");
  if (movel) {
    conteudo.classList.add("sheet-dismissing");
    conteudo.addEventListener("transitionend", concluir);
  }
  temporizador = setTimeout(concluir, movel ? 350 : 250);
}

export function atualizarEstadoBotoes() {
  const barraOperador = document.getElementById("barra-operador");
  const botaoAdministracao = document.getElementById("btn-admin");
  const botaoAdministracaoLateral =
    document.getElementById("sidebar-btn-admin");

  if (estadoPdv.operadorAtual) {
    barraOperador.innerText = `OPERADOR: ${estadoPdv.operadorAtual.toUpperCase()}`;
    if (estadoPdv.caixaAberto) {
      barraOperador.innerText += " (CAIXA ABERTO)";
      barraOperador.classList.add("status-aberto");
      barraOperador.classList.remove("status-fechado", "text-body-secondary");
    } else {
      barraOperador.innerText += " (CAIXA FECHADO)";
      barraOperador.classList.add("status-fechado");
      barraOperador.classList.remove("status-aberto", "text-body-secondary");
    }
    if (estadoPdv.usuarioAtual && estadoPdv.usuarioAtual.perfil === "admin") {
      if (botaoAdministracao) botaoAdministracao.classList.remove("d-none");
      if (botaoAdministracaoLateral)
        botaoAdministracaoLateral.classList.remove("d-none");
    } else {
      if (botaoAdministracao) botaoAdministracao.classList.add("d-none");
      if (botaoAdministracaoLateral)
        botaoAdministracaoLateral.classList.add("d-none");
    }
  } else {
    if (botaoAdministracao) botaoAdministracao.classList.add("d-none");
    if (botaoAdministracaoLateral)
      botaoAdministracaoLateral.classList.add("d-none");
    barraOperador.innerText = "SISTEMA BLOQUEADO - Clique para Entrar";
    barraOperador.classList.add("text-body-secondary");
    barraOperador.classList.remove("status-aberto", "status-fechado");
  }
}

export function sincronizarTextoModoEstoque() {
  const botaoEstoque = document.getElementById("btn-estoque");
  const textoBotaoEstoque = document.getElementById("btn-estoque-text");
  const textoBotaoEstoqueLateral = document.getElementById(
    "sidebar-btn-estoque-text",
  );
  const modoEstoqueAtivo = estadoPdv.modoGerenciaEstoque;

  if (textoBotaoEstoque) {
    textoBotaoEstoque.innerText = modoEstoqueAtivo
      ? "Sair do modo estoque"
      : "Estoque";
  }

  if (botaoEstoque) {
    botaoEstoque.title = modoEstoqueAtivo
      ? "Sair do modo estoque"
      : "Gerenciar Estoque";
  }

  if (textoBotaoEstoqueLateral) {
    textoBotaoEstoqueLateral.innerText = modoEstoqueAtivo
      ? "Sair do modo estoque"
      : "Gerenciar Estoque";
  }
}

export function obterEstoqueBar(produtoId) {
  const produtoEncontrado = estadoPdv.produtos.find(
    (produto) => produto.id == produtoId,
  );
  return produtoEncontrado ? Number(produtoEncontrado.estoque_bar) : 0;
}

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
    ? `<img src="${esc(urlImagem)}" alt="" onerror="this.remove()">`
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
  return `<button type="button" class="pdv-produto-acionador stretched-link" aria-label="${esc(rotulo)}"><span class="visually-hidden">${esc(rotulo)}</span></button>`;
}

export function selecionarCategoria(categoria) {
  if (!["todos", "bebida", "comida", "combo", "outro"].includes(categoria))
    return;
  estadoPdv.categoriaCatalogo = categoria;
  renderizarCatalogo();
}

export function renderizarCatalogo() {
  const gradeProdutos = document.getElementById("grid-produtos");
  gradeProdutos.innerHTML = "";
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
            <div style="grid-column: 1 / -1; text-align:center; padding: 40px; color:var(--text-secondary);">
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
  produtosFiltrados.forEach((produto) => {
    const estoqueBarDisponivel = obterDisponivelBar(produto);
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
      fragmentoProdutos.appendChild(cartaoCombo);
      return;
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
      ? '<div class="badge-edit" style="display:block">EDITAR</div>'
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
                <img src="${esc(urlImagem)}" alt="" onerror="this.src='https://placehold.co/150x150/333/FFF?text=Erro'">
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
    cartaoProduto.insertAdjacentHTML(
      "beforeend",
      htmlAcionadorProduto(produto),
    );
    fragmentoProdutos.appendChild(cartaoProduto);
  });
  gradeProdutos.appendChild(fragmentoProdutos);
}

/** O gesto compartilhado continua dono da classe; o PDV espelha seu estado no botão. */
export function sincronizarEstadoCarrinho() {
  const secaoCarrinho = document.getElementById("carrinho-section");
  const botaoCarrinho = document.getElementById("btn-alternar-carrinho");
  if (!secaoCarrinho || !botaoCarrinho) return;
  const telaMovel = viewportIsMobile();
  if (!telaMovel) secaoCarrinho.classList.remove("mobile-aberto");
  botaoCarrinho.setAttribute(
    "aria-expanded",
    String(!telaMovel || secaoCarrinho.classList.contains("mobile-aberto")),
  );
}

export function atualizarUI() {
  const listaCarrinho = document.getElementById("carrinho-lista");
  listaCarrinho.innerHTML = "";
  let totalCarrinho = 0;
  let quantidadeCarrinho = 0;
  if (Array.isArray(estadoPdv.carrinho)) {
    const fragmentoCarrinho = document.createDocumentFragment();
    estadoPdv.carrinho.forEach((itemCarrinho, indiceItem) => {
      totalCarrinho += Number(itemCarrinho.preco) * Number(itemCarrinho.qtd);
      quantidadeCarrinho += Number(itemCarrinho.qtd) || 0;
      const observacaoHtml = itemCarrinho.obs
        ? `<div class="item-obs">${esc(itemCarrinho.obs)}</div>`
        : "";
      const produtoCarrinho = estadoPdv.produtos.find(
        (produto) => produto.id == itemCarrinho.id,
      );
      const composicaoHtml = temCategoriaCombo(produtoCarrinho)
        ? `<div class="item-combo">${esc(descricaoCombo(produtoCarrinho.itens_combo))}</div>`
        : "";
      const elementoItemCarrinho = document.createElement("div");
      elementoItemCarrinho.className = "item-carrinho";
      elementoItemCarrinho.innerHTML = `
                <div class="item-detalhes">
                    <div class="item-nome">${esc(itemCarrinho.nome)}</div>
                    ${composicaoHtml}${observacaoHtml}
                </div>
                <div class="item-qty-controls">
                    <button type="button" class="btn-qty" data-action="decrement" data-idx="${indiceItem}" aria-label="Diminuir quantidade de ${esc(itemCarrinho.nome)}">-</button>
                    <span>${esc(itemCarrinho.qtd)}</span>
                    <button type="button" class="btn-qty" data-action="increment" data-idx="${indiceItem}" aria-label="Aumentar quantidade de ${esc(itemCarrinho.nome)}">+</button>
                </div>`;
      fragmentoCarrinho.appendChild(elementoItemCarrinho);
    });
    listaCarrinho.appendChild(fragmentoCarrinho);
  }
  document.getElementById("total-display").innerText =
    formatCurrency(totalCarrinho);
  const indicadorQuantidade = document.getElementById("carrinho-badge-mobile");
  if (indicadorQuantidade) {
    indicadorQuantidade.textContent = quantidadeCarrinho;
    indicadorQuantidade.classList.toggle("show", quantidadeCarrinho > 0);
  }
  sincronizarEstadoCarrinho();
  sincronizarTextoModoEstoque();
  renderizarCatalogo();
  salvarEstadoLocal();
}

export { initBottomSheetGestures } from "../../shared/gestures.js";
