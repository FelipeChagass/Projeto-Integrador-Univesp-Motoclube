/**
 * Pagamento, troco e criação de operações duráveis de venda/recebimento.
 * Persiste na fila antes de limpar o carrinho ou imprimir; sincronizacao.js obtém o ACK.
 */
import { estadoPdv, salvarDadosLocais } from "../state.js";
import { formatCurrency } from "../../../shared/utils.js";
import {
  showToast,
  fecharModal,
  abrirModal,
  atualizarUI,
  renderizarCatalogo,
} from "../ui.js";
import { montarImpressao } from "../reports.js";
import {
  novoIdExterno,
  persistirOperacao,
  listarOperacoes,
} from "../offline-queue.js";
import { processarFilaVendas } from "./sincronizacao.js";

/* ─── Payment ─── */

export function iniciarPagamento(metodoPagamento) {
  if (!estadoPdv.operadorAtual) return showToast("Faça login primeiro.");
  if (!estadoPdv.caixaAberto)
    return showToast("Necessário realizar a Abertura de Caixa!");
  if (!estadoPdv.carrinho || !estadoPdv.carrinho.length)
    return showToast("Carrinho Vazio!");
  const nomeVisitante = document.getElementById("input-cliente").value;
  const totalCarrinho = estadoPdv.carrinho.reduce(
    (totalAcumulado, itemCarrinho) =>
      totalAcumulado + Number(itemCarrinho.preco) * Number(itemCarrinho.qtd),
    0,
  );
  prepararPagamentoGlobal(
    "VENDA",
    totalCarrinho,
    metodoPagamento,
    nomeVisitante || "BALCÃO",
  );
}

export function iniciarLiquidacao(metodoPagamento) {
  if (!estadoPdv.operadorAtual) return showToast("Faça login primeiro.");
  if (!estadoPdv.caixaAberto)
    return showToast("Necessário realizar a Abertura de Caixa!");
  if (
    !estadoPdv.dadosFechamentoAtual ||
    estadoPdv.dadosFechamentoAtual.total === 0
  )
    return showToast("Nada a pagar.");
  fecharModal("modal-fechar-conta");
  prepararPagamentoGlobal(
    "DIVIDA",
    estadoPdv.dadosFechamentoAtual.total,
    metodoPagamento,
    estadoPdv.dadosFechamentoAtual.nome,
  );
}

export function prepararPagamentoGlobal(
  tipoPagamento,
  valorTotal,
  metodoPagamento,
  dadosPagamento,
) {
  estadoPdv.pagamentoPendente = {
    tipo: tipoPagamento,
    valorTotal,
    dados: dadosPagamento,
  };
  if (metodoPagamento === "DINHEIRO") {
    document.getElementById("valor-total-dinheiro").innerText =
      `Total: ${formatCurrency(valorTotal)}`;
    document.getElementById("valor-recebido").value = "";
    document.getElementById("display-troco").innerText = "Troco: R$ 0,00";
    document.getElementById("btn-confirmar-dinheiro").style.opacity = "0.5";
    document.getElementById("btn-confirmar-dinheiro").style.pointerEvents =
      "none";
    abrirModal("modal-dinheiro");
    document.getElementById("valor-recebido").focus();
  } else if (metodoPagamento === "CARTAO") {
    abrirModal("modal-cartao");
  } else {
    executarPagamentoFinal(metodoPagamento);
  }
}

export function calcularTroco() {
  const valorRecebido =
    parseFloat(
      document.getElementById("valor-recebido").value.replace(",", "."),
    ) || 0;
  const troco = valorRecebido - estadoPdv.pagamentoPendente.valorTotal;
  const indicadorTroco = document.getElementById("display-troco");
  const botaoConfirmarDinheiro = document.getElementById(
    "btn-confirmar-dinheiro",
  );
  if (troco >= 0) {
    indicadorTroco.innerText = `Troco: ${formatCurrency(troco)}`;
    indicadorTroco.style.color = "var(--success)";
    botaoConfirmarDinheiro.style.opacity = "1";
    botaoConfirmarDinheiro.style.pointerEvents = "auto";
  } else {
    indicadorTroco.innerText = `Faltam: ${formatCurrency(Math.abs(troco))}`;
    indicadorTroco.style.color = "var(--danger)";
    botaoConfirmarDinheiro.style.opacity = "0.5";
    botaoConfirmarDinheiro.style.pointerEvents = "none";
  }
}

export function finalizarPagamentoDinheiro() {
  fecharModal("modal-dinheiro");
  executarPagamentoFinal("DINHEIRO");
}

export function finalizarPagamentoCartao(tipoCartao) {
  fecharModal("modal-cartao");
  executarPagamentoFinal(`CARTÃO - ${tipoCartao}`);
}

/* ─── Sales ─── */

