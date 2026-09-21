/**
 * Interações do catálogo/carrinho e abertura da edição do produto selecionado.
 * Usa o estado S e a UI do PDV; persistência de vendas pertence a pagamentos.js.
 */
import { S } from '../state.js';
import { showToast, fecharModal, abrirModal, atualizarUI, getQtdCarrinho } from '../ui.js';

/* ─── Cart ─── */

export function adicionarAoCarrinho(id, nome, preco, obs) {
    const produtoEncontrado = S.produtos.find(x => x.id == id && x.nome == nome);
    if (!produtoEncontrado) return;
    const limite = Number(produtoEncontrado.estoque_bar);
    const noCarrinho = getQtdCarrinho(id);
    if (noCarrinho + 1 > limite) return showToast('Estoque do Bar insuficiente!');
    const itemExistente = S.carrinho.find(i => i.id == id && i.nome == nome && i.obs === obs);
    if (itemExistente) {
        itemExistente.qtd++;
    } else {
        S.carrinho.push({ id, nome, preco, obs, qtd: 1 });
    }
    atualizarUI();
}

export function incrementarQtd(idx) {
    const item = S.carrinho[idx];
    const prod = S.produtos.find(x => x.id == item.id && x.nome == item.nome);
    const limite = prod ? Number(prod.estoque_bar) : 0;
    if (getQtdCarrinho(item.id) + 1 > limite) return showToast('Limite do Bar atingido!');
    item.qtd++;
    atualizarUI();
}

export function decrementarQtd(idx) {
    if (S.carrinho[idx].qtd > 1) {
        S.carrinho[idx].qtd--;
    } else {
        S.carrinho.splice(idx, 1);
    }
    atualizarUI();
}

export function abrirModalObs(nome) {
    document.getElementById('modal-prod-nome').innerText = nome;
    document.getElementById('custom-obs').value = '';
    abrirModal('modal-obs');
    document.getElementById('custom-obs').focus();
}

export function confirmarObs() {
    const custom = document.getElementById('custom-obs').value;
    if (S.produtoPendente) {
        adicionarAoCarrinho(S.produtoPendente.id, S.produtoPendente.nome, S.produtoPendente.preco_atual, custom);
    }
    fecharModal('modal-obs');
}

/* ─── Product Interaction ─── */

export function cliqueProduto(p, isBarZerado) {
    if (!S.modoGerenciaEstoque && !S.caixaAberto && S.operadorAtual) {
        return showToast('O caixa está fechado! Abra o caixa para realizar vendas.');
    }
    const cat = String(p.categoria || '').trim().toUpperCase();
    const isComida = cat === 'COMIDA';

    if (S.modoGerenciaEstoque) {
        S.produtoEdicao = p;
        S.estoqueOriginalBar = Number(p.estoque_bar);
        document.getElementById('nome-prod-estoque').innerText = p.nome;
        document.getElementById('edit-est-bar').value = p.estoque_bar;
        document.getElementById('edit-est-dep').value = p.estoque_deposito;
        document.getElementById('edit-min-bar').value = p.estoque_min_bar || 0;
        document.getElementById('edit-min-dep').value = p.estoque_min_deposito || 0;
        abrirModal('modal-estoque');
    } else {
        if (!S.operadorAtual) return showToast('Faça login primeiro.');
        if (isBarZerado) return showToast('Produto esgotado no Bar!');
        if (isComida) {
            S.produtoPendente = p;
            abrirModalObs(p.nome);
        } else {
            adicionarAoCarrinho(p.id, p.nome, p.preco_atual, '');
        }
    }
}
