/**
 * Requisições do painel sobre o cliente HTTP compartilhado (shared/api.js), sem duplicar
 * autenticação. Em falha mostra o motivo em um toast e devolve null: o chamador deve parar
 * e nunca exibir sucesso nem recarregar como se a gravação tivesse ocorrido.
 */
import { API } from "../../shared/api.js";
import { toast } from "./ui.js";
import { mensagemErro } from "../../shared/utils.js";

/**
 * @param {string} metodo GET, POST, PUT ou DELETE.
 * @param {string} caminho caminho da API sem o prefixo /api (ex.: "/admin/produtos").
 * @param {object} [corpo] enviado como JSON.
 * @returns {Promise<object|null>} dados da resposta, ou null se a operação falhou.
 */
export async function requisitar(metodo, caminho, corpo) {
  try {
    return await API.request(metodo, caminho, corpo);
  } catch (erro) {
    toast(mensagemErro(erro, "Operação não concluída."), false);
    return null;
  }
}
