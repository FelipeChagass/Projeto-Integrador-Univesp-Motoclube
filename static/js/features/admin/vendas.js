/**
 * Filtros e renderização do histórico administrativo de vendas.
 * Usa requests/ui; limites de consulta são definidos pela API, não pelo DOM.
 */
import { BASE, authFetch } from "./requests.js";
import {
  esc,
  mostrarEsqueleto,
  toast,
  CLASSES_TABELA as T,
  badge,
} from "./ui.js";
import { htmlAcoes, ACAO } from "./acoes-linha.js";
import { criarCsv } from "./csv.js";
import { mensagemErro } from "../../shared/utils.js";

function filtrosVendas(limite) {
  const campoDataInicio = document.getElementById("vendas-data-inicio");
  const campoDataFim = document.getElementById("vendas-data-fim");
  if (
    !campoDataInicio.dataset.inicializado &&
    !campoDataInicio.value &&
    !campoDataFim.value
  ) {
    const hoje = new Date();
    const anoMes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
    campoDataInicio.value = `${anoMes}-01`;
    campoDataFim.value = `${anoMes}-${new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate()}`;
  }
  campoDataInicio.dataset.inicializado = "true";
  const parametrosConsulta = new URLSearchParams();
  if (campoDataInicio.value)
    parametrosConsulta.set("data_inicio", campoDataInicio.value);
  if (campoDataFim.value)
    parametrosConsulta.set("data_fim", campoDataFim.value);
  const tipo = document.getElementById("vendas-tipo").value;
  if (tipo) parametrosConsulta.set("tipo_venda", tipo);
  parametrosConsulta.set("limite", String(limite));
  return parametrosConsulta;
}

export async function exportarVendasCsv() {
  const botao = document.getElementById("btn-exportar-vendas");
  if (botao.disabled) return;
  botao.disabled = true;
  try {
    const parametrosConsulta = filtrosVendas(500);
    const vendas = new Map();
    let deslocamentoPagina = 0;
    while (true) {
      parametrosConsulta.set("offset", String(deslocamentoPagina));
      const resposta = await authFetch(
        `${BASE}/api/admin/vendas?${parametrosConsulta}`,
      );
      if (!resposta) return;
      const dadosResposta = await resposta.json();
      for (const venda of dadosResposta.vendas || [])
        vendas.set(venda.id, venda);
      if (!dadosResposta.paginacao?.tem_mais) break;
      if (!dadosResposta.vendas?.length)
        throw new Error("Não foi possível concluir a exportação.");
      deslocamentoPagina += dadosResposta.vendas.length;
    }
    const url = URL.createObjectURL(
      new Blob([criarCsv([...vendas.values()])], {
        type: "text/csv;charset=utf-8;",
      }),
    );
    const linkDownload = document.createElement("a");
    linkDownload.href = url;
    linkDownload.download = `vendas-${parametrosConsulta.get("data_inicio") || "inicio"}-${parametrosConsulta.get("data_fim") || "hoje"}.csv`;
    document.body.appendChild(linkDownload);
    linkDownload.click();
    linkDownload.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (erro) {
    toast(mensagemErro(erro, "Não foi possível exportar as vendas."), false);
  } finally {
    botao.disabled = false;
  }
}

export async function carregarVendas() {
  mostrarEsqueleto("tabelaVendas");
  const parametrosConsulta = filtrosVendas(200);

  const resposta = await authFetch(
    `${BASE}/api/admin/vendas?${parametrosConsulta}`,
  );
  if (!resposta) return;
  const dadosResposta = await resposta.json();
  const vendas = dadosResposta.vendas || [];

  const total = vendas.reduce(
    (totalAcumulado, venda) => totalAcumulado + venda.valor_total,
    0,
  );
  const resumoVendas = document.getElementById("vendas-resumo");
  const cartaoResumo = (valor, rotulo) =>
    `<div class="card flex-fill flex-sm-grow-0 px-4 py-3 text-center text-sm-start"><span class="resumo-numero">${valor}</span><span class="small text-uppercase mt-1">${rotulo}</span></div>`;
  resumoVendas.innerHTML =
    cartaoResumo(vendas.length, "Vendas") +
    cartaoResumo(`R$ ${total.toFixed(2)}`, "Total");

  const corpoTabela = document.getElementById("tabelaVendas");
  corpoTabela.innerHTML = "";
  vendas.forEach((venda) => {
    const linhaVenda = document.createElement("tr");
    linhaVenda.className = T.linha;
    const dataFormatada = venda.criado_em
      ? new Date(venda.criado_em).toLocaleString("pt-BR")
      : "—";
    const descricaoItens =
      (venda.itens || [])
        .map(
          (itemVenda) => `${itemVenda.quantidade}x ${itemVenda.nome_produto}`,
        )
        .join(", ") || "—";
    const tomTipo =
      venda.tipo_venda === "fiado"
        ? "aviso"
        : venda.tipo_venda === "recebimento_divida"
          ? "info"
          : "sucesso";
    linhaVenda.innerHTML = `
            <td class="${T.celula}" data-label="Data">${dataFormatada}</td>
            <td class="${T.celula}" data-label="Tipo">${badge(venda.tipo_venda, tomTipo)}</td>
            <td class="${T.celula}" data-label="Método">${venda.metodo_pagamento}</td>
            <td class="${T.celula}" data-label="Operador">${esc(venda.usuario_nome || "—")}</td>
            <td class="${T.celula}" data-label="Cliente">${esc(venda.nome_cliente || "—")}</td>
            <td class="${T.celula} fw-semibold" data-label="Valor">R$ ${venda.valor_total.toFixed(2)}</td>
            <td class="${T.celula}" data-label="Itens">${esc(descricaoItens)}</td>
            <td class="${T.celulaAcoes}">${htmlAcoes(
              { id: venda.id, nome: `de ${dataFormatada}` },
              {
                editar: ACAO.editar("editar"),
                excluir: ACAO.excluir("excluir"),
              },
            )}</td>`;
    corpoTabela.appendChild(linhaVenda);
  });
}
