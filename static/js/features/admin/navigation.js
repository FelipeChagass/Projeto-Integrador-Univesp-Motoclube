/**
 * Navegação entre abas e controle da sidebar administrativa.
 * Consulta os bindings vivos de membros/usuários para preservar a carga sob demanda.
 */
import { membros, carregarMembros } from "./membros.js";
import { usuarios, carregarUsuarios } from "./usuarios.js";
import { carregarVendas } from "./vendas.js";
import { carregarConfig } from "./configuracoes.js";

export function switchTab(nomeAba) {
  document
    .querySelectorAll(".tab-btn")
    .forEach((botaoAba) => botaoAba.classList.remove("active"));
  document
    .querySelectorAll(".tab-content")
    .forEach((conteudoAba) => conteudoAba.classList.remove("active"));
  document.getElementById("tab-btn-" + nomeAba).classList.add("active");
  document.getElementById("tab-" + nomeAba).classList.add("active");

  if (nomeAba === "membros" && membros.length === 0) carregarMembros();
  if (nomeAba === "usuarios" && usuarios.length === 0) carregarUsuarios();
  if (nomeAba === "vendas") carregarVendas();
  if (nomeAba === "config") carregarConfig();
}

export function openAdminSidebar() {
  const menuLateral = document.getElementById("admin-sidebar-mobile");
  if (menuLateral) {
    menuLateral.classList.add("open");
    document.body.style.overflow = "hidden";
  }
}

export function closeAdminSidebar() {
  const menuLateral = document.getElementById("admin-sidebar-mobile");
  if (menuLateral) {
    menuLateral.classList.remove("open");
    document.body.style.overflow = "";
  }
}
