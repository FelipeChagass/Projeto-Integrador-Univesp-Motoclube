/**
 * Modo de estoque e envio de ajustes com valores esperados ao backend.
 * A senha é validada no backend e permanece apenas em memória enquanto o modo está ativo.
 */
import { API } from '../../../shared/api.js';
import { UIModal } from '../../../shared/modals.js';
import { S, salvarDadosLocais } from '../state.js';
import { showToast, fecharModal, renderizarCatalogo, sincronizarTextoModoEstoque } from '../ui.js';

/* ─── Stock Management ─── */

export function alternarModoEstoque() {
    if (S.modoGerenciaEstoque) {
        S.modoGerenciaEstoque = false;
        S.senhaEstoque = null;
        const btn = document.getElementById('btn-estoque');
        const carrinhoSec = document.getElementById('carrinho-section');
        const header = document.getElementById('app-header');
        if (btn) btn.classList.remove('active');
        if (carrinhoSec) carrinhoSec.classList.remove('minimizado');
        document.body.style.border = 'none';
        if (header) header.style.borderBottom = '1px solid rgba(255, 152, 0, 0.25)';
        sincronizarTextoModoEstoque();
        showToast('MODO ESTOQUE DESATIVADO');
        renderizarCatalogo();
        return;
    }
    if (S.usuarioAtual?.perfil === 'admin') {
        S.senhaEstoque = null;
        ativarModoEstoque();
        return;
    }
    UIModal.prompt('Digite a senha para gerenciar o estoque:', async (senha) => {
        if (!senha) return showToast('Digite a senha do estoque.', 'err');
        try {
            await API.verificarSenhaEstoque(senha);
            S.senhaEstoque = senha;
            ativarModoEstoque();
        } catch (error) {
            showToast(error.message || 'Senha do estoque incorreta.', 'err');
        }
    });
}

function ativarModoEstoque() {
    S.modoGerenciaEstoque = true;
    const btn = document.getElementById('btn-estoque');
    const carrinhoSec = document.getElementById('carrinho-section');
    const header = document.getElementById('app-header');
    if (btn) btn.classList.add('active');
    if (carrinhoSec) carrinhoSec.classList.add('minimizado');
    document.body.style.border = '3px solid #b30000';
    if (header) header.style.borderBottom = '3px solid #b30000';
    sincronizarTextoModoEstoque();
    showToast('MODO ESTOQUE ATIVADO');
    renderizarCatalogo();
}

export async function salvarEdicaoEstoque() {
    const novoEstBar = Number(document.getElementById('edit-est-bar').value);
    let novoEstDep = Number(document.getElementById('edit-est-dep').value);
    const novoMinBar = document.getElementById('edit-min-bar').value;
    const novoMinDep = document.getElementById('edit-min-dep').value;
    if (novoEstBar < 0 || novoEstDep < 0) return showToast('Erro: Não é permitido valores negativos.');
    const diferenca = novoEstBar - S.estoqueOriginalBar;
    if (diferenca > 0) {
        if (novoEstDep - diferenca < 0) return showToast('OPERAÇÃO NEGADA: Depósito insuficiente.');
        novoEstDep -= diferenca;
    }
    try {
        await API.salvarDadosProduto(S.produtoEdicao.id, novoEstBar, novoEstDep, Number(novoMinBar), Number(novoMinDep), S.estoqueOriginalBar, Number(S.produtoEdicao.estoque_deposito), S.senhaEstoque);
        S.produtoEdicao.estoque_bar = novoEstBar;
        S.produtoEdicao.estoque_deposito = novoEstDep;
        salvarDadosLocais();
        renderizarCatalogo();
        fecharModal('modal-estoque');
        showToast('Estoque atualizado.');
    } catch (error) { showToast(`Estoque não atualizado: ${error.message}`); }
}
