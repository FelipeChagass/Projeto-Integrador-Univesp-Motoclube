/**
 * Entrada do PDV: registra eventos, restaura a outbox IndexedDB e valida sessão/caixa.
 * Regras de negócio permanecem nos módulos de actions, reports, state e ui.
 */
import { API } from "../../shared/api.js";
import { UIModal } from "../../shared/modals.js";
import { estadoPdv, carregarDadosLocais, salvarDadosLocais } from "./state.js";
import {
  showToast,
  fecharModal,
  atualizarUI,
  renderizarCatalogo,
  selecionarCategoria,
  atualizarEstadoBotoes,
  initBottomSheetGestures,
} from "./ui.js";
import {
  adicionarAoCarrinho,
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
  sincronizarProdutosBackground,
  abrirReconciliacao,
} from "./actions.js";
import {
  abrirMenuRelatorios,
  gerarRelatorio,
  gerarRelatorioPeriodo,
  confirmarFechamentoCaixa,
  executarFechamentoCaixa,
} from "./reports.js";
import { listarOperacoes } from "./offline-queue.js";

/* ─── Helpers ─── */

function closeSidebar() {
  document.getElementById("sidebar-mobile").classList.remove("open");
}

function realizarLogout() {
  UIModal.confirm("Tem certeza que deseja sair?", () => {
    document.getElementById("loading").style.display = "flex";
    API.logout()
      .then(() => window.location.replace("/login"))
      .catch(() => window.location.replace("/login"));
  });
}

/* ─── Global Listeners ─── */

document.addEventListener("keydown", (eventoTeclado) => {
  if (eventoTeclado.key !== "Escape") return;
  const sobreposicoesModais = document.querySelectorAll(".modal-overlay");
  for (
    let indiceModal = 0;
    indiceModal < sobreposicoesModais.length;
    indiceModal++
  ) {
    const exibicaoModal = sobreposicoesModais[indiceModal].style.display;
    if (exibicaoModal && exibicaoModal !== "none") {
      fecharModal(sobreposicoesModais[indiceModal].id);
      break;
    }
  }
});

let cliqueIniciadoNaSobreposicaoModal = false;
document.addEventListener("mousedown", (eventoMouse) => {
  cliqueIniciadoNaSobreposicaoModal =
    eventoMouse.target.classList.contains("modal-overlay");
});

document.addEventListener("click", (eventoClique) => {
  if (
    eventoClique.target.classList.contains("modal-overlay") &&
    cliqueIniciadoNaSobreposicaoModal
  ) {
    fecharModal(eventoClique.target.id);
  }
});

/* ─── Header ─── */

document
  .getElementById("btn-estoque")
  .addEventListener("click", alternarModoEstoque);
document
  .getElementById("btn-gestao")
  .addEventListener("click", abrirMenuRelatorios);
document.getElementById("btn-admin").addEventListener("click", () => {
  window.location.href = "/admin";
});
document.getElementById("btn-config").addEventListener("click", abrirConfig);
document.getElementById("btn-logout").addEventListener("click", realizarLogout);

/* ─── Mobile Sidebar ─── */

document.getElementById("btn-hamburger").addEventListener("click", () => {
  document.getElementById("sidebar-mobile").classList.add("open");
});
document
  .querySelector(".sidebar-backdrop")
  .addEventListener("click", closeSidebar);
document
  .getElementById("sidebar-close-btn")
  .addEventListener("click", closeSidebar);

document.getElementById("sidebar-btn-estoque").addEventListener("click", () => {
  closeSidebar();
  alternarModoEstoque();
});
document.getElementById("sidebar-gestao").addEventListener("click", () => {
  closeSidebar();
  abrirMenuRelatorios();
});
document.getElementById("sidebar-btn-admin").addEventListener("click", () => {
  window.location.href = "/admin";
});
document.getElementById("sidebar-config").addEventListener("click", () => {
  closeSidebar();
  abrirConfig();
});

document.getElementById("sidebar-logout").addEventListener("click", () => {
  closeSidebar();
  realizarLogout();
});

/* ─── Payment Buttons ─── */

document
  .getElementById("btn-pag-dinheiro")
  .addEventListener("click", () => iniciarPagamento("DINHEIRO"));
document
  .getElementById("btn-pag-pix")
  .addEventListener("click", () => iniciarPagamento("PIX"));
document
  .getElementById("btn-pag-cartao")
  .addEventListener("click", () => iniciarPagamento("CARTAO"));
document
  .getElementById("btn-pag-fiado")
  .addEventListener("click", () => abrirModalMembros("FIADO"));
document
  .getElementById("btn-fechar-conta")
  .addEventListener("click", () => abrirModalMembros("FECHAR_CONTA"));

/* ─── Modal: Abertura Caixa ─── */

document
  .getElementById("btn-confirmar-abertura")
  .addEventListener("click", confirmarAberturaValor);
document
  .getElementById("btn-cancelar-abertura")
  .addEventListener("click", () => fecharModal("modal-abertura-caixa"));

/* ─── Modal: Observação ─── */

document
  .getElementById("btn-confirmar-obs")
  .addEventListener("click", confirmarObs);
