/** Entrada do PDV: compõe eventos, restaura a outbox e valida sessão/caixa. */
import { API } from "../../shared/api.js";
import { estadoPdv, carregarDadosLocais, salvarDadosLocais } from "./state.js";
import {
  showToast,
  atualizarUI,
  renderizarCatalogo,
  atualizarEstadoBotoes,
  mostrarCarregamento,
} from "./ui.js";
import {
  processarFilaVendas,
  sincronizarProdutosEmSegundoPlano,
} from "./actions.js";
import { listarOperacoes, podarConfirmadas } from "./offline-queue.js";
import { configurarEventosPdv } from "./events.js";

async function iniciarSistema() {
  try {
    carregarDadosLocais();
    // Cached labels/box ids are never sufficient to authorize a new operation.
    estadoPdv.usuarioAtual = null;
    estadoPdv.caixaAberto = false;
    estadoPdv.filaVendas = await listarOperacoes();
    // Recibos confirmados há mais de 30 dias saem do aparelho; nunca bloqueia a abertura.
    podarConfirmadas().catch((erroPoda) =>
      console.warn("Poda de recibos antigos não concluída.", erroPoda),
    );
    atualizarUI();
    if (estadoPdv.operadorAtual) atualizarEstadoBotoes();
    if (estadoPdv.logoUrl) {
      const imagemLogotipo = new Image();
      imagemLogotipo.src = estadoPdv.logoUrl;
    }
  } catch (erroInicializacaoLocal) {
    console.error("Erro init local", erroInicializacaoLocal);
  }

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
      mostrarCarregamento(false);
    })
    .catch((erroInicializacao) => {
      console.error("Falha na inicialização:", erroInicializacao);
      mostrarCarregamento(false);
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
  setInterval(sincronizarProdutosEmSegundoPlano, 60000);
}

configurarEventosPdv();
iniciarSistema();
