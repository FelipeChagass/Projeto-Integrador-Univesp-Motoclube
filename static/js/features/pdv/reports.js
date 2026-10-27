import { API } from "../../shared/api.js";
import { UIModal } from "../../shared/modals.js";
import { estadoPdv, salvarDadosLocais } from "./state.js";
import { mensagemErro, esc, formatCurrency } from "../../shared/utils.js";
import {
  showToast,
  fecharModal,
  abrirModal,
  atualizarUI,
  renderizarCatalogo,
  atualizarEstadoBotoes,
  mostrarCarregamento,
} from "./ui.js";
import { possuiPendenciasCaixa } from "./offline-queue.js";
import { temCategoriaCombo, descricaoCombo } from "../../shared/combos.js";

/* ─── Reports ─── */

export function abrirMenuRelatorios() {
  if (!estadoPdv.operadorAtual) return showToast("Faça login primeiro.");
  abrirModal("modal-relatorios");
  document.getElementById("resultado-relatorio").classList.add("d-none");
  document.getElementById("nome-operador-atual").innerText =
    estadoPdv.operadorAtual;
  const hoje = new Date();
  const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  document.getElementById("data-inicio").value = primeiroDia
    .toISOString()
    .split("T")[0];
  document.getElementById("data-fim").value = hoje.toISOString().split("T")[0];
}

export function gerarRelatorio(tipoRelatorio) {
  mostrarCarregamento(true);
  let filtroRelatorio = {};
  if (tipoRelatorio === "TURNO") {
    filtroRelatorio = {
      operador: estadoPdv.operadorAtual,
      inicio: estadoPdv.inicioTurno
        ? estadoPdv.inicioTurno.toString()
        : new Date().toString(),
      caixa_id: estadoPdv.caixaId,
    };
  }
  estadoPdv.tipoRelatorioAtual = tipoRelatorio;
  executarRelatorio(tipoRelatorio, filtroRelatorio);
}

export function gerarRelatorioPeriodo() {
  const dataInicio = document.getElementById("data-inicio").value;
  const dataFim = document.getElementById("data-fim").value;
  if (!dataInicio || !dataFim) return showToast("Selecione as datas.");
  mostrarCarregamento(true);
  estadoPdv.tipoRelatorioAtual = "PERIODO";
  executarRelatorio("PERIODO", { inicio: dataInicio, fim: dataFim });
}

