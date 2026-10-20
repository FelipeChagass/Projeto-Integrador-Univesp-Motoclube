import { prepararEdicao } from "./edicao-linha.js";
import { administrarMovimento } from "./financeiro.js";
/**
 * Cadastro de membros, extratos e ajustes de saldo do painel administrativo.
 * Exporta membros como binding vivo para a carga sob demanda em navigation.js.
 */
import { UIModal } from "../../shared/modals.js";
import { BASE, authFetch } from "./requests.js";
import { fecharModalAdmin, esc, toast, mostrarSkeleton } from "./ui.js";
import { criarConsultaExtrato } from "../../shared/extrato-membro.js";
import { API } from "../../shared/api.js";

export let membros = [];
let ajusteMembroId = null;
const consultasExtrato = new WeakMap();

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
  mostrarSkeleton("tabelaMembros", 4);
  const resposta = await authFetch(`${BASE}/api/admin/membros`);
  if (!resposta) return;
  const dadosResposta = await resposta.json();
  const incluirInativos = document.getElementById(
    "mostrarMembrosInativos",
  ).checked;
  membros = (dadosResposta.membros || []).filter(
    (membro) => incluirInativos || membro.ativo,
  );
  renderMembros();
}

export function renderMembros() {
  const corpoTabela = document.getElementById("tabelaMembros");
  corpoTabela.innerHTML = "";
  membros.forEach((membro) => {
    const linhaMembro = document.createElement("tr");
    if (!membro.ativo) linhaMembro.classList.add("row-inactive");
    const classeSaldo = membro.saldo_devedor > 0 ? "saldo-devedor" : "saldo-ok";
    linhaMembro.innerHTML = `
            <td data-label="Nome"><input value="${esc(membro.nome)}" data-mid="${membro.id}" data-campo="nome"></td>
            <td class="${classeSaldo}" data-label="Saldo Devedor">R$ ${membro.saldo_devedor.toFixed(2)}</td>
            <td class="col-status" data-label="Status">${membro.ativo ? '<span class="badge badge-active">Ativo</span>' : '<span class="badge badge-inactive">Inativo</span>'}</td>
            <td data-label="Ações"><div class="btn-group">
                <button class="btn btn-save btn-sm" data-action="salvar-membro" data-id="${membro.id}">Salvar</button>
                <button class="btn btn-sm" data-action="ver-extrato" data-id="${membro.id}" data-nome="${esc(membro.nome)}">Extrato</button>
                <button class="btn btn-warn btn-sm" data-action="ajuste-saldo" data-id="${membro.id}" data-nome="${esc(membro.nome)}">Ajuste</button>
                <button class="btn btn-del btn-sm" data-action="excluir-membro" data-id="${membro.id}" data-nome="${esc(membro.nome)}">Excluir</button> ${!membro.ativo ? `<button class="btn btn-reativar btn-sm" data-action="reativar-membro" data-id="${membro.id}">Reativar</button>` : ""}
            </div></td>`;
    prepararEdicao(linhaMembro);
    corpoTabela.appendChild(linhaMembro);
  });
}

export function abrirFormNovoMembro() {
  document.getElementById("formNovoMembro").classList.remove("d-none");
  document.body.classList.add("modal-open");
  document.getElementById("novo-membro-nome").value = "";
  document.getElementById("novo-membro-nome").focus();
}

export async function criarNovoMembro() {
  const nome = document.getElementById("novo-membro-nome").value.trim();
  if (!nome) return toast("Nome é obrigatório", false);
  const resposta = await authFetch(`${BASE}/api/admin/membros`, {
    method: "POST",
    body: JSON.stringify({ nome }),
  });
  if (!resposta) return;
  const dadosResposta = await resposta.json();
  toast(dadosResposta.mensagem, dadosResposta.status === "ok");
  if (dadosResposta.status === "ok") {
    document.getElementById("formNovoMembro").classList.add("d-none");
    document.body.classList.remove("modal-open");
    carregarMembros();
  }
}

export async function salvarMembro(id) {
  const campoNome = document.querySelector(
    `[data-mid="${id}"][data-campo="nome"]`,
  );
  if (!campoNome) return;
  const resposta = await authFetch(`${BASE}/api/admin/membros/${id}`, {
    method: "PUT",
    body: JSON.stringify({ nome: campoNome.value }),
  });
  if (!resposta) return;
  const dadosResposta = await resposta.json();
  toast(dadosResposta.mensagem, dadosResposta.status === "ok");
  if (dadosResposta.status === "ok") carregarMembros();
}

export async function excluirMembro(id, nome) {
  UIModal.confirm(
    `Excluir definitivamente membro "${nome}"?`,
    async function () {
      const resposta = await authFetch(`${BASE}/api/admin/membros/${id}`, {
        method: "DELETE",
      });
      if (!resposta) return;
      const dadosResposta = await resposta.json();
      toast(dadosResposta.mensagem, dadosResposta.status === "ok");
      if (dadosResposta.status === "ok") carregarMembros();
    },
  );
}

export async function reativarMembro(id) {
  const resposta = await authFetch(`${BASE}/api/admin/membros/${id}`, {
    method: "PUT",
    body: JSON.stringify({ ativo: true }),
  });
  if (!resposta) return;
  const dadosResposta = await resposta.json();
  toast(dadosResposta.mensagem, dadosResposta.status === "ok");
  if (dadosResposta.status === "ok") carregarMembros();
}

export async function verExtrato(id, nome) {
  document.getElementById("extrato-titulo").textContent = `Extrato — ${nome}`;
  document.getElementById("modalExtrato").classList.remove("d-none");
  document.getElementById("modalExtrato").classList.remove("closing");
  document.body.classList.add("modal-open");
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

export function abrirAjusteSaldo(id, nome) {
  ajusteMembroId = id;
  document.getElementById("ajuste-membro-nome").textContent = nome;
  document.getElementById("ajuste-valor").value = "";
  document.getElementById("ajuste-descricao").value = "";
  document.getElementById("ajuste-tipo").value = "credito";
  document.getElementById("modalAjuste").classList.remove("d-none");
  document.body.classList.add("modal-open");
}

export async function confirmarAjusteSaldo() {
  const valor = parseFloat(document.getElementById("ajuste-valor").value) || 0;
  const tipo = document.getElementById("ajuste-tipo").value;
  const descricao = document.getElementById("ajuste-descricao").value;
  if (valor <= 0) return toast("Valor deve ser positivo", false);
  const resposta = await authFetch(
    `${BASE}/api/admin/membros/${ajusteMembroId}/ajuste`,
    { method: "POST", body: JSON.stringify({ valor, tipo, descricao }) },
  );
  if (!resposta) return;
  const dadosResposta = await resposta.json();
  toast(dadosResposta.mensagem, dadosResposta.status === "ok");
  if (dadosResposta.status === "ok") {
    fecharModalAdmin("modalAjuste");
    carregarMembros();
  }
}
