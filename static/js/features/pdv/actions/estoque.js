/**
 * Modo de estoque e envio de ajustes com valores esperados ao backend.
 * A senha é validada no backend e permanece apenas em memória enquanto o modo está ativo.
 */
import { API } from '../../../shared/api.js';
import { UIModal } from '../../../shared/modals.js';
import { estadoPdv, salvarDadosLocais } from '../state.js';
import { showToast, fecharModal, renderizarCatalogo, sincronizarTextoModoEstoque } from '../ui.js';

/* ─── Stock Management ─── */

export function alternarModoEstoque() {
    if (estadoPdv.modoGerenciaEstoque) {
        estadoPdv.modoGerenciaEstoque = false;
        estadoPdv.senhaEstoque = null;
        const botaoEstoque = document.getElementById('btn-estoque');
        const secaoCarrinho = document.getElementById('carrinho-section');
        const cabecalhoAplicacao = document.getElementById('app-header');
        if (botaoEstoque) botaoEstoque.classList.remove('active');
        if (secaoCarrinho) secaoCarrinho.classList.remove('minimizado');
        document.body.style.border = 'none';
        if (cabecalhoAplicacao) cabecalhoAplicacao.style.borderBottom = '';
        sincronizarTextoModoEstoque();
        showToast('MODO ESTOQUE DESATIVADO');
        renderizarCatalogo();
        return;
    }
    if (estadoPdv.usuarioAtual?.perfil === 'admin') {
        estadoPdv.senhaEstoque = null;
        ativarModoEstoque();
        return;
    }
    UIModal.prompt('Digite a senha para gerenciar o estoque:', async (senha) => {
        if (!senha) return showToast('Digite a senha do estoque.', 'err');
        try {
            await API.verificarSenhaEstoque(senha);
            estadoPdv.senhaEstoque = senha;
            ativarModoEstoque();
        } catch (erroValidacaoSenha) {
            showToast(erroValidacaoSenha.message || 'Senha do estoque incorreta.', 'err');
        }
    });
}

function ativarModoEstoque() {
    estadoPdv.modoGerenciaEstoque = true;
    const botaoEstoque = document.getElementById('btn-estoque');
    const secaoCarrinho = document.getElementById('carrinho-section');
    const cabecalhoAplicacao = document.getElementById('app-header');
    if (botaoEstoque) botaoEstoque.classList.add('active');
    if (secaoCarrinho) secaoCarrinho.classList.add('minimizado');
    document.body.style.border = '3px solid var(--accent)';
    if (cabecalhoAplicacao) cabecalhoAplicacao.style.borderBottom = '3px solid var(--accent)';
    sincronizarTextoModoEstoque();
    showToast('MODO ESTOQUE ATIVADO');
    renderizarCatalogo();
}

export async function salvarEdicaoEstoque() {
    const novoEstoqueBar = Number(document.getElementById('edit-est-bar').value);
    let novoEstoqueDeposito = Number(document.getElementById('edit-est-dep').value);
    const novoEstoqueMinimoBar = document.getElementById('edit-min-bar').value;
    const novoEstoqueMinimoDeposito = document.getElementById('edit-min-dep').value;
    if (novoEstoqueBar < 0 || novoEstoqueDeposito < 0) return showToast('Erro: Não é permitido valores negativos.');
    const diferencaEstoqueBar = novoEstoqueBar - estadoPdv.estoqueOriginalBar;
    if (diferencaEstoqueBar > 0) {
        if (novoEstoqueDeposito - diferencaEstoqueBar < 0) return showToast('OPERAÇÃO NEGADA: Depósito insuficiente.');
        novoEstoqueDeposito -= diferencaEstoqueBar;
    }
    try {
        await API.salvarDadosProduto(estadoPdv.produtoEdicao.id, novoEstoqueBar, novoEstoqueDeposito, Number(novoEstoqueMinimoBar), Number(novoEstoqueMinimoDeposito), estadoPdv.estoqueOriginalBar, Number(estadoPdv.produtoEdicao.estoque_deposito), estadoPdv.senhaEstoque);
        estadoPdv.produtoEdicao.estoque_bar = novoEstoqueBar;
        estadoPdv.produtoEdicao.estoque_deposito = novoEstoqueDeposito;
        salvarDadosLocais();
        renderizarCatalogo();
        fecharModal('modal-estoque');
        showToast('Estoque atualizado.');
    } catch (erroAtualizacaoEstoque) { showToast(`Estoque não atualizado: ${erroAtualizacaoEstoque.message}`); }
}