export function executarRelatorio(tipoRelatorio, filtroRelatorio) {
  document.getElementById("resultado-relatorio").innerHTML = "";
  document.getElementById("resultado-relatorio").classList.add("d-none");
  return API.gerarRelatorioCaixa(tipoRelatorio, filtroRelatorio)
    .then((dadosRelatorio) => {
      estadoPdv.dadosRelatorioAtual = dadosRelatorio;
      mostrarCarregamento(false);
      if (!dadosRelatorio)
        return showToast("Erro: O relatório retornou vazio.");
      document.getElementById("resultado-relatorio").classList.remove("d-none");

      const saldoInicial = Number(dadosRelatorio.abertura) || 0;
      const totalDinheiro = Number(dadosRelatorio.dinheiro) || 0;
      const totalPix = Number(dadosRelatorio.pix) || 0;
      const totalCartao = Number(dadosRelatorio.cartao) || 0;
      const recebimentoDivida = Number(dadosRelatorio.recebimentoDivida) || 0;
      const vendasFiado = Number(dadosRelatorio.vendasFiado) || 0;
      if (
        dadosRelatorio.totalEntradas == null ||
        !Number.isFinite(Number(dadosRelatorio.totalEntradas))
      )
        throw new Error("Total do relatório ausente.");
      const totalEntradas = Number(dadosRelatorio.totalEntradas);
      const totalGeralCaixa = totalEntradas + saldoInicial;

      let htmlCupom = `
                <div class="cupom-visual">
                    <div style="text-align:center; font-weight:bold; margin-bottom:10px; border-bottom:1px dashed #000; padding-bottom:5px;">
                        RELATÓRIO DE CAIXA<br>${esc(dadosRelatorio.periodo)}
                    </div>
                    <div style="border-bottom:1px dashed #555; padding:5px 0; font-weight:bold; color:var(--accent);">RESUMO FINANCEIRO</div>
                    <div class="relatorio-linha"><span>(+) Fundo de Caixa:</span><span>${formatCurrency(saldoInicial)}</span></div>
                    <div class="relatorio-linha"><span>(+) Entradas Dinheiro:</span><span>${formatCurrency(totalDinheiro)}</span></div>
                    <div class="relatorio-linha"><span>(+) Entradas Pix:</span><span>${formatCurrency(totalPix)}</span></div>
                    <div class="relatorio-linha"><span>(+) Entradas Cartão:</span><span>${formatCurrency(totalCartao)}</span></div>
                    <div class="relatorio-linha"><span>Receb. Dívidas (já incluídos):</span><span>${formatCurrency(recebimentoDivida)}</span></div>
                    <div class="relatorio-linha" style="border-top:1px solid #777; margin-top:5px; padding-top:5px; font-weight:bold; font-size:1.1em; color:var(--success);">
                        <span>(=) TOTAL EM CAIXA:</span><span>${formatCurrency(totalGeralCaixa)}</span>
                    </div>
                    <div style="border-bottom:1px dashed #555; padding:5px 0; margin-top:15px; font-weight:bold; color:var(--danger);">MOVIMENTAÇÃO FIADO</div>
                    <div class="relatorio-linha"><span>(>) Total Vendido Fiado:</span><span>${formatCurrency(vendasFiado)}</span></div>`;

      if (
        dadosRelatorio.produtosVendidos &&
        typeof dadosRelatorio.produtosVendidos === "object"
      ) {
        const nomesProdutosVendidos = Object.keys(
          dadosRelatorio.produtosVendidos,
        );
        if (nomesProdutosVendidos.length > 0) {
          htmlCupom += `<br><div style="text-align:center; font-weight:bold; border-bottom:1px dashed #000;">ITENS VENDIDOS</div>
                        <table style="width:100%; font-size:0.9em; margin-top:5px;">`;
          for (const nomeProduto in dadosRelatorio.produtosVendidos) {
            htmlCupom += `<tr><td>${esc(nomeProduto)}</td><td style="text-align:right">${dadosRelatorio.produtosVendidos[nomeProduto]}</td></tr>`;
          }
          htmlCupom += "</table>";
        }
      }
      if (
        dadosRelatorio.historico &&
        Array.isArray(dadosRelatorio.historico) &&
        dadosRelatorio.historico.length > 0
      ) {
        htmlCupom += `<br><div style="text-align:center; font-weight:bold; border-bottom:1px dashed #000; margin-top:10px;">${dadosRelatorio.historico_truncado ? "HISTÓRICO PARCIAL — totais incluem todo o período" : "HISTÓRICO COMPLETO"}</div>
                    <table style="width:100%; font-size:0.8em; margin-top:5px; border-collapse: collapse;">
                    <tr style="background:#ddd; font-weight:bold;"><td style="padding:2px;">Hora</td><td style="padding:2px;">Desc.</td><td style="padding:2px;">Valor</td></tr>`;
        dadosRelatorio.historico.forEach((movimentacao) => {
          const metodoPagamento = movimentacao.metodo || "";
          const corMovimentacao = metodoPagamento.includes("FIADO")
            ? "red"
            : movimentacao.tipo === "RECEBIMENTO"
              ? "green"
              : "inherit";
          htmlCupom += `<tr style="border-bottom:1px solid #eee; color:${corMovimentacao}">
                        <td style="padding:2px;">${esc(movimentacao.hora || "")}</td>
                        <td style="padding:2px;">${esc(movimentacao.descricao || "")}</td>
                        <td style="padding:2px; text-align:right">${Number(movimentacao.valor).toFixed(2)}</td></tr>`;
        });
        htmlCupom += "</table>";
      }
      htmlCupom += "</div>";

      const elementoResultadoRelatorio = document.getElementById(
        "resultado-relatorio",
      );
      elementoResultadoRelatorio.innerHTML = `${htmlCupom}<br><button id="btn-imprimir-rel" class="btn-action w-100">IMPRIMIR RELATORIO</button>`;
      document
        .getElementById("btn-imprimir-rel")
        .addEventListener("click", imprimirRelatorioAtual);

      if (tipoRelatorio === "TURNO" || tipoRelatorio === "DIA") {
        const botaoFechamento = document.createElement("button");
        botaoFechamento.id = "btn-confirmar-fechamento";
        botaoFechamento.className = "btn-action w-100 mt-2";
        botaoFechamento.textContent = "CONFIRMAR FECHAMENTO E SAIR";
        botaoFechamento.addEventListener("click", confirmarFechamentoCaixa);
        elementoResultadoRelatorio.appendChild(botaoFechamento);
      }
    })
    .catch((erroRelatorio) => {
      mostrarCarregamento(false);
      showToast(`Erro ao gerar relatório: ${mensagemErro(erroRelatorio)}`);
    });
}