export async function registrarVendaOtimista(
  metodoPagamento,
  nomeCliente,
  membroId = null,
) {
  try {
    if (estadoPdv.enviandoVenda) return;
    if (
      !estadoPdv.caixaAberto ||
      !estadoPdv.caixaId ||
      !estadoPdv.usuarioAtual?.id ||
      !estadoPdv.carrinho.length
    ) {
      return showToast(
        "Confirme login, caixa aberto e itens antes de registrar a venda.",
      );
    }
    estadoPdv.enviandoVenda = true;
    nomeCliente = nomeCliente || "CLIENTE";
    const totalVenda = estadoPdv.carrinho.reduce(
      (totalAcumulado, itemCarrinho) =>
        totalAcumulado + Number(itemCarrinho.preco) * Number(itemCarrinho.qtd),
      0,
    );
    const vendaId = novoIdExterno();
    const novaVenda = {
      id_externo: vendaId,
      usuario_origem_id: estadoPdv.usuarioAtual.id,
      membro_id: membroId,
      itens: JSON.parse(JSON.stringify(estadoPdv.carrinho)),
      total: totalVenda,
      metodo: metodoPagamento,
      cliente: nomeCliente,
      caixa_id: estadoPdv.caixaId,
      dataHora: new Date().toISOString(),
    };
    // Never clear the cart or print until the durable transaction is committed.
    await persistirOperacao(novaVenda);
    estadoPdv.filaVendas = await listarOperacoes();
    if (estadoPdv.produtos) {
      novaVenda.itens.forEach((itemVenda) => {
        const produtoEncontrado = estadoPdv.produtos.find(
          (produto) =>
            produto.id == itemVenda.id && produto.nome == itemVenda.nome,
        );
        if (produtoEncontrado)
          produtoEncontrado.estoque_bar =
            Number(produtoEncontrado.estoque_bar) - itemVenda.qtd;
      });
    }
    try {
      if (estadoPdv.config.imprimir) {
        montarImpressao(novaVenda.itens, metodoPagamento, nomeCliente);
        setTimeout(() => window.print(), 1000);
      }
    } catch (erroImpressao) {
      console.error("Erro Impressão", erroImpressao);
    }

    estadoPdv.carrinho = [];
    const campoCliente = document.getElementById("input-cliente");
    if (campoCliente) campoCliente.value = "";
    salvarDadosLocais();
    renderizarCatalogo();
    atualizarUI();
    showToast(
      "Venda salva neste dispositivo. Aguardando confirmação do servidor.",
    );
    await processarFilaVendas({ notificarFalhas: true });
  } catch (erroRegistroVenda) {
    estadoPdv.enviandoVenda = false;
    showToast(`Erro ao registrar venda: ${erroRegistroVenda.message}`);
    console.error(erroRegistroVenda);
  } finally {
    estadoPdv.enviandoVenda = false;
  }
}

export async function executarPagamentoFinal(metodoPagamentoFinal) {
  const indicadorCarregamento = document.getElementById("loading");
  if (indicadorCarregamento) indicadorCarregamento.style.display = "none";
  if (estadoPdv.enviandoVenda) return;
  estadoPdv.enviandoVenda = true;

  if (estadoPdv.pagamentoPendente.tipo === "VENDA") {
    estadoPdv.enviandoVenda = false;
    return registrarVendaOtimista(
      metodoPagamentoFinal,
      estadoPdv.pagamentoPendente.dados,
    );
  } else if (estadoPdv.pagamentoPendente.tipo === "DIVIDA") {
    if (indicadorCarregamento) indicadorCarregamento.style.display = "flex";
    try {
      if (
        !estadoPdv.usuarioAtual?.id ||
        !estadoPdv.caixaId ||
        !estadoPdv.dadosFechamentoAtual?.membro_id
      )
        throw new Error("Selecione um membro e confirme o caixa.");
      const operacoesExistentes = await listarOperacoes();
      const pagamentoExistente = operacoesExistentes.find(
        (operacao) =>
          operacao.payload.tipo_operacao === "pagamento" &&
          operacao.payload.membro_id ===
            estadoPdv.dadosFechamentoAtual.membro_id,
      );
      if (pagamentoExistente)
        throw new Error(
          "Já existe um recebimento pendente deste membro. Consulte Operações pendentes para reenviar a mesma operação.",
        );
      const pagamento = {
        id_externo: novoIdExterno(),
        tipo_operacao: "pagamento",
        usuario_origem_id: estadoPdv.usuarioAtual.id,
        caixa_id: estadoPdv.caixaId,
        membro_id: estadoPdv.dadosFechamentoAtual.membro_id,
        metodo: metodoPagamentoFinal,
        saldo_esperado: estadoPdv.dadosFechamentoAtual.total,
        valor: estadoPdv.pagamentoPendente.valorTotal,
      };
      await persistirOperacao(pagamento);
      fecharModal("modal-fechar-conta");
      await processarFilaVendas({ notificarFalhas: true });
    } catch (erroPagamento) {
      showToast(`Pagamento não confirmado: ${erroPagamento.message}`);
    } finally {
      estadoPdv.enviandoVenda = false;
      if (indicadorCarregamento) indicadorCarregamento.style.display = "none";
    }
  }
}
