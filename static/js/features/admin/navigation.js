/**
 * Navegação entre abas e controle da sidebar administrativa.
 * Consulta os bindings vivos de membros/usuários para preservar a carga sob demanda.
 */
import { membros, carregarMembros } from './membros.js';
import { usuarios, carregarUsuarios } from './usuarios.js';
import { carregarVendas } from './vendas.js';
import { carregarConfig } from './configuracoes.js';

export function switchTab(name) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
    document.getElementById('tab-btn-' + name).classList.add('active');
    document.getElementById('tab-' + name).classList.add('active');

    if (name === 'membros' && membros.length === 0) carregarMembros();
    if (name === 'usuarios' && usuarios.length === 0) carregarUsuarios();
    if (name === 'vendas') carregarVendas();
    if (name === 'config') carregarConfig();
}

export function openAdminSidebar() {
    const sidebar = document.getElementById('admin-sidebar-mobile');
    if (sidebar) {
        sidebar.classList.add('open');
        document.body.style.overflow = 'hidden';
    }
}

export function closeAdminSidebar() {
    const sidebar = document.getElementById('admin-sidebar-mobile');
    if (sidebar) {
        sidebar.classList.remove('open');
        document.body.style.overflow = '';
    }
}