/* ─── Cash Register Closing ─── */

export function confirmarFechamentoCaixa() {
  if (!estadoPdv.caixaId) return showToast("Nenhum caixa aberto identificado.");
  document.getElementById("input-valor-fechamento").value = "";
  document.getElementById("input-obs-fechamento").value = "";
  abrirModal("modal-fechar-caixa");
  document.getElementById("input-valor-fechamento").focus();
}

function redirect(urlDestino) {
  if (typeof globalThis.redirect === "function") {
    globalThis.redirect(urlDestino);
  } else {
    window.location.replace(urlDestino);
  }
}

export async function executarFechamentoCaixa() {
  const valorFechamentoInformado = document.getElementById(
    "input-valor-fechamento",
  ).value;
  const observacaoFechamento = document
    .getElementById("input-obs-fechamento")
    .value.trim();
  const valorFechamento =
    valorFechamentoInformado !== ""
      ? parseFloat(valorFechamentoInformado)
      : null;
  if (
    valorFechamento !== null &&
    (isNaN(valorFechamento) || valorFechamento < 0)
  ) {
    return showToast("Informe um valor em caixa válido.");
  }

  try {
    if (await possuiPendenciasCaixa(estadoPdv.caixaId))
      return showToast(
        "Existem operações pendentes deste caixa. Sincronize ou reconcilie antes de fechar.",
      );
  } catch (erroConsultaPendencias) {
    return showToast(
      `Não foi possível verificar pendências: ${mensagemErro(erroConsultaPendencias)}`,
    );
  }

  mostrarCarregamento(true);

  return API.fecharCaixa(
    estadoPdv.caixaId,
    valorFechamento,
    observacaoFechamento || null,
  )
    .then((respostaFechamento) => {
      if (
        respostaFechamento?.status !== "ok" ||
        respostaFechamento.caixa_id !== estadoPdv.caixaId
      )
        throw new Error("Servidor não confirmou este fechamento.");
      fecharModal("modal-fechar-caixa");
      estadoPdv.caixaAberto = false;
      estadoPdv.valorAbertura = 0;
      estadoPdv.caixaId = null;
      estadoPdv.operadorAtual = "";
      estadoPdv.usuarioAtual = null;
      estadoPdv.inicioTurno = null;
      estadoPdv.carrinho = [];
      atualizarUI();
      fecharModal("modal-relatorios");
      atualizarEstadoBotoes();
      return API.logout();
    })
    .then(() => {
      mostrarCarregamento(false);
      redirect("/login");
    })
    .catch((erroFechamentoCaixa) => {
      mostrarCarregamento(false);
      console.error("Erro ao fechar caixa no servidor:", erroFechamentoCaixa);
      showToast(`Erro ao fechar caixa: ${mensagemErro(erroFechamentoCaixa)}`);
    });
}

/* ─── Printing ─── */

export function imprimirArea() {
  window.focus();
  setTimeout(() => window.print(), 1500);
}

