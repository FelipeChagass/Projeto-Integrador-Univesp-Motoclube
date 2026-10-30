/**
 * Troca de operador, abertura de caixa e preferências locais de impressão.
 * Atualiza a abertura somente após ACK válido; logout delega à API e preserva a fila.
 */
import { API } from "../../../shared/api.js";
import { UIModal } from "../../../shared/modals.js";
import { estadoPdv, salvarDadosLocais } from "../state.js";
import {
  mensagemErro,
  formatCurrency,
  LocalDB,
} from "../../../shared/utils.js";
import {
  showToast,
  fecharModal,
  abrirModal,
  atualizarUI,
  atualizarEstadoBotoes,
} from "../ui.js";

/* ─── Operator ─── */

export function trocarMembro() {
  UIModal.confirm("Deseja sair do operador atual e voltar ao login?", () => {
    fecharModal("modal-relatorios");
    API.logout({
      preserveKeys: [
        "motoBarCaixaAberto",
        "motoBarCaixaId",
        "motoBarValorAbertura",
      ],
    })
      .then(() => {
        estadoPdv.operadorAtual = "";
        estadoPdv.usuarioAtual = null;
        estadoPdv.inicioTurno = null;
        atualizarUI();
        atualizarEstadoBotoes();
        window.location.replace("/login");
      })
      .catch(() => window.location.replace("/login"));
  });
}

/* ─── Cash Register ─── */

export function abrirModalAberturaCaixa() {
  if (estadoPdv.caixaAberto) return showToast("O caixa já está aberto!");
  fecharModal("modal-relatorios");
  abrirModal("modal-abertura-caixa");
  document.getElementById("input-valor-abertura").focus();
}

export async function confirmarAberturaValor() {
  let valorAberturaInformado = parseFloat(
    document.getElementById("input-valor-abertura").value,
  );
  if (!Number.isFinite(valorAberturaInformado) || valorAberturaInformado < 0)
    return showToast("Informe um valor de abertura válido.");
  try {
    const respostaAbertura = await API.abrirCaixa(valorAberturaInformado);
    if (
      respostaAbertura.status !== "ok" ||
      !respostaAbertura.caixa_id ||
      respostaAbertura.valor_abertura == null ||
      !Number.isFinite(Number(respostaAbertura.valor_abertura)) ||
      Number(respostaAbertura.valor_abertura) < 0
    )
      throw new Error("Servidor não confirmou a abertura.");
    estadoPdv.caixaId = respostaAbertura.caixa_id;
    estadoPdv.valorAbertura = Number(respostaAbertura.valor_abertura);
    estadoPdv.caixaAberto = true;
    estadoPdv.inicioTurno = new Date();
    salvarDadosLocais();
    fecharModal("modal-abertura-caixa");
    showToast(`Caixa Aberto: ${formatCurrency(estadoPdv.valorAbertura)}`);
    atualizarEstadoBotoes();
  } catch (erroAberturaCaixa) {
    showToast(`Caixa não aberto: ${mensagemErro(erroAberturaCaixa)}`);
  }
}

/* ─── Config ─── */

export function abrirConfig() {
  abrirModal("modal-config");
  document.getElementById("cfg-imprimir").checked = estadoPdv.config.imprimir;
  document.getElementById("cfg-largura").value = estadoPdv.config.largura;
}

export function salvarConfig() {
  estadoPdv.config.imprimir = document.getElementById("cfg-imprimir").checked;
  estadoPdv.config.largura = document.getElementById("cfg-largura").value;
  LocalDB.set("motoBarConfig", JSON.stringify(estadoPdv.config));
  fecharModal("modal-config");
}
