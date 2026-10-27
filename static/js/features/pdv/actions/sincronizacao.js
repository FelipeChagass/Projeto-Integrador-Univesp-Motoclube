/**
 * Envio da fila, reconciliação/exportação e atualização silenciosa de estoque.
 * Reutiliza payload/ID do operador de origem; offline-queue.js valida o ACK e conserva falhas.
 */
import { API } from "../../../shared/api.js";
import { estadoPdv } from "../state.js";
import { mensagemErro, formatCurrency } from "../../../shared/utils.js";
import {
  showToast,
  fecharModal,
  abrirModal,
  renderizarCatalogo,
} from "../ui.js";
import {
  listarOperacoes,
  registrarTentativa,
  confirmarOperacao,
  registrarFalha,
  reenviarOperacao,
} from "../offline-queue.js";

/* ─── Queue ─── */

export async function processarFilaVendas({ notificarFalhas = false } = {}) {
  if (
    estadoPdv.processandoFila ||
    !estadoPdv.usuarioAtual?.id ||
    navigator.onLine === false
  )
    return;
  estadoPdv.processandoFila = true;
  try {
    estadoPdv.filaVendas = await listarOperacoes();
    for (const registro of estadoPdv.filaVendas) {
      const dadosOperacao = registro.payload;
      if (
        dadosOperacao.usuario_origem_id !== estadoPdv.usuarioAtual?.id ||
        !["pendente", "aguardando_reenvio"].includes(registro.estado) ||
        registro.proxima_tentativa > Date.now()
      )
        continue;
      await registrarTentativa(registro.id_externo);
      try {
        const confirmacaoServidor =
          dadosOperacao.tipo_operacao === "pagamento"
            ? await API.quitarContaMembro(dadosOperacao)
            : await API.processarVenda(dadosOperacao);
        await confirmarOperacao(dadosOperacao, confirmacaoServidor);
        showToast(
          `Operação confirmada: ${formatCurrency(confirmacaoServidor.total_calculado)}`,
        );
      } catch (erroSincronizacao) {
        await registrarFalha(registro.id_externo, erroSincronizacao);
        if (notificarFalhas) {
          showToast(
            `Operação preservada: ${mensagemErro(erroSincronizacao)}. Consulte Operações pendentes.`,
          );
        } else {
          console.warn(
            `Falha ao sincronizar operação ${registro.id_externo}; registro preservado.`,
            erroSincronizacao,
          );
        }
        if ([401, 403].includes(erroSincronizacao.status)) break;
      }
    }
    estadoPdv.filaVendas = await listarOperacoes();
  } catch (erroFila) {
    showToast(`Fila indisponível: ${mensagemErro(erroFila)}`);
  } finally {
    estadoPdv.processandoFila = false;
  }
}