export function montarImpressao(itensVenda, metodoPagamento, nomeCliente) {
  const areaImpressao = document.getElementById("area-impressao");
  let htmlImpressao = "";
  const horarioImpressao = new Date().toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const logotipoHtml =
    '<div style="text-align:center; margin-bottom:10px"><img src="/static/img/motorhead.svg" style="width:70px; height:70px; "></div>';
  const nomeClienteEscapado = esc(nomeCliente.toUpperCase());

  itensVenda.forEach((itemVenda) => {
    const produtoEncontrado = estadoPdv.produtos.find(
      (produto) => produto.id == itemVenda.id,
    );
    const categoriaProduto = produtoEncontrado
      ? produtoEncontrado.categoria
      : "";
    const itensCombo = temCategoriaCombo(produtoEncontrado)
      ? produtoEncontrado.itens_combo || []
      : [];
    const produtoComida =
      (categoriaProduto && categoriaProduto.toUpperCase() === "COMIDA") ||
      itensCombo.some(
        (itemCombo) =>
          String(itemCombo.categoria || "").toUpperCase() === "COMIDA",
      );
    // O ticket do combo é a ficha de entrega: o bar precisa ver cada item.
    const composicaoHtml = itensCombo.length
      ? `<span class="ticket-obs">${esc(descricaoCombo(itensCombo).toUpperCase())}</span>`
      : "";
    const observacaoHtml =
      composicaoHtml +
      (itemVenda.obs
        ? `<span class="ticket-obs">${esc(itemVenda.obs.toUpperCase())}</span>`
        : "");
    for (
      let indiceUnidade = 0;
      indiceUnidade < itemVenda.qtd;
      indiceUnidade++
    ) {
      htmlImpressao += `<div class="ticket ${estadoPdv.config.largura}">${logotipoHtml}
                <div class="ticket-content">
                    <div class="ticket-header">MOTORHEAD • ${esc(horarioImpressao)}</div>
                    <span class="ticket-item">${esc(itemVenda.nome)}</span>
                    ${observacaoHtml}
                    <div class="ticket-info">CLI: <b>${nomeClienteEscapado}</b> | ${esc(metodoPagamento)}</div>
                    ${produtoComida ? '<div style="font-size:0.8em; margin-top:5px">VIA CLIENTE</div>' : ""}
                </div></div>`;
      if (produtoComida) {
        htmlImpressao += `<div class="ticket ${estadoPdv.config.largura}">${logotipoHtml}
                    <div class="ticket-content">
                        <div class="ticket-header">COZINHA • ${esc(horarioImpressao)}</div>
                        <span class="ticket-item">${esc(itemVenda.nome)}</span>
                        ${observacaoHtml}
                        <div class="ticket-info">CLI: <b>${nomeClienteEscapado}</b></div>
                        <div style="font-size:0.9em; margin-top:5px; font-weight:bold">VIA COZINHA</div>
                    </div></div>`;
      }
    }
  });
  areaImpressao.innerHTML = htmlImpressao;
}

