/**
 * Interações do catálogo/carrinho e abertura da edição do produto selecionado.
 * Usa o estadoPdv e a UI do PDV; persistência de vendas pertence a pagamentos.js.
 */
import { estadoPdv } from '../state.js';
import { showToast, fecharModal, abrirModal, atualizarUI, getQtdCarrinho } from '../ui.js';

/* ─── Cart ─── */

export function adicionarAoCarrinho(produtoId, nomeProduto, precoProduto, observacao) {
    const produtoEncontrado = estadoPdv.produtos.find(produto => produto.id == produtoId && produto.nome == nomeProduto);
    if (!produtoEncontrado) return;
    const limiteEstoqueBar = Number(produtoEncontrado.estoque_bar);
    const quantidadeNoCarrinho = getQtdCarrinho(produtoId);
    if (quantidadeNoCarrinho + 1 > limiteEstoqueBar) return showToast('Estoque do Bar insuficiente!');
    const itemExistente = estadoPdv.carrinho.find(itemCarrinho => itemCarrinho.id == produtoId && itemCarrinho.nome == nomeProduto && itemCarrinho.obs === observacao);
    if (itemExistente) {
        itemExistente.qtd++;
    } else {
        estadoPdv.carrinho.push({ id: produtoId, nome: nomeProduto, preco: precoProduto, obs: observacao, qtd: 1 });
    }
    atualizarUI();
}

export function incrementarQtd(indiceItem) {
    const itemCarrinho = estadoPdv.carrinho[indiceItem];
    const produtoEncontrado = estadoPdv.produtos.find(produto => produto.id == itemCarrinho.id && produto.nome == itemCarrinho.nome);
    const limiteEstoqueBar = produtoEncontrado ? Number(produtoEncontrado.estoque_bar) : 0;
    if (getQtdCarrinho(itemCarrinho.id) + 1 > limiteEstoqueBar) return showToast('Limite do Bar atingido!');
    itemCarrinho.qtd++;
    atualizarUI();
}

export function decrementarQtd(indiceItem) {
    if (estadoPdv.carrinho[indiceItem].qtd > 1) {
        estadoPdv.carrinho[indiceItem].qtd--;
    } else {
        estadoPdv.carrinho.splice(indiceItem, 1);
    }
    atualizarUI();
}

export function abrirModalObs(nomeProduto) {
    document.getElementById('modal-prod-nome').innerText = nomeProduto;
    document.getElementById('custom-obs').value = '';
    abrirModal('modal-obs');
    document.getElementById('custom-obs').focus();
}

export function confirmarObs() {
    const observacaoPersonalizada = document.getElementById('custom-obs').value;
    if (estadoPdv.produtoPendente) {
        adicionarAoCarrinho(estadoPdv.produtoPendente.id, estadoPdv.produtoPendente.nome, estadoPdv.produtoPendente.preco_atual, observacaoPersonalizada);
    }
    fecharModal('modal-obs');
}

/* ─── Product Interaction ─── */

export function cliqueProduto(produto, estoqueBarZerado) {
    if (!estadoPdv.modoGerenciaEstoque && !estadoPdv.caixaAberto && estadoPdv.operadorAtual) {
        return showToast('O caixa está fechado! Abra o caixa para realizar vendas.');
    }
    const categoriaProduto = String(produto.categoria || '').trim().toUpperCase();
    const produtoComida = categoriaProduto === 'COMIDA';

    if (estadoPdv.modoGerenciaEstoque) {
        estadoPdv.produtoEdicao = produto;
        estadoPdv.estoqueOriginalBar = Number(produto.estoque_bar);
        document.getElementById('nome-prod-estoque').innerText = produto.nome;
        document.getElementById('edit-est-bar').value = produto.estoque_bar;
        document.getElementById('edit-est-dep').value = produto.estoque_deposito;
        document.getElementById('edit-min-bar').value = produto.estoque_min_bar || 0;
        document.getElementById('edit-min-dep').value = produto.estoque_min_deposito || 0;
        abrirModal('modal-estoque');
    } else {
        if (!estadoPdv.operadorAtual) return showToast('Faça login primeiro.');
        if (estoqueBarZerado) return showToast('Produto esgotado no Bar!');
        if (produtoComida) {
            estadoPdv.produtoPendente = produto;
            abrirModalObs(produto.nome);
        } else {
            adicionarAoCarrinho(produto.id, produto.nome, produto.preco_atual, '');
        }
    }
}