export async function abrirReconciliacao() {
  try {
    const registros = await listarOperacoes();
    let modal = document.getElementById("modal-reconciliacao");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "modal-reconciliacao";
      modal.className = "modal-overlay";
      document.body.appendChild(modal);
    }
    // Mesma estrutura de templates/shared/modal.html (cabeçalho, corpo e rodapé).
    modal.innerHTML = `<div class="modal-content modal-reconciliacao-content d-flex flex-column overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="reconciliacao-titulo">
      <header class="modal-cabecalho modal-drag-header px-3 px-md-4 pb-3 pt-2 pt-md-3">
        <div class="drag-handle" aria-hidden="true"></div>
        <div class="d-flex align-items-center gap-3">
          <span class="modal-cabecalho-icone d-flex align-items-center justify-content-center flex-shrink-0" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg></span>
          <div class="modal-cabecalho-textos d-flex flex-column gap-1 flex-grow-1">
            <h2 class="modal-cabecalho-titulo m-0" id="reconciliacao-titulo">Operações pendentes</h2>
            <p class="modal-cabecalho-subtitulo m-0">${registros.length} ${registros.length === 1 ? "registro" : "registros"} neste dispositivo</p>
          </div>
          <button type="button" class="modal-cabecalho-fechar d-flex align-items-center justify-content-center flex-shrink-0 p-0" aria-label="Fechar" data-acionar="fechar-pendencias"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
        </div>
      </header>
      <div class="modal-scroll-body d-flex flex-column gap-3 p-3 p-md-4 flex-grow-1 overflow-auto">
        <p class="reconciliacao-description m-0">Registros permanecem neste dispositivo até confirmação. Exporte para reconciliar conflitos com o administrador. Não limpe os dados do navegador.</p>
        <div id="lista-pendencias" class="lista-pendencias m-0"></div>
      </div>
      <div class="modal-rodape d-flex gap-2 px-3 px-md-4 pt-3 pb-md-3 flex-shrink-0 flex-column-reverse flex-sm-row">
        <button class="btn-action m-0 justify-content-center" id="fechar-pendencias">FECHAR JANELA</button>
        <button class="btn-action btn-acao-primaria m-0 justify-content-center" id="exportar-pendencias">EXPORTAR CÓPIA JSON</button>
      </div>
    </div>`;
    const listaPendencias = modal.querySelector("#lista-pendencias");
    for (const registro of registros) {
      const linhaPendencia = document.createElement("div");
      linhaPendencia.className = "pendencia-item";
      const detalhesPendencia = document.createElement("p");
      detalhesPendencia.className = "pendencia-detalhes";
      const erro = registro.ultimo_erro;
      const diagnostico = erro
        ? ` | erro: ${erro.code || "DESCONHECIDO"}${erro.status ? ` (HTTP ${erro.status})` : ""} | ${mensagemErro(erro, "")}${erro.request_id ? ` | request: ${erro.request_id}` : ""}${erro.ocorrido_em ? ` | em: ${new Date(erro.ocorrido_em).toLocaleString("pt-BR")}` : ""}`
        : "";
      detalhesPendencia.textContent = `${registro.id_externo} | ${registro.estado} | tentativas: ${registro.tentativas} | caixa: ${registro.payload.caixa_id || "desconhecido"}${diagnostico}`;
      linhaPendencia.appendChild(detalhesPendencia);
      if (registro.payload.usuario_origem_id === estadoPdv.usuarioAtual?.id) {
        const botaoReenviar = document.createElement("button");
        botaoReenviar.className = "btn-action btn-reenviar-pendencia";
        botaoReenviar.textContent = "Reenviar mesma operação";
        botaoReenviar.onclick = async () => {
          botaoReenviar.disabled = true;
          try {
            await reenviarOperacao(
              registro.id_externo,
              estadoPdv.usuarioAtual.id,
            );
            await processarFilaVendas({ notificarFalhas: true });
            await abrirReconciliacao();
          } catch (erroReenvio) {
            showToast(mensagemErro(erroReenvio));
            botaoReenviar.disabled = false;
          }
        };
        linhaPendencia.appendChild(botaoReenviar);
      }
      listaPendencias.appendChild(linhaPendencia);
    }
    modal.querySelector("#fechar-pendencias").onclick = () =>
      fecharModal(modal.id);
    modal.querySelector("#exportar-pendencias").onclick = () => {
      const arquivoExportacao = new Blob(
        [
          JSON.stringify(
            { exportado_em: new Date().toISOString(), operacoes: registros },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      );
      const urlExportacao = URL.createObjectURL(arquivoExportacao);
      const linkExportacao = document.createElement("a");
      linkExportacao.href = urlExportacao;
      linkExportacao.download = "operacoes-pendentes.json";
      linkExportacao.click();
      URL.revokeObjectURL(urlExportacao);
    };
    abrirModal(modal.id);
  } catch (erroReconciliacao) {
    showToast(
      `Reconciliação indisponível: ${mensagemErro(erroReconciliacao)}. Preserve os dados locais.`,
    );
  }
}

export function sincronizarProdutosEmSegundoPlano() {
  if (
    estadoPdv.filaVendas.length > 0 ||
    document.hidden ||
    navigator.onLine === false
  )
    return;
  API.getProdutos()
    .then((dadosProdutos) => {
      if (dadosProdutos && dadosProdutos.produtos) {
        dadosProdutos.produtos.forEach((produtoAtualizado) => {
          const produtoLocal = estadoPdv.produtos.find(
            (produto) => produto.id === produtoAtualizado.id,
          );
          if (produtoLocal) {
            produtoLocal.estoque_bar = produtoAtualizado.estoque_bar;
            produtoLocal.estoque_deposito = produtoAtualizado.estoque_deposito;
            if (produtoAtualizado.itens_combo)
              produtoLocal.itens_combo = produtoAtualizado.itens_combo;
          }
        });
        renderizarCatalogo();
      }
    })
    .catch((erroSincronizacaoProdutos) =>
      console.warn(
        "Erro na sincronização silenciosa:",
        erroSincronizacaoProdutos,
      ),
    );
}