document
  .getElementById("btn-cancelar-obs")
  .addEventListener("click", () => fecharModal("modal-obs"));

/* ─── Modal: Dinheiro ─── */

document
  .getElementById("valor-recebido")
  .addEventListener("input", calcularTroco);
document
  .getElementById("btn-confirmar-dinheiro")
  .addEventListener("click", finalizarPagamentoDinheiro);
document
  .getElementById("btn-cancelar-dinheiro")
  .addEventListener("click", () => fecharModal("modal-dinheiro"));

/* ─── Modal: Cartão ─── */

document
  .getElementById("btn-cartao-debito")
  .addEventListener("click", () => finalizarPagamentoCartao("DÉBITO"));
document
  .getElementById("btn-cartao-credito")
  .addEventListener("click", () => finalizarPagamentoCartao("CRÉDITO"));
document
  .getElementById("btn-cancelar-cartao")
  .addEventListener("click", () => fecharModal("modal-cartao"));

/* ─── Modal: Estoque ─── */

document
  .getElementById("btn-salvar-estoque")
  .addEventListener("click", salvarEdicaoEstoque);
document
  .getElementById("btn-cancelar-estoque")
  .addEventListener("click", () => fecharModal("modal-estoque"));

/* ─── Modal: Selecionar Membro ─── */

document
  .getElementById("select-membro")
  .addEventListener("change", verificarDividaSelecionada);
document
  .getElementById("btn-confirmar-membro")
  .addEventListener("click", confirmarSelecaoMembro);
document
  .getElementById("btn-cancelar-membro")
  .addEventListener("click", fecharModalSelecaoMembro);

/* ─── Modal: Fechar Conta ─── */

document
  .getElementById("btn-liq-dinheiro")
  .addEventListener("click", () => iniciarLiquidacao("DINHEIRO"));
document
  .getElementById("btn-liq-pix")
  .addEventListener("click", () => iniciarLiquidacao("PIX"));
document
  .getElementById("btn-liq-cartao")
  .addEventListener("click", () => iniciarLiquidacao("CARTAO"));
document
  .getElementById("btn-cancelar-fechar-conta")
  .addEventListener("click", () => fecharModal("modal-fechar-conta"));

/* ─── Modal: Relatórios ─── */

document
  .getElementById("btn-trocar-membro")
  .addEventListener("click", trocarMembro);
document
  .getElementById("btn-abrir-caixa-rel")
  .addEventListener("click", abrirModalAberturaCaixa);
document
  .getElementById("btn-fechar-dia")
  .addEventListener("click", () => gerarRelatorio("DIA"));
document
  .getElementById("btn-gerar-periodo")
  .addEventListener("click", gerarRelatorioPeriodo);
document
  .getElementById("btn-fechar-relatorios")
  .addEventListener("click", () => fecharModal("modal-relatorios"));
document
  .getElementById("btn-pendencias")
  .addEventListener("click", abrirReconciliacao);

/* ─── Modal: Fechar Caixa ─── */

document
  .getElementById("btn-confirmar-fechamento-caixa")
  .addEventListener("click", executarFechamentoCaixa);
document
  .getElementById("btn-cancelar-fechamento-caixa")
  .addEventListener("click", () => fecharModal("modal-fechar-caixa"));

/* ─── Modal: Config ─── */

document
  .getElementById("btn-salvar-config")
  .addEventListener("click", salvarConfig);
document
  .getElementById("btn-cancelar-config")
  .addEventListener("click", () => fecharModal("modal-config"));

/* ─── Event Delegation ─── */

document
  .getElementById("filtro-catalogo")
  .addEventListener("click", (eventoClique) => {
    const botaoCategoria = eventoClique.target.closest("[data-categoria]");
    if (botaoCategoria) selecionarCategoria(botaoCategoria.dataset.categoria);
  });

document
  .getElementById("carrinho-lista")
  .addEventListener("click", (eventoClique) => {
    const botaoQuantidade = eventoClique.target.closest("[data-action]");
    if (!botaoQuantidade) return;
    const indiceItem = parseInt(botaoQuantidade.dataset.idx, 10);
    if (botaoQuantidade.dataset.action === "increment")
      incrementarQtd(indiceItem);
    else if (botaoQuantidade.dataset.action === "decrement")
      decrementarQtd(indiceItem);
  });

document
  .getElementById("grid-produtos")
  .addEventListener("click", (eventoClique) => {
    const cartaoProduto = eventoClique.target.closest(".card");
    if (!cartaoProduto) return;
    const produtoId = cartaoProduto.dataset.produtoId;
    const estoqueBarZerado = cartaoProduto.dataset.barZerado === "true";
    const produto = estadoPdv.produtos.find(
      (produtoCandidato) => produtoCandidato.id == produtoId,
    );
    if (produto) cliqueProduto(produto, estoqueBarZerado);
  });

/* ─── Mobile Cart Badge ─── */

