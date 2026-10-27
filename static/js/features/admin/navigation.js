/**
 * Navegação entre abas do painel. Os botões [data-admin-tab] ficam no cabeçalho e no
 * offcanvas do celular (aberto e fechado pelo Bootstrap); cada aba é um .tab-pane.
 * Consulta os bindings vivos de membros/usuários para preservar a carga sob demanda.
 */
import { membros, carregarMembros } from "./membros.js";
import { usuarios, carregarUsuarios } from "./usuarios.js";
import { carregarVendas } from "./vendas.js";
import { carregarConfig } from "./configuracoes.js";

export function switchTab(nomeAba) {
  document.querySelectorAll("[data-admin-tab]").forEach((botaoAba) => {
    const atual = botaoAba.dataset.adminTab === nomeAba;
    botaoAba.classList.toggle("active", atual);
    if (atual) botaoAba.setAttribute("aria-current", "page");
    else botaoAba.removeAttribute("aria-current");
  });
  document
    .querySelectorAll(".tab-pane")
    .forEach((conteudoAba) =>
      conteudoAba.classList.toggle(
        "active",
        conteudoAba.id === "tab-" + nomeAba,
      ),
    );

  if (nomeAba === "membros" && membros.length === 0) carregarMembros();
  if (nomeAba === "usuarios" && usuarios.length === 0) carregarUsuarios();
  if (nomeAba === "vendas") carregarVendas();
  if (nomeAba === "config") carregarConfig();
}
