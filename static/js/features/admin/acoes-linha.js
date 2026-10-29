/**
 * Coluna "Ações" das tabelas do admin. As ações universais (editar, excluir) são botões só
 * com ícone; as específicas de cada cadastro (estoque, extrato, reativar...) ficam no menu
 * "Mais ações", com texto, porque um ícone sozinho não diz qual ajuste é.
 * Só monta HTML: os cliques chegam aos handlers pela delegação de events.js
 * (data-action + data-id + data-nome), inclusive os itens do menu.
 */
import { esc } from "./ui.js";

/**
 * O menu usa posicionamento fixed: dentro de .table-responsive (overflow) um menu absoluto
 * seria cortado pela borda da tabela.
 */
const CONFIG_MENU = esc(
  JSON.stringify({ popperConfig: { strategy: "fixed" } }),
);

function atributos({ acao, id, nome }) {
  return `data-action="${acao}" data-id="${esc(String(id))}" data-nome="${esc(nome)}"`;
}

function botaoIcone({ acao, rotulo, icone, perigo }, registro) {
  return `<button type="button" class="btn ${perigo ? "btn-excluir" : "btn-escuro"} btn-icone d-inline-flex align-items-center justify-content-center"
                ${atributos({ acao, ...registro })} aria-label="${rotulo} ${esc(registro.nome)}" title="${rotulo}">
                <i class="bi ${icone}" aria-hidden="true"></i></button>`;
}

function itemMenu({ acao, rotulo, icone, perigo }, registro) {
  return `<li><button type="button" class="dropdown-item d-flex align-items-center gap-2 py-2${perigo ? " text-danger" : ""}"
                ${atributos({ acao, ...registro })}><i class="bi ${icone}" aria-hidden="true"></i>${rotulo}</button></li>`;
}

/**
 * @param {{id: (number|string), nome: string}} registro identifica a linha nos handlers.
 * @param {object} acoes editar e excluir: {acao, rotulo, icone}; mais: lista para o menu.
 */
export function htmlAcoes(registro, { editar, excluir, mais = [] }) {
  const menu = mais.length
    ? `<div class="dropdown">
            <button type="button" class="btn btn-escuro btn-icone d-inline-flex align-items-center justify-content-center"
                data-bs-toggle="dropdown" data-bs-config="${CONFIG_MENU}" aria-expanded="false"
                aria-label="Mais ações para ${esc(registro.nome)}" title="Mais ações">
                <i class="bi bi-three-dots-vertical" aria-hidden="true"></i></button>
            <ul class="dropdown-menu dropdown-menu-end">${mais.map((acao) => itemMenu(acao, registro)).join("")}</ul>
        </div>`
    : "";
  return `<div class="d-flex flex-wrap justify-content-md-center gap-2">
            ${editar ? botaoIcone(editar, registro) : ""}
            ${menu}
            ${excluir ? botaoIcone({ ...excluir, perigo: true }, registro) : ""}
        </div>`;
}

/** Ações recorrentes, com o mesmo rótulo e ícone em todas as tabelas. */
export const ACAO = {
  editar: (acao) => ({ acao, rotulo: "Editar", icone: "bi-pencil" }),
  excluir: (acao) => ({ acao, rotulo: "Excluir", icone: "bi-trash3" }),
  reativar: (acao) => ({
    acao,
    rotulo: "Reativar",
    icone: "bi-arrow-counterclockwise",
  }),
};
