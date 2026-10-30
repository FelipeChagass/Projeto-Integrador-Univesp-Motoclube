/**
 * Carrega e salva configurações globais do painel via requests.js.
 * Não confundir com preferências locais de impressão em pdv/actions/sessao.js.
 */
import { requisitar } from "./requests.js";
import { toast } from "./ui.js";

export async function carregarConfig() {
  const dadosResposta = await requisitar("GET", `/admin/config`);
  if (!dadosResposta) return;
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
  const dadosResposta = await requisitar("PUT", `/admin/config`, dados);
  if (!dadosResposta) return;
  toast(dadosResposta.mensagem, dadosResposta.status === "ok");
}
