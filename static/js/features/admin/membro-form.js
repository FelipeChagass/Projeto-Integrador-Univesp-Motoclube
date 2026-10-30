/**
 * Painéis de membro (templates/admin/paineis/membros.html): cadastro, edição do nome e
 * ajuste manual de saldo. O saldo em si é calculado pelo backend a partir das movimentações;
 * o ajuste só registra um crédito ou débito com descrição.
 */
import { requisitar } from "./requests.js";
import { toast, avisarCampo } from "./ui.js";
import { abrirPainel, fecharPainel } from "./painel.js";
import { buscarMembro, carregarMembros } from "./membros.js";

const PAINEL_MEMBRO = "painel-membro";
const PAINEL_SALDO = "painel-saldo";
let membroEmEdicao = null;
let membroDoAjuste = null;

export function abrirNovoMembro() {
  membroEmEdicao = null;
  document.getElementById("membro-nome").value = "";
  abrirPainel(PAINEL_MEMBRO, {
    titulo: "Novo membro",
    aoSalvar: salvarMembro,
  });
}

export function abrirEdicaoMembro(id) {
  const membro = buscarMembro(id);
  if (!membro) return;
  membroEmEdicao = membro;
  document.getElementById("membro-nome").value = membro.nome;
  abrirPainel(PAINEL_MEMBRO, {
    titulo: "Editar membro",
    complemento: membro.nome,
    aoSalvar: salvarMembro,
  });
}

export async function salvarMembro() {
  const nome = document.getElementById("membro-nome").value.trim();
  if (!nome) return avisarCampo("membro-nome", "Informe o nome do membro.");
  const dadosResposta = await requisitar(
    membroEmEdicao ? "PUT" : "POST",
    membroEmEdicao ? `/admin/membros/${membroEmEdicao.id}` : `/admin/membros`,
    { nome },
  );
  if (!dadosResposta) return;
  toast(dadosResposta.mensagem, dadosResposta.status === "ok");
  if (dadosResposta.status === "ok") {
    fecharPainel(PAINEL_MEMBRO);
    carregarMembros();
  }
}

export function abrirAjusteSaldo(id) {
  const membro = buscarMembro(id);
  if (!membro) return;
  membroDoAjuste = membro;
  document.getElementById("ajuste-tipo").value = "credito";
  document.getElementById("ajuste-valor").value = "";
  document.getElementById("ajuste-descricao").value = "";
  abrirPainel(PAINEL_SALDO, {
    complemento: membro.nome,
    aoSalvar: confirmarAjusteSaldo,
  });
}

export async function confirmarAjusteSaldo() {
  if (!membroDoAjuste) return;
  const valor = parseFloat(document.getElementById("ajuste-valor").value) || 0;
  const tipo = document.getElementById("ajuste-tipo").value;
  const descricao = document.getElementById("ajuste-descricao").value;
  if (valor <= 0)
    return avisarCampo("ajuste-valor", "O valor deve ser maior que zero.");
  const dadosResposta = await requisitar(
    "POST",
    `/admin/membros/${membroDoAjuste.id}/ajuste`,
    { valor, tipo, descricao },
  );
  if (!dadosResposta) return;
  toast(dadosResposta.mensagem, dadosResposta.status === "ok");
  if (dadosResposta.status === "ok") {
    fecharPainel(PAINEL_SALDO);
    carregarMembros();
  }
}
