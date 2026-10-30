/**
 * Primitivas visuais do painel: escape de HTML, toast, skeleton e fechamento de modais.
 * Não consulta a API nem mantém estado dos cadastros.
 */

export {
  abrirModalAdmin,
  fecharModalAdmin,
  configurarModaisAdmin,
} from "./dialogos.js";

/** Escape de HTML único do projeto (PDV e painel), reexportado para os módulos do admin. */
import { esc } from "../../shared/utils.js";
export { esc };

/** Validação de formulário: mostra o aviso e leva o foco ao campo que precisa ser corrigido. */
export function avisarCampo(idCampo, mensagem) {
  toast(mensagem, false);
  document.getElementById(idCampo)?.focus();
}

export function toast(mensagem, sucesso) {
  const notificacao = document.getElementById("toast");
  notificacao.textContent = mensagem;
  notificacao.className = "toast show " + (sucesso ? "ok" : "err");
  setTimeout(() => (notificacao.className = "toast"), 3500);
}

/**
 * Classes das tabelas do painel (static/css/admin/tabela.css): tabela no desktop e um
 * cartão por linha no celular. Cada célula leva data-label, que vira o rótulo no cartão.
 */
export const CLASSES_TABELA = {
  linha: "d-flex flex-column d-md-table-row mb-3 mb-md-0",
  celula: "d-flex flex-column align-items-start gap-1 d-md-table-cell",
  celulaStatus:
    "d-flex align-items-center justify-content-between d-md-table-cell",
  celulaImagem: "sem-rotulo d-flex flex-column d-md-table-cell p-0 p-md-3",
  celulaAcoes: "sem-rotulo d-md-table-cell py-3",
};

const BADGES = {
  sucesso: "bg-success-subtle text-success-emphasis border-success-subtle",
  perigo: "bg-danger-subtle text-danger-emphasis border-danger-subtle",
  aviso: "bg-warning-subtle text-warning-emphasis border-warning-subtle",
  info: "bg-info-subtle text-info-emphasis border-info-subtle",
};

/** Badge suave do Bootstrap 5.3 na paleta do clube (tokens.css). */
export function badge(texto, tom) {
  return `<span class="badge rounded-pill text-uppercase border ${BADGES[tom]}">${esc(texto)}</span>`;
}

export const badgeStatus = (ativo) =>
  ativo ? badge("Ativo", "sucesso") : badge("Inativo", "perigo");

/**
 * Linhas de carregamento com o placeholder do Bootstrap enquanto a tabela chega.
 * Uma célula por coluna do <thead>, para o esqueleto ocupar a tabela inteira.
 */
export function mostrarEsqueleto(idCorpoTabela) {
  const corpoTabela = document.getElementById(idCorpoTabela);
  if (!corpoTabela) return;
  const larguras = ["col-6", "col-8", "col-10", "col-7", "col-9"];
  const totalColunas =
    corpoTabela.closest("table")?.querySelectorAll("thead th").length || 6;
  let linhasHtml = "";
  for (let indiceLinha = 0; indiceLinha < 5; indiceLinha++) {
    linhasHtml += `<tr class="placeholder-glow ${CLASSES_TABELA.linha}" aria-hidden="true">`;
    for (let indiceColuna = 0; indiceColuna < totalColunas; indiceColuna++) {
      const largura = larguras[(indiceLinha + indiceColuna) % larguras.length];
      linhasHtml += `<td class="sem-rotulo ${CLASSES_TABELA.celula}"><span class="placeholder rounded ${largura}"></span></td>`;
    }
    linhasHtml += "</tr>";
  }
  corpoTabela.innerHTML = linhasHtml;
}
