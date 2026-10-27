/** Liga a interface do PDV às actions, sem alterar regras ou payloads. */
import { API } from "../../shared/api.js";
import { UIModal } from "../../shared/modals.js";
import { elementoVisivel } from "../../shared/dialogs.js";
import {
  fechamentoLegadoBloqueado,
  pedirFechamentoModal,
} from "../../shared/gestures.js";
import { estadoPdv } from "./state.js";
import {
  fecharModal,
  selecionarCategoria,
  mostrarCarregamento,
  initBottomSheetGestures,
  sincronizarEstadoCarrinho,
  viewportIsMobile,
} from "./ui.js";
import {
  incrementarQtd,
  decrementarQtd,
  confirmarObs,
  cliqueProduto,
  alternarModoEstoque,
  salvarEdicaoEstoque,
  iniciarPagamento,
  iniciarLiquidacao,
  calcularTroco,
  finalizarPagamentoDinheiro,
  finalizarPagamentoCartao,
  verificarDividaSelecionada,
  abrirModalMembros,
  confirmarSelecaoMembro,
  fecharModalSelecaoMembro,
  trocarMembro,
  abrirModalAberturaCaixa,
  confirmarAberturaValor,
  abrirConfig,
  salvarConfig,
  processarFilaVendas,
  sincronizarProdutosEmSegundoPlano,
  abrirReconciliacao,
} from "./actions.js";
import {
  abrirMenuRelatorios,
  gerarRelatorio,
  gerarRelatorioPeriodo,
  executarFechamentoCaixa,
} from "./reports.js";

const gradesConfiguradas = new WeakSet();
let eventosGlobaisConfigurados = false;

function realizarLogout() {
  UIModal.confirm("Tem certeza que deseja sair?", () => {
    mostrarCarregamento(true);
    API.logout()
      .then(() => window.location.replace("/login"))
      .catch(() => window.location.replace("/login"));
  });
}

function abrirAdministracao() {
  window.location.href = "/admin";
}

function aoClicar(id, acao) {
  document.getElementById(id)?.addEventListener("click", acao);
}

function configurarSidebar() {
  const sidebar = document.getElementById("sidebar-mobile");
  const hamburger = document.getElementById("btn-hamburger");
  if (!sidebar) return;
  let acaoPendente = null;
  const atualizarExpandido = (expandido) =>
    hamburger?.setAttribute("aria-expanded", String(expandido));
  atualizarExpandido(sidebar.classList.contains("show"));
  sidebar.addEventListener("shown.bs.offcanvas", () =>
    atualizarExpandido(true),
  );
  sidebar.addEventListener("hidden.bs.offcanvas", () => {
    atualizarExpandido(false);
    const acao = acaoPendente;
    acaoPendente = null;
    acao?.();
  });

  // Toggle/dismiss/backdrop/Escape e foco pertencem à Data API do Bootstrap.
  // Não abrir modal durante a transição: o Offcanvas ainda detém o foco/backdrop.
  const acoes = {
    "sidebar-btn-estoque": alternarModoEstoque,
    "sidebar-gestao": abrirMenuRelatorios,
    "sidebar-btn-admin": abrirAdministracao,
    "sidebar-config": abrirConfig,
    "sidebar-logout": realizarLogout,
  };
  Object.entries(acoes).forEach(([id, acao]) => {
    aoClicar(id, () => {
      if (acaoPendente) return;
      acaoPendente = acao;
      window.bootstrap.Offcanvas.getOrCreateInstance(sidebar).hide();
    });
  });
}

function configurarEventosGlobais() {
  if (eventosGlobaisConfigurados) return;
  eventosGlobaisConfigurados = true;
  const modalAtual = () =>
    [...document.querySelectorAll(".modal-overlay")]
      .filter(elementoVisivel)
      .sort(
        (a, b) =>
          Number(a.dataset.pdvModalOrdem || 0) -
          Number(b.dataset.pdvModalOrdem || 0),
      )
      .at(-1);
  document.addEventListener("pedido-fechar-modal", (evento) => {
    const modal = evento.target;
    if (!modal.matches?.(".modal-overlay") || evento.defaultPrevented) return;
    evento.preventDefault();
    if (modal !== modalAtual() || fechamentoLegadoBloqueado(modal)) return;
    const acionador = modal.querySelector("[data-acionar]");
    const cancelar =
      acionador && document.getElementById(acionador.dataset.acionar);
    if (cancelar) cancelar.click();
    else if (modal.id === "modal-selecionar-membro") fecharModalSelecaoMembro();
    else fecharModal(modal.id);
  });
  let cliqueIniciadoNaSobreposicaoModal = null;
  document.addEventListener("mousedown", (evento) => {
    cliqueIniciadoNaSobreposicaoModal = evento.target.classList.contains(
      "modal-overlay",
    )
      ? evento.target
      : null;
  });
  document.addEventListener("click", (evento) => {
    const inicio = cliqueIniciadoNaSobreposicaoModal;
    cliqueIniciadoNaSobreposicaoModal = null;
    const acionador = evento.target.closest("[data-acionar]");
    if (acionador) document.getElementById(acionador.dataset.acionar)?.click();
    if (
      evento.target.classList.contains("modal-overlay") &&
      inicio === evento.target &&
      evento.target === modalAtual()
    )
      pedirFechamentoModal(evento.target);
  });
  document.addEventListener("keydown", (evento) => {
    if (
      evento.key !== "Escape" ||
      evento.defaultPrevented ||
      evento.target.closest?.(".modal, .ui-dialogo")
    )
      return;
    const modal = modalAtual();
    if (fechamentoLegadoBloqueado(modal)) return;
    evento.preventDefault();
    pedirFechamentoModal(modal);
  });
  window.addEventListener("online", () => {
    processarFilaVendas();
    sincronizarProdutosEmSegundoPlano();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) processarFilaVendas();
  });

  initBottomSheetGestures();
  // Registrado depois do gesto: lê a classe final, sem observador ou segundo arrasto.
  document.addEventListener("touchend", sincronizarEstadoCarrinho);
  window
    .matchMedia?.("(max-width: 767.98px)")
    .addEventListener?.("change", sincronizarEstadoCarrinho);
}

