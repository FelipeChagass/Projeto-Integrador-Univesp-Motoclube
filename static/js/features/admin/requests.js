/**
 * Adaptador do painel sobre o cliente HTTP compartilhado, sem duplicar autenticação.
 * Exibe falhas e retorna null; consumidores devem interromper o fluxo nesse caso.
 */
import { API } from "../../shared/api.js";
import { toast } from "./ui.js";

export const BASE = "";

export async function authFetch(url, opcoes = {}) {
  try {
    const dadosResposta = await API.request(
      opcoes.method || "GET",
      url.replace(/^\/api/, ""),
      opcoes.body ? JSON.parse(opcoes.body) : undefined,
    );
    return { json: async () => dadosResposta };
  } catch (erro) {
    toast(erro.message || "Operação não concluída.", false);
    // Every caller checks this sentinel before committing a UI success state.
    return null;
  }
}
