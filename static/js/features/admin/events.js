/**
 * Liga IDs/data-actions dos templates aos handlers de cada recurso.
 * setupEventListeners deve ser chamado uma vez pela entrada admin.js após criar o DOM.
 */
import { fecharModalAdmin } from './ui.js';
import { switchTab, openAdminSidebar, closeAdminSidebar } from './navigation.js';
import { carregarProdutos, abrirFormNovoProduto, fecharFormNovoProduto, previewNovoProdutoImagem, removerNovoPreview, criarNovoProduto, deletarProduto, reativarProduto, salvarProduto, abrirAjusteEstoque, confirmarAjusteEstoque, abrirUpload, uploadImagem } from './produtos.js';
import { carregarMembros, abrirFormNovoMembro, criarNovoMembro, salvarMembro, desativarMembro, reativarMembro, verExtrato, abrirAjusteSaldo, confirmarAjusteSaldo } from './membros.js';
import { abrirFormNovoUsuario, fecharFormNovoUsuario, criarNovoUsuario, salvarUsuario, toggleUsuario, excluirUsuario } from './usuarios.js';
import { carregarVendas } from './vendas.js';
import { salvarConfig } from './configuracoes.js';

export function setupEventListeners() {
    document.getElementById('tab-btn-produtos')?.addEventListener('click', () => switchTab('produtos'));
    document.getElementById('tab-btn-membros')?.addEventListener('click', () => switchTab('membros'));
    document.getElementById('tab-btn-usuarios')?.addEventListener('click', () => switchTab('usuarios'));
    document.getElementById('tab-btn-vendas')?.addEventListener('click', () => switchTab('vendas'));
    document.getElementById('tab-btn-config')?.addEventListener('click', () => switchTab('config'));

    document.getElementById('mostrarProdutosInativos')?.addEventListener('change', carregarProdutos);
    document.getElementById('mostrarMembrosInativos')?.addEventListener('change', carregarMembros);

    document.getElementById('btn-add-produto')?.addEventListener('click', abrirFormNovoProduto);
    document.getElementById('btn-close-form-produto')?.addEventListener('click', fecharFormNovoProduto);
    document.getElementById('novo-upload-zone')?.addEventListener('click', () => document.getElementById('novo-file-input').click());
    document.getElementById('novo-file-input')?.addEventListener('change', (e) => previewNovoProdutoImagem(e.target));
    document.getElementById('btn-remove-preview-produto')?.addEventListener('click', removerNovoPreview);
    document.getElementById('btn-save-novo-produto')?.addEventListener('click', criarNovoProduto);
    document.getElementById('btn-cancel-novo-produto')?.addEventListener('click', fecharFormNovoProduto);

    document.getElementById('btn-add-membro')?.addEventListener('click', abrirFormNovoMembro);
    document.getElementById('btn-close-form-membro')?.addEventListener('click', () => document.getElementById('formNovoMembro').classList.add('d-none'));
    document.getElementById('btn-save-novo-membro')?.addEventListener('click', criarNovoMembro);
    document.getElementById('btn-cancel-novo-membro')?.addEventListener('click', () => document.getElementById('formNovoMembro').classList.add('d-none'));

    document.getElementById('btn-add-usuario')?.addEventListener('click', abrirFormNovoUsuario);
    document.getElementById('btn-close-form-usuario')?.addEventListener('click', fecharFormNovoUsuario);
    document.getElementById('btn-save-novo-usuario')?.addEventListener('click', criarNovoUsuario);
    document.getElementById('btn-cancel-novo-usuario')?.addEventListener('click', fecharFormNovoUsuario);

    document.getElementById('btn-filtrar-vendas')?.addEventListener('click', carregarVendas);
    document.getElementById('btn-save-config')?.addEventListener('click', salvarConfig);

    document.getElementById('btn-close-modal-extrato')?.addEventListener('click', () => fecharModalAdmin('modalExtrato'));
    document.getElementById('btn-close-modal-ajuste')?.addEventListener('click', () => fecharModalAdmin('modalAjuste'));
    document.getElementById('btn-cancel-modal-ajuste')?.addEventListener('click', () => fecharModalAdmin('modalAjuste'));
    document.getElementById('btn-confirmar-ajuste-saldo')?.addEventListener('click', confirmarAjusteSaldo);

    document.getElementById('btn-close-modal-estoque')?.addEventListener('click', () => fecharModalAdmin('modalAjusteEstoque'));
    document.getElementById('btn-cancel-modal-estoque')?.addEventListener('click', () => fecharModalAdmin('modalAjusteEstoque'));
    document.getElementById('btn-confirmar-ajuste-estoque')?.addEventListener('click', confirmarAjusteEstoque);

    document.getElementById('fileInput')?.addEventListener('change', (e) => uploadImagem(e.target));

    document.getElementById('tabelaProdutos')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
        const id = parseInt(btn.dataset.id);
        if (action === 'upload-img') abrirUpload(id);
        if (action === 'salvar-produto') salvarProduto(id);
        if (action === 'ajuste-estoque') abrirAjusteEstoque(id);
        if (action === 'desativar-produto') deletarProduto(id, btn.dataset.nome);
        if (action === 'reativar-produto') reativarProduto(id);
    });

    document.getElementById('tabelaMembros')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        if (action === 'salvar-membro') salvarMembro(id);
        if (action === 'ver-extrato') verExtrato(id, btn.dataset.nome);
        if (action === 'ajuste-saldo') abrirAjusteSaldo(id, btn.dataset.nome);
        if (action === 'desativar-membro') desativarMembro(id, btn.dataset.nome);
        if (action === 'reativar-membro') reativarMembro(id);
    });

    document.getElementById('tabelaUsuarios')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        if (action === 'salvar-usuario') salvarUsuario(id);
        if (action === 'toggle-usuario') toggleUsuario(id, btn.dataset.ativo === 'true');
        if (action === 'excluir-usuario') excluirUsuario(id, btn.dataset.nome || 'usuário');
    });

    // ── Admin Sidebar Mobile ──
    document.getElementById('admin-btn-hamburger')?.addEventListener('click', openAdminSidebar);
    document.getElementById('admin-sidebar-close')?.addEventListener('click', closeAdminSidebar);
    document.querySelector('#admin-sidebar-mobile .sidebar-backdrop')?.addEventListener('click', closeAdminSidebar);

    document.querySelectorAll('#admin-sidebar-mobile [data-admin-tab]').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.adminTab;
            switchTab(tab);
            closeAdminSidebar();
        });
    });
}
