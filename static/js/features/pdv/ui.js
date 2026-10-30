import { API } from "../../shared/api.js";
import { UIModal } from "../../shared/modals.js";
import {
  elementoVisivel,
  sincronizarScrollDialogos,
} from "../../shared/dialogs.js";
import { estadoPdv, salvarEstadoLocal, salvarDadosLocais } from "./state.js";
import { esc, formatCurrency, LocalDB } from "../../shared/utils.js";
import { temCategoriaCombo, descricaoCombo } from "../../shared/combos.js";
import { atualizarCartoesCatalogo } from "./catalogo.js";

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
  atualizarCartoesCatalogo();
  salvarEstadoLocal();
}

export { initBottomSheetGestures } from "../../shared/gestures.js";
export {
  obterDisponivelBar,
  selecionarCategoria,
  renderizarCatalogo,
  atualizarCartoesCatalogo,
} from "./catalogo.js";