export function configurarEventosPdv() {
  const grade = document.getElementById("grid-produtos");
  if (!grade || gradesConfiguradas.has(grade)) return;
  gradesConfiguradas.add(grade);
  configurarEventosGlobais();
  configurarSidebar();

  const acoes = {
    "btn-estoque": alternarModoEstoque,
    "btn-gestao": abrirMenuRelatorios,
    "btn-admin": abrirAdministracao,
    "btn-config": abrirConfig,
    "btn-logout": realizarLogout,
    "btn-pag-dinheiro": () => iniciarPagamento("DINHEIRO"),
    "btn-pag-pix": () => iniciarPagamento("PIX"),
    "btn-pag-cartao": () => iniciarPagamento("CARTAO"),
    "btn-pag-fiado": () => abrirModalMembros("FIADO"),
    "btn-fechar-conta": () => abrirModalMembros("FECHAR_CONTA"),
    "btn-confirmar-abertura": confirmarAberturaValor,
    "btn-confirmar-obs": confirmarObs,
    "btn-confirmar-dinheiro": finalizarPagamentoDinheiro,
    "btn-cartao-debito": () => finalizarPagamentoCartao("DÉBITO"),
    "btn-cartao-credito": () => finalizarPagamentoCartao("CRÉDITO"),
    "btn-salvar-estoque": salvarEdicaoEstoque,
    "btn-confirmar-membro": confirmarSelecaoMembro,
    "btn-cancelar-membro": fecharModalSelecaoMembro,
    "btn-liq-dinheiro": () => iniciarLiquidacao("DINHEIRO"),
    "btn-liq-pix": () => iniciarLiquidacao("PIX"),
    "btn-liq-cartao": () => iniciarLiquidacao("CARTAO"),
    "btn-trocar-membro": trocarMembro,
    "btn-abrir-caixa-rel": abrirModalAberturaCaixa,
    "btn-fechar-dia": () => gerarRelatorio("DIA"),
    "btn-gerar-periodo": gerarRelatorioPeriodo,
    "btn-pendencias": abrirReconciliacao,
    "btn-confirmar-fechamento-caixa": executarFechamentoCaixa,
    "btn-salvar-config": salvarConfig,
  };
  Object.entries(acoes).forEach(([id, acao]) => aoClicar(id, acao));
  const cancelamentos = {
    "btn-cancelar-abertura": "modal-abertura-caixa",
    "btn-cancelar-obs": "modal-obs",
    "btn-cancelar-dinheiro": "modal-dinheiro",
    "btn-cancelar-cartao": "modal-cartao",
    "btn-cancelar-estoque": "modal-estoque",
    "btn-cancelar-fechar-conta": "modal-fechar-conta",
    "btn-fechar-relatorios": "modal-relatorios",
    "btn-cancelar-fechamento-caixa": "modal-fechar-caixa",
    "btn-cancelar-config": "modal-config",
  };
  Object.entries(cancelamentos).forEach(([id, modal]) =>
    aoClicar(id, () => fecharModal(modal)),
  );
  document
    .getElementById("valor-recebido")
    ?.addEventListener("input", calcularTroco);
  document
    .getElementById("select-membro")
    ?.addEventListener("change", verificarDividaSelecionada);

  document
    .getElementById("filtro-catalogo")
    ?.addEventListener("click", (evento) => {
      const botao = evento.target.closest("button[data-categoria]");
      if (botao) selecionarCategoria(botao.dataset.categoria);
    });
  document
    .getElementById("carrinho-lista")
    ?.addEventListener("click", (evento) => {
      const botao = evento.target.closest("button[data-action]");
      if (!botao) return;
      const indice = parseInt(botao.dataset.idx, 10);
      if (botao.dataset.action === "increment") incrementarQtd(indice);
      else if (botao.dataset.action === "decrement") decrementarQtd(indice);
    });
  grade.addEventListener("click", (evento) => {
    const botao = evento.target.closest("button.pdv-produto-acionador");
    if (!botao || !grade.contains(botao)) return;
    const cartao = botao.closest(".pdv-produto-card");
    if (!cartao) return;
    const produto = estadoPdv.produtos.find(
      (item) => item.id == cartao.dataset.produtoId,
    );
    if (produto) cliqueProduto(produto, cartao.dataset.barZerado === "true");
  });
  aoClicar("btn-alternar-carrinho", () => {
    if (viewportIsMobile())
      document
        .getElementById("carrinho-section")
        ?.classList.toggle("mobile-aberto");
    sincronizarEstadoCarrinho();
  });
  sincronizarEstadoCarrinho();
}
