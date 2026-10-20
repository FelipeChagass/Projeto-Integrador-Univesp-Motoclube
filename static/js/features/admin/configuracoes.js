/**
 * Carrega e salva configurações globais do painel via requests.js.
 * Não confundir com preferências locais de impressão em pdv/actions/sessao.js.
 */
import { BASE, authFetch } from "./requests.js";
import { toast } from "./ui.js";

export async function carregarConfig() {
  const resposta = await authFetch(`${BASE}/api/admin/config`);
  if (!resposta) return;
  const dadosResposta = await resposta.json();
  const configuracoes = dadosResposta.config || {};
  document.getElementById("cfg-imprimir").value =
    configuracoes.imprimir_automatico ? "true" : "false";
  document.getElementById("cfg-largura").value =
    configuracoes.largura_impressao || "ticket-80mm";
}

export async function salvarConfig() {
  const dados = {
    imprimir_automatico:
      document.getElementById("cfg-imprimir").value === "true",
    largura_impressao: document.getElementById("cfg-largura").value,
  };
  const resposta = await authFetch(`${BASE}/api/admin/config`, {
    method: "PUT",
    body: JSON.stringify(dados),
  });
  if (!resposta) return;
  const dadosResposta = await resposta.json();
  toast(dadosResposta.mensagem, dadosResposta.status === "ok");
}