export function imprimirRelatorioAtual() {
  if (!estadoPdv.dadosRelatorioAtual) return;
  const areaImpressao = document.getElementById("area-impressao");
  const saldoInicial = Number(estadoPdv.dadosRelatorioAtual.abertura) || 0;

  const totalDinheiro = Number(estadoPdv.dadosRelatorioAtual.dinheiro) || 0;
  const totalPix = Number(estadoPdv.dadosRelatorioAtual.pix) || 0;
  const totalCartao = Number(estadoPdv.dadosRelatorioAtual.cartao) || 0;
  const recebimentoDivida =
    Number(estadoPdv.dadosRelatorioAtual.recebimentoDivida) || 0;
  const totalGeral =
    Number(estadoPdv.dadosRelatorioAtual.totalEntradas) + saldoInicial;
  if (!Number.isFinite(totalGeral))
    return showToast("Total do relatório inválido.");

  let htmlHistorico = "";
  if (
    estadoPdv.dadosRelatorioAtual.historico &&
    estadoPdv.dadosRelatorioAtual.historico.length > 0
  ) {
    htmlHistorico =
      '<br><div style="border-bottom:1px dashed black; font-weight:bold; text-align:center">EXTRATO DETALHADO</div>';
    estadoPdv.dadosRelatorioAtual.historico.forEach((movimentacao) => {
      const indicadorFiado = movimentacao.metodo.includes("FIADO") ? "(!)" : "";
      let horarioExibicao = "";
      if (movimentacao.data)
        horarioExibicao = movimentacao.data.split(" ")[1] || movimentacao.data;
      else if (movimentacao.hora)
        horarioExibicao = movimentacao.hora.split(" ")[1] || movimentacao.hora;
      else if (movimentacao.dataHora)
        horarioExibicao =
          movimentacao.dataHora.split(" ")[1] || movimentacao.dataHora;
      htmlHistorico += `<div style="font-size:0.8em; border-bottom:1px dotted #ccc; margin-bottom:2px;">
                ${esc(horarioExibicao)} ${esc(movimentacao.descricao.substring(0, 15))}... ${indicadorFiado}
                <br><div style="text-align:right">${Number(movimentacao.valor).toFixed(2)} (${esc(movimentacao.metodo.substring(0, 3))})</div></div>`;
    });
  }
  areaImpressao.innerHTML = `<div class="sheet-a4">
        <div class="ticket-header">RELATÓRIO DE CAIXA</div>
        <div class="ticket-header" style="font-size:1em">${esc(estadoPdv.dadosRelatorioAtual.periodo)}</div>
        <div style="border-bottom:1px solid black; margin:10px 0"></div>
        <div style="text-align:left; font-weight:bold; margin-top:5px;">RESUMO FINANCEIRO</div>
        <div class="relatorio-linha"><span>(+) Saldo Inicial:</span><span>${formatCurrency(saldoInicial)}</span></div>
        <div class="relatorio-linha"><span>(+) Dinheiro:</span><span>${formatCurrency(totalDinheiro)}</span></div>
        <div class="relatorio-linha"><span>(+) Pix:</span><span>${formatCurrency(totalPix)}</span></div>
        <div class="relatorio-linha"><span>(+) Cartão:</span><span>${formatCurrency(totalCartao)}</span></div>
        <div class="relatorio-linha"><span>Receb. Dívidas (já incluídos):</span><span>${formatCurrency(recebimentoDivida)}</span></div>
        <div style="border-top:1px solid black; margin:5px 0"></div>
        <div class="relatorio-linha" style="font-weight:bold; font-size:1.3em"><span>(=) TOTAL CAIXA:</span><span>${formatCurrency(totalGeral)}</span></div>
        <div style="border-bottom:1px dashed black; margin:10px 0"></div>
        <div style="text-align:left; font-weight:bold;">MOVIMENTAÇÃO FIADO</div>
        <div class="relatorio-linha"><span>(>) Total Vendido Fiado:</span><span>${formatCurrency(estadoPdv.dadosRelatorioAtual.vendasFiado)}</span></div>
        ${htmlHistorico}
        <br><br><br>
        <div style="border-top:1px solid black; width:60%; margin:0 auto"></div>
        <div style="text-align:center; font-size:0.8em; margin-top:5px">Assinatura Responsável</div>
    </div>`;
  imprimirArea();
}

export function montarImpressaoFechamento(dadosFechamento) {
  const areaImpressao = document.getElementById("area-impressao");
  const horarioImpressao = new Date().toLocaleTimeString("pt-BR");
  const logotipoHtml =
    '<div style="text-align:center; margin-bottom:10px"><img src="/static/img/motorhead.svg" style="width:70px; height:70px; "></div>';
  let itensHtml = "";
  dadosFechamento.itens.forEach((itemFechamento) => {
    itensHtml += `<div class="extrato-print-item"><span>${itemFechamento.qtd}x ${esc(itemFechamento.produto)}</span><span>${itemFechamento.valor.toFixed(2)}</span></div>`;
  });
  areaImpressao.innerHTML = `<div class="ticket ${estadoPdv.config.largura}">${logotipoHtml}
        <div class="ticket-content">
            <div class="ticket-header">RECIBO PAGAMENTO</div>
            <div class="ticket-header">MOTORHEAD</div>
            <div style="border-bottom:1px solid black; margin:5px 0"></div>
            <div>Membro: <b>${esc(dadosFechamento.nome.toUpperCase())}</b></div>
            <div>Data: ${esc(horarioImpressao)}</div>
            <div style="margin-top:10px">${itensHtml}</div>
            <div class="extrato-print-total">TOTAL PAGO: ${formatCurrency(dadosFechamento.total)}</div>
            <div style="text-align:right; font-size:0.9em; margin-top:5px">Forma: ${esc(dadosFechamento.metodo || "DINHEIRO")}</div>
            <div style="text-align:center; margin-top:10px; font-size:0.8em">Conta Quitada</div>
        </div></div>`;
}
