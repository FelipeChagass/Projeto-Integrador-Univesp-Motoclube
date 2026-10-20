/**
 * Seleção de membro, extrato e preparação de venda fiada no PDV.
 * Reutiliza pagamentos.js; identidade financeira é membro_id, nunca apenas o nome.
 */
import { API } from "../../../shared/api.js";
import { estadoPdv } from "../state.js";
import { esc, formatCurrency } from "../../../shared/utils.js";
import { showToast, fecharModal, abrirModal } from "../ui.js";
import { registrarVendaOtimista } from "./pagamentos.js";
import { criarConsultaExtrato } from "../../../shared/extrato-membro.js";

const consultasExtratoPorElemento = new WeakMap();
function consultaMembro() {
  const elementoExtrato = document.getElementById("pdv-extrato-membro");
  if (!elementoExtrato) return null;
  if (!consultasExtratoPorElemento.has(elementoExtrato))
    consultasExtratoPorElemento.set(
      elementoExtrato,
      criarConsultaExtrato(elementoExtrato, {
        buscar: (membroId, filtrosExtrato) =>
          API.buscarExtratoMembro(membroId, filtrosExtrato),
        notificar: (mensagem) => showToast(mensagem),
      }),
    );
  return consultasExtratoPorElemento.get(elementoExtrato);
}

/* ─── Members ─── */

export function verificarDividaSelecionada() {
  return consultaMembro()?.selecionar(
    document.getElementById("select-membro").value,
  );
}

export function abrirModalMembros(tipoContexto) {
  if (!estadoPdv.operadorAtual) return showToast("Faça login primeiro.");
  if (
    tipoContexto === "FIADO" &&
    (!estadoPdv.carrinho || estadoPdv.carrinho.length === 0)
  )
    return showToast("Carrinho vazio!");
  estadoPdv.contextoMembro = tipoContexto;
  consultaMembro()?.selecionar(null);
  const previaDivida = document.getElementById("preview-divida");
  if (previaDivida) {
    previaDivida.innerText = "";
    previaDivida.style.color = "var(--text-secondary)";
  }
  abrirModal("modal-selecionar-membro");
  buscarMembrosFrescos("select-membro");
}

export function buscarMembrosFrescos(seletorMembrosId) {
  const seletorMembros = document.getElementById(seletorMembrosId);
  seletorMembros.innerHTML =
    '<option value="" disabled selected>Carregando...</option>';
  API.getListaMembros()
    .then((membrosRecebidos) => {
      estadoPdv.membros = Array.isArray(membrosRecebidos)
        ? membrosRecebidos
        : [];
      popularSelectMembros(seletorMembrosId);
    })
    .catch((erroBuscaMembros) => {
      console.error("Erro ao buscar membros:", erroBuscaMembros);
      estadoPdv.membros = [];
      popularSelectMembros(seletorMembrosId);
    });
}

export function popularSelectMembros(seletorMembrosId) {
  const seletorMembros = document.getElementById(seletorMembrosId);
  seletorMembros.innerHTML = "";
  const opcaoPadrao = document.createElement("option");
  opcaoPadrao.value = "";
  opcaoPadrao.text = "Toque para selecionar...";
  opcaoPadrao.disabled = true;
  opcaoPadrao.selected = true;
  seletorMembros.appendChild(opcaoPadrao);
  const membrosValidos = Array.isArray(estadoPdv.membros)
    ? estadoPdv.membros
    : [];
  [...membrosValidos]
    .sort((membroAnterior, membroSeguinte) =>
      (membroAnterior.nome || "").localeCompare(membroSeguinte.nome || ""),
    )
    .forEach((membro) => {
      if (membro && membro.nome) {
        const opcaoMembro = document.createElement("option");
        opcaoMembro.value = membro.id;
        opcaoMembro.innerText = membro.nome;
        seletorMembros.appendChild(opcaoMembro);
      }
    });
}

export function confirmarSelecaoMembro() {
  try {
    const membroId = document.getElementById("select-membro").value;
    const membro = estadoPdv.membros.find(
      (membroCandidato) => membroCandidato.id === membroId,
    );
    if (!membro) return showToast("Por favor, selecione um membro na lista.");
    consultaMembro()?.selecionar(null);
    fecharModal("modal-selecionar-membro");
    const previaDivida = document.getElementById("preview-divida");
    if (previaDivida) previaDivida.innerText = "";
    if (estadoPdv.contextoMembro === "FIADO")
      registrarVendaOtimista("FIADO", membro.nome, membro.id);
    else if (estadoPdv.contextoMembro === "FECHAR_CONTA")
      carregarDadosFechamento(membro);
    else showToast("Ação indefinida.");
  } catch (erroSelecaoMembro) {
    showToast(`Erro na seleção: ${erroSelecaoMembro.message}`);
  }
}

export function fecharModalSelecaoMembro() {
  consultaMembro()?.selecionar(null);
  fecharModal("modal-selecionar-membro");
  const previaDivida = document.getElementById("preview-divida");
  if (previaDivida) previaDivida.innerText = "";
}

export function carregarDadosFechamento(membro) {
  abrirModal("modal-fechar-conta");
  document.getElementById("nome-fechar-conta").innerText = membro.nome;
  document.getElementById("lista-fechamento").innerHTML = "Buscando...";
  API.buscarExtratoMembro(membro.id)
    .then((extratoMembro) => {
      estadoPdv.dadosFechamentoAtual = {
        nome: membro.nome,
        membro_id: membro.id,
        itens: extratoMembro.itens,
        total: extratoMembro.total,
      };
      let htmlFechamento = "";
      if (!extratoMembro.itens.length) {
        htmlFechamento = '<p style="text-align:center">Sem pendências.</p>';
      } else {
        extratoMembro.itens.forEach((itemExtrato) => {
          htmlFechamento += `<div class="extrato-item">
                        <span>${itemExtrato.qtd || 1}x ${esc(itemExtrato.produto || itemExtrato.descricao || "Item")}</span>
                        <span>${formatCurrency(itemExtrato.valor)}</span></div>`;
        });
      }
      document.getElementById("lista-fechamento").innerHTML = htmlFechamento;
      document.getElementById("total-fechamento").innerText = formatCurrency(
        extratoMembro.total,
      );
    })
    .catch(() => {
      showToast("Erro ao buscar dados.");
      fecharModal("modal-fechar-conta");
    });
}
