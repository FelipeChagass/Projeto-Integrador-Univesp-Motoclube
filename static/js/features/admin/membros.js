/**
 * Membros no painel: lista, tabela (linhas só de leitura), extrato e as ações de linha que
 * não precisam de formulário (excluir, reativar). Cadastro, edição e ajuste de saldo ficam
 * em membro-form.js. Exporta membros como binding vivo para a carga sob demanda em navigation.js.
 */
import { administrarMovimento } from "./financeiro.js";
import { UIModal } from "../../shared/modals.js";
import { requisitar } from "./requests.js";
import {
  abrirModalAdmin,
  esc,
  toast,
  mostrarEsqueleto,
  CLASSES_TABELA as T,
  badgeStatus,
} from "./ui.js";
import { htmlAcoes, ACAO } from "./acoes-linha.js";
import { criarConsultaExtrato } from "../../shared/extrato-membro.js";
import { formatCurrency } from "../../shared/utils.js";
import { API } from "../../shared/api.js";

export let membros = [];
const consultasExtrato = new WeakMap();

export function buscarMembro(id) {
  return membros.find((membro) => String(membro.id) === String(id));
}

export function atualizarExtratoAberto() {
  const modal = document.getElementById("modalExtrato");
  if (
    modal &&
    !modal.classList.contains("d-none") &&
    !modal.classList.contains("closing")
  ) {
    return consultasExtrato
      .get(document.getElementById("extrato-body"))
      ?.atualizar();
  }
}

export async function carregarMembros() {
  mostrarEsqueleto("tabelaMembros");
  const dadosResposta = await requisitar("GET", `/admin/membros`);
  if (!dadosResposta) return;
  const incluirInativos = document.getElementById(
    "mostrarMembrosInativos",
  ).checked;
  membros = (dadosResposta.membros || []).filter(
    (membro) => incluirInativos || membro.ativo,
  );
  renderizarMembros();
}

export function renderizarMembros() {
  const corpoTabela = document.getElementById("tabelaMembros");
  corpoTabela.innerHTML = "";
  membros.forEach((membro) => {
    const linhaMembro = document.createElement("tr");
    linhaMembro.className = T.linha;
    if (!membro.ativo) linhaMembro.classList.add("opacity-50");
    const classeSaldo =
      membro.saldo_devedor > 0
        ? "text-danger fw-bold"
        : "text-success fw-semibold";
    linhaMembro.innerHTML = `
            <td class="${T.celula} fw-semibold" data-label="Nome">${esc(membro.nome)}</td>
            <td class="${T.celula} ${classeSaldo}" data-label="Saldo Devedor">${formatCurrency(membro.saldo_devedor)}</td>
            <td class="${T.celulaStatus}" data-label="Status">${badgeStatus(membro.ativo)}</td>
            <td class="${T.celulaAcoes}">${htmlAcoes(
              { id: membro.id, nome: membro.nome },
              {
                editar: ACAO.editar("editar-membro"),
                excluir: ACAO.excluir("excluir-membro"),
                mais: [
                  {
                    acao: "ver-extrato",
                    rotulo: "Ver extrato",
                    icone: "bi-receipt",
                  },
                  {
                    acao: "ajuste-saldo",
                    rotulo: "Ajustar saldo",
                    icone: "bi-cash-coin",
                  },
                  ...(membro.ativo ? [] : [ACAO.reativar("reativar-membro")]),
                ],
              },
            )}</td>`;
    corpoTabela.appendChild(linhaMembro);
  });
}

export async function excluirMembro(id, nome) {
  UIModal.confirm(
    `Excluir definitivamente membro "${nome}"?`,
    async function () {
      const dadosResposta = await requisitar("DELETE", `/admin/membros/${id}`);
      if (!dadosResposta) return;
      toast(dadosResposta.mensagem, dadosResposta.status === "ok");
      if (dadosResposta.status === "ok") carregarMembros();
    },
  );
}

export async function reativarMembro(id) {
  const dadosResposta = await requisitar("PUT", `/admin/membros/${id}`, {
    ativo: true,
  });
  if (!dadosResposta) return;
  toast(dadosResposta.mensagem, dadosResposta.status === "ok");
  if (dadosResposta.status === "ok") carregarMembros();
}

export async function verExtrato(id, nome) {
  document.getElementById("extrato-membro-nome").textContent = nome;
  abrirModalAdmin("modalExtrato");
  const conteinerExtrato = document.getElementById("extrato-body");
  if (!consultasExtrato.has(conteinerExtrato))
    consultasExtrato.set(
      conteinerExtrato,
      criarConsultaExtrato(conteinerExtrato, {
        // A consulta trata o erro após validar a geração; evita toasts de requisições antigas.
        buscar: (membroId, filtros) =>
          API.request(
            "GET",
            `/admin/membros/${encodeURIComponent(membroId)}/extrato?${new URLSearchParams(filtros)}`,
            undefined,
          ),
        notificar: (mensagem) => toast(mensagem, false),
        administrar: administrarMovimento,
      }),
    );
  return consultasExtrato.get(conteinerExtrato).selecionar(id);
}
