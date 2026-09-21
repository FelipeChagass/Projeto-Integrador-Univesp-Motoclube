/**
 * Modo de estoque e envio de ajustes com valores esperados ao backend.
 * A interface verifica o perfil para orientar o usuário; a API aplica a autorização real.
 */
import { API } from '../../../shared/api.js';
import { S, salvarDadosLocais } from '../state.js';
import { showToast, fecharModal, renderizarCatalogo, sincronizarTextoModoEstoque } from '../ui.js';

/* ─── Stock Management ─── */

export function alternarModoEstoque() {
    if (S.modoGerenciaEstoque) {
        S.modoGerenciaEstoque = false;
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
    ativarModoEstoque();
}

function ativarModoEstoque() {
    if (S.usuarioAtual?.perfil !== 'admin') return showToast('Ajustes de estoque exigem um administrador.');
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
        await API.salvarDadosProduto(S.produtoEdicao.id, novoEstBar, novoEstDep, Number(novoMinBar), Number(novoMinDep), S.estoqueOriginalBar, Number(S.produtoEdicao.estoque_deposito));
        S.produtoEdicao.estoque_bar = novoEstBar;
        S.produtoEdicao.estoque_deposito = novoEstDep;
        salvarDadosLocais();
        renderizarCatalogo();
        fecharModal('modal-estoque');
        showToast('Estoque atualizado.');
    } catch (error) { showToast(`Estoque não atualizado: ${error.message}`); }
}