(function initMobileCart() {
  const listaCarrinho = document.getElementById("carrinho-lista");
  const indicadorQuantidadeCarrinho = document.getElementById(
    "carrinho-badge-mobile",
  );
  const secaoCarrinho = document.getElementById("carrinho-section");
  const botaoAlternarCarrinho = document.querySelector(".carrinho-header");
  if (
    !listaCarrinho ||
    !indicadorQuantidadeCarrinho ||
    !secaoCarrinho ||
    !botaoAlternarCarrinho
  )
    return;

  function atualizarBadge() {
    let quantidadeItens = 0;
    try {
      if (Array.isArray(estadoPdv.carrinho)) {
        for (
          let indiceItem = 0;
          indiceItem < estadoPdv.carrinho.length;
          indiceItem++
        ) {
          quantidadeItens += Number(estadoPdv.carrinho[indiceItem].qtd) || 0;
        }
      } else {
        quantidadeItens =
          listaCarrinho.querySelectorAll(".item-carrinho").length;
      }
    } catch (erroContagemCarrinho) {
      quantidadeItens = 0;
    }
    indicadorQuantidadeCarrinho.textContent = quantidadeItens;
    if (quantidadeItens > 0) {
      indicadorQuantidadeCarrinho.classList.add("show");
      indicadorQuantidadeCarrinho.style.display = "";
    } else {
      indicadorQuantidadeCarrinho.classList.remove("show");
      indicadorQuantidadeCarrinho.style.display = "";
    }
  }

  const observadorCarrinho = new MutationObserver(atualizarBadge);
  observadorCarrinho.observe(listaCarrinho, { childList: true, subtree: true });
  atualizarBadge();

  botaoAlternarCarrinho.addEventListener("click", () => {
    secaoCarrinho.classList.toggle("mobile-aberto");
  });
})();

/* ─── Initialization ─── */

async function iniciarSistema() {
  try {
    carregarDadosLocais();
    // Cached labels/box ids are never sufficient to authorize a new operation.
    estadoPdv.usuarioAtual = null;
    estadoPdv.caixaAberto = false;
    estadoPdv.filaVendas = await listarOperacoes();
    atualizarUI();
    if (estadoPdv.operadorAtual) atualizarEstadoBotoes();
    if (estadoPdv.logoUrl) {
      const imagemLogotipo = new Image();
      imagemLogotipo.src = estadoPdv.logoUrl;
    }
  } catch (erroInicializacaoLocal) {
    console.error("Erro init local", erroInicializacaoLocal);
  }

  const indicadorCarregamento = document.getElementById("loading");
  API._initSupabase()
    .then((clienteSupabase) => {
      if (!clienteSupabase) {
        window.location.href = "/login";
        return null;
      }
      return Promise.all([
        API.getMe(),
        API.getDadosIniciais(),
        API.getCaixaAberto(),
      ]);
    })
    .then((respostasInicializacao) => {
      if (!respostasInicializacao) return;
      const [respostaUsuario, dadosIniciais, respostaCaixa] =
        respostasInicializacao;
      if (
        !respostaUsuario ||
        respostaUsuario.status !== "ok" ||
        !respostaUsuario.usuario
      ) {
        window.location.href = "/login";
        return;
      }
      estadoPdv.usuarioAtual = respostaUsuario.usuario;
      estadoPdv.operadorAtual = respostaUsuario.usuario.nome;
      estadoPdv.produtos =
        dadosIniciais && Array.isArray(dadosIniciais.produtos)
          ? dadosIniciais.produtos
          : [];
      estadoPdv.membros =
        dadosIniciais && Array.isArray(dadosIniciais.membros)
          ? dadosIniciais.membros
          : [];
      if (dadosIniciais && dadosIniciais.logoUrl)
        estadoPdv.logoUrl = dadosIniciais.logoUrl;

      if (
        respostaCaixa &&
        respostaCaixa.status === "ok" &&
        respostaCaixa.caixa
      ) {
        estadoPdv.caixaAberto = true;
        estadoPdv.caixaId = respostaCaixa.caixa.id || null;
        estadoPdv.valorAbertura =
          Number(respostaCaixa.caixa.valor_abertura) || 0;
      } else {
        estadoPdv.caixaAberto = false;
        estadoPdv.caixaId = null;
        estadoPdv.valorAbertura = 0;
      }

      salvarDadosLocais();
      renderizarCatalogo();
      atualizarEstadoBotoes();
      processarFilaVendas();
      if (indicadorCarregamento) indicadorCarregamento.style.display = "none";
    })
    .catch((erroInicializacao) => {
      console.error("Falha na inicialização:", erroInicializacao);
      if (indicadorCarregamento) indicadorCarregamento.style.display = "none";
      if (estadoPdv.operadorAtual) {
        renderizarCatalogo();
        atualizarEstadoBotoes();
        processarFilaVendas();
        showToast(
          "Não foi possível validar a sessão/caixa. Dados preservados; reconecte para operar.",
        );
      } else {
        window.location.href = "/login";
      }
    });

  setInterval(() => {
    if (!document.hidden) processarFilaVendas();
  }, 10000);
  setInterval(sincronizarProdutosBackground, 60000);
  window.addEventListener("online", () => {
    processarFilaVendas();
    sincronizarProdutosBackground();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) processarFilaVendas();
  });
}

iniciarSistema();
initBottomSheetGestures();
