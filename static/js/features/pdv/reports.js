import { API } from "../../shared/api.js";
import { UIModal } from "../../shared/modals.js";
import { estadoPdv, salvarDadosLocais } from "./state.js";
import {
  mensagemErro,
  esc,
  formatCurrency,
  formatarValor,
  dataLocalISO,
} from "../../shared/utils.js";
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
  document.getElementById("data-inicio").value = dataLocalISO(
    new Date(hoje.getFullYear(), hoje.getMonth(), 1),
  );
  document.getElementById("data-fim").value = dataLocalISO(hoje);
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
                    <div class="text-center fw-bold mb-2 pb-1 border-bottom border-black cupom-tracejado">
                        RELATÓRIO DE CAIXA<br>${esc(dadosRelatorio.periodo)}
                    </div>
                    <div class="py-1 fw-bold border-bottom border-secondary cupom-tracejado cupom-secao-resumo">RESUMO FINANCEIRO</div>
                    <div class="relatorio-linha"><span>(+) Fundo de Caixa:</span><span>${formatCurrency(saldoInicial)}</span></div>
                    <div class="relatorio-linha"><span>(+) Entradas Dinheiro:</span><span>${formatCurrency(totalDinheiro)}</span></div>
                    <div class="relatorio-linha"><span>(+) Entradas Pix:</span><span>${formatCurrency(totalPix)}</span></div>
                    <div class="relatorio-linha"><span>(+) Entradas Cartão:</span><span>${formatCurrency(totalCartao)}</span></div>
                    <div class="relatorio-linha"><span>Receb. Dívidas (já incluídos):</span><span>${formatCurrency(recebimentoDivida)}</span></div>
                    <div class="relatorio-linha relatorio-total border-top border-secondary mt-1 pt-1 fw-bold">
                        <span>(=) TOTAL EM CAIXA:</span><span>${formatCurrency(totalGeralCaixa)}</span>
                    </div>
                    <div class="py-1 mt-3 fw-bold border-bottom border-secondary cupom-tracejado cupom-secao-fiado">MOVIMENTAÇÃO FIADO</div>
                    <div class="relatorio-linha"><span>(>) Total Vendido Fiado:</span><span>${formatCurrency(vendasFiado)}</span></div>`;

      if (
        dadosRelatorio.produtosVendidos &&
        typeof dadosRelatorio.produtosVendidos === "object"
      ) {
        const nomesProdutosVendidos = Object.keys(
          dadosRelatorio.produtosVendidos,
        );
        if (nomesProdutosVendidos.length > 0) {
          htmlCupom += `<br><div class="text-center fw-bold border-bottom border-black cupom-tracejado">ITENS VENDIDOS</div>
                        <table class="w-100 small mt-1">`;
          for (const nomeProduto in dadosRelatorio.produtosVendidos) {
            htmlCupom += `<tr><td>${esc(nomeProduto)}</td><td class="text-end">${dadosRelatorio.produtosVendidos[nomeProduto]}</td></tr>`;
          }
          htmlCupom += "</table>";
        }
      }
      if (
        dadosRelatorio.historico &&
        Array.isArray(dadosRelatorio.historico) &&
        dadosRelatorio.historico.length > 0
      ) {
        htmlCupom += `<br><div class="text-center fw-bold mt-2 border-bottom border-black cupom-tracejado">${dadosRelatorio.historico_truncado ? "HISTÓRICO PARCIAL — totais incluem todo o período" : "HISTÓRICO COMPLETO"}</div>
                    <table class="w-100 cupom-pequeno mt-1">
                    <tr class="fw-bold bg-secondary-subtle"><td class="p-1">Hora</td><td class="p-1">Desc.</td><td class="p-1">Valor</td></tr>`;
        dadosRelatorio.historico.forEach((movimentacao) => {
          const metodoPagamento = movimentacao.metodo || "";
          const corMovimentacao = metodoPagamento.includes("FIADO")
            ? " text-danger"
            : movimentacao.tipo === "RECEBIMENTO"
              ? " text-success"
              : "";
          htmlCupom += `<tr class="border-bottom border-light${corMovimentacao}">
                        <td class="p-1">${esc(movimentacao.hora || "")}</td>
                        <td class="p-1">${esc(movimentacao.descricao || "")}</td>
                        <td class="p-1 text-end">${formatarValor(movimentacao.valor)}</td></tr>`;
        });
        htmlCupom += "</table>";
      }
      htmlCupom += "</div>";

      const elementoResultadoRelatorio = document.getElementById(
        "resultado-relatorio",
      );
      elementoResultadoRelatorio.innerHTML = `${htmlCupom}<button type="button" id="btn-imprimir-rel" class="btn btn-escuro btn-lg w-100 mt-3">IMPRIMIR RELATÓRIO</button>`;
      document
        .getElementById("btn-imprimir-rel")
        .addEventListener("click", imprimirRelatorioAtual);

      if (tipoRelatorio === "TURNO" || tipoRelatorio === "DIA") {
        const botaoFechamento = document.createElement("button");
        botaoFechamento.id = "btn-confirmar-fechamento";
        botaoFechamento.type = "button";
        botaoFechamento.className = "btn btn-primary btn-lg w-100 mt-2";
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
    '<div class="text-center mb-2"><img src="/static/img/motorhead.svg" alt="" width="70" height="70"></div>';
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
                    ${produtoComida ? '<div class="cupom-pequeno mt-1">VIA CLIENTE</div>' : ""}
                </div></div>`;
      if (produtoComida) {
        htmlImpressao += `<div class="ticket ${estadoPdv.config.largura}">${logotipoHtml}
                    <div class="ticket-content">
                        <div class="ticket-header">COZINHA • ${esc(horarioImpressao)}</div>
                        <span class="ticket-item">${esc(itemVenda.nome)}</span>
                        ${observacaoHtml}
                        <div class="ticket-info">CLI: <b>${nomeClienteEscapado}</b></div>
                        <div class="small mt-1 fw-bold">VIA COZINHA</div>
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
      '<br><div class="fw-bold text-center border-bottom border-black cupom-tracejado">EXTRATO DETALHADO</div>';
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
      htmlHistorico += `<div class="cupom-pequeno border-bottom border-secondary-subtle cupom-pontilhado mb-1">
                ${esc(horarioExibicao)} ${esc(movimentacao.descricao.substring(0, 15))}... ${indicadorFiado}
                <br><div class="text-end">${formatarValor(movimentacao.valor)} (${esc(movimentacao.metodo.substring(0, 3))})</div></div>`;
    });
  }
  areaImpressao.innerHTML = `<div class="sheet-a4">
        <div class="ticket-header">RELATÓRIO DE CAIXA</div>
        <div class="ticket-header">${esc(estadoPdv.dadosRelatorioAtual.periodo)}</div>
        <div class="border-bottom border-black my-2"></div>
        <div class="text-start fw-bold mt-1">RESUMO FINANCEIRO</div>
        <div class="relatorio-linha"><span>(+) Saldo Inicial:</span><span>${formatCurrency(saldoInicial)}</span></div>
        <div class="relatorio-linha"><span>(+) Dinheiro:</span><span>${formatCurrency(totalDinheiro)}</span></div>
        <div class="relatorio-linha"><span>(+) Pix:</span><span>${formatCurrency(totalPix)}</span></div>
        <div class="relatorio-linha"><span>(+) Cartão:</span><span>${formatCurrency(totalCartao)}</span></div>
        <div class="relatorio-linha"><span>Receb. Dívidas (já incluídos):</span><span>${formatCurrency(recebimentoDivida)}</span></div>
        <div class="border-top border-black my-1"></div>
        <div class="relatorio-linha relatorio-total-grande fw-bold"><span>(=) TOTAL CAIXA:</span><span>${formatCurrency(totalGeral)}</span></div>
        <div class="border-bottom border-black cupom-tracejado my-2"></div>
        <div class="text-start fw-bold">MOVIMENTAÇÃO FIADO</div>
        <div class="relatorio-linha"><span>(>) Total Vendido Fiado:</span><span>${formatCurrency(estadoPdv.dadosRelatorioAtual.vendasFiado)}</span></div>
        ${htmlHistorico}
        <br><br><br>
        <div class="assinatura-linha border-top border-black mx-auto"></div>
        <div class="text-center cupom-pequeno mt-1">Assinatura Responsável</div>
    </div>`;
  imprimirArea();
}

export function montarImpressaoFechamento(dadosFechamento) {
  const areaImpressao = document.getElementById("area-impressao");
  const horarioImpressao = new Date().toLocaleTimeString("pt-BR");
  const logotipoHtml =
    '<div class="text-center mb-2"><img src="/static/img/motorhead.svg" alt="" width="70" height="70"></div>';
  let itensHtml = "";
  dadosFechamento.itens.forEach((itemFechamento) => {
    itensHtml += `<div class="extrato-print-item"><span>${itemFechamento.qtd}x ${esc(itemFechamento.produto)}</span><span>${formatarValor(itemFechamento.valor)}</span></div>`;
  });
  areaImpressao.innerHTML = `<div class="ticket ${estadoPdv.config.largura}">${logotipoHtml}
        <div class="ticket-content">
            <div class="ticket-header">RECIBO PAGAMENTO</div>
            <div class="ticket-header">MOTORHEAD</div>
            <div class="border-bottom border-black my-1"></div>
            <div>Membro: <b>${esc(dadosFechamento.nome.toUpperCase())}</b></div>
            <div>Data: ${esc(horarioImpressao)}</div>
            <div class="mt-2">${itensHtml}</div>
            <div class="extrato-print-total">TOTAL PAGO: ${formatCurrency(dadosFechamento.total)}</div>
            <div class="text-end small mt-1">Forma: ${esc(dadosFechamento.metodo || "DINHEIRO")}</div>
            <div class="text-center mt-2 cupom-pequeno">Conta Quitada</div>
        </div></div>`;
}
