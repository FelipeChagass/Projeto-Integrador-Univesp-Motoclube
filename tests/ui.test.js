/**
 * @jest-environment jsdom
 */
import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { S } from '../static/js/state.js';

/* ── Helpers: minimal DOM for ui.js ── */
function setupDOM() {
    document.body.innerHTML = `
        <div id="loading" style="display:flex"><div class="spinner"></div></div>
        <div id="toast">...</div>
        <div id="barra-operador">CAIXA FECHADO</div>
        <button id="container-abrir-caixa" class="d-none"></button>
        <button id="btn-admin" class="d-none"></button>
        <button id="sidebar-btn-admin" class="d-none"></button>
        <button id="sidebar-abrir-caixa" class="d-none"></button>
        <div id="grid-produtos" class="grid-produtos"></div>
        <div id="carrinho-lista" class="carrinho-lista"></div>
        <div id="total-display">R$ 0,00</div>
        <img id="logo-preload" class="d-none" />
        <div id="resultado-relatorio" class="d-none"></div>
    `;
}

describe('ui.js — showToast()', () => {
    let showToast;
    beforeEach(async () => {
        setupDOM();
        const mod = await import('../static/js/ui.js');
        showToast = mod.showToast;
    });

    test('exibe mensagem no element toast', () => {
        showToast('Venda OK!');
        const toast = document.getElementById('toast');
        expect(toast.innerText).toBe('Venda OK!');
        expect(toast.className).toContain('show');
    });

    test('adiciona classe toast-error para tipo err', () => {
        showToast('Falha!', 'err');
        const toast = document.getElementById('toast');
        expect(toast.className).toContain('toast-error');
    });
});

describe('ui.js — fecharModal()', () => {
    let fecharModal;
    beforeEach(async () => {
        setupDOM();
        document.body.insertAdjacentHTML('beforeend', '<div id="modal-teste" class="modal-overlay" style="display:flex"></div>');
        const mod = await import('../static/js/ui.js');
        fecharModal = mod.fecharModal;
    });

    test('esconde o modal setando display none', () => {
        fecharModal('modal-teste');
        expect(document.getElementById('modal-teste').style.display).toBe('none');
    });

    test('não quebra com ID inexistente', () => {
        expect(() => fecharModal('modal-inexistente')).not.toThrow();
    });
});

describe('ui.js — atualizarEstadoBotoes()', () => {
    let atualizarEstadoBotoes;
    beforeEach(async () => {
        setupDOM();
        S.operadorAtual = '';
        S.caixaAberto = false;
        S.usuarioAtual = null;
        const mod = await import('../static/js/ui.js');
        atualizarEstadoBotoes = mod.atualizarEstadoBotoes;
    });

    test('mostra BLOQUEADO quando sem operador', () => {
        S.operadorAtual = '';
        atualizarEstadoBotoes();
        const barra = document.getElementById('barra-operador');
        expect(barra.innerText).toContain('BLOQUEADO');
    });

    test('mostra nome do operador quando logado', () => {
        S.operadorAtual = 'Felipe';
        S.caixaAberto = false;
        atualizarEstadoBotoes();
        const barra = document.getElementById('barra-operador');
        expect(barra.innerText).toContain('FELIPE');
        expect(barra.innerText).toContain('FECHADO');
    });

    test('mostra CAIXA ABERTO quando caixa aberto', () => {
        S.operadorAtual = 'Maria';
        S.caixaAberto = true;
        atualizarEstadoBotoes();
        const barra = document.getElementById('barra-operador');
        expect(barra.innerText).toContain('ABERTO');
    });

    test('mostra botão admin para perfil admin', () => {
        S.operadorAtual = 'Admin';
        S.usuarioAtual = { perfil: 'admin' };
        atualizarEstadoBotoes();
        expect(document.getElementById('btn-admin').classList.contains('d-none')).toBe(false);
    });

    test('esconde botão admin para perfil operador', () => {
        S.operadorAtual = 'Operador';
        S.usuarioAtual = { perfil: 'operador' };
        atualizarEstadoBotoes();
        expect(document.getElementById('btn-admin').classList.contains('d-none')).toBe(true);
    });
});

describe('ui.js — renderizarCatalogo()', () => {
    let renderizarCatalogo;
    beforeEach(async () => {
        setupDOM();
        S.produtos = [];
        S.carrinho = [];
        S.modoGerenciaEstoque = false;
        const mod = await import('../static/js/ui.js');
        renderizarCatalogo = mod.renderizarCatalogo;
    });

    test('mostra mensagem quando sem produtos', () => {
        S.produtos = [];
        renderizarCatalogo();
        const grid = document.getElementById('grid-produtos');
        expect(grid.innerHTML).toContain('Nenhum produto encontrado');
    });

    test('renderiza cards para cada produto', () => {
        S.produtos = [
            { id: 1, nome: 'Cerveja', preco_atual: 10, estoque_bar: 20, estoque_deposito: 50, estoque_min_bar: 5, estoque_min_deposito: 10, url_imagem: '' },
            { id: 2, nome: 'Água', preco_atual: 5, estoque_bar: 15, estoque_deposito: 30, estoque_min_bar: 3, estoque_min_deposito: 5, url_imagem: '' },
        ];
        renderizarCatalogo();
        const cards = document.querySelectorAll('.card');
        expect(cards.length).toBe(2);
    });

    test('cards contêm nome e preço sanitizados', () => {
        S.produtos = [
            { id: 1, nome: '<script>Evil</script>', preco_atual: 99.9, estoque_bar: 10, estoque_deposito: 20, estoque_min_bar: 2, estoque_min_deposito: 5, url_imagem: '' },
        ];
        renderizarCatalogo();
        const card = document.querySelector('.card');
        expect(card.innerHTML).not.toContain('<script>');
        expect(card.innerHTML).toContain('&lt;script&gt;');
        expect(card.innerHTML).toContain('R$ 99.90');
    });

    test('marca card esgotado quando estoque_bar <= 0', () => {
        S.produtos = [
            { id: 1, nome: 'Esgotado', preco_atual: 10, estoque_bar: 0, estoque_deposito: 5, estoque_min_bar: 1, estoque_min_deposito: 1, url_imagem: '' },
        ];
        renderizarCatalogo();
        const card = document.querySelector('.card');
        expect(card.dataset.barZerado).toBe('true');
        expect(card.innerHTML).toContain('ACABOU');
    });

    test('desconta quantidade do carrinho do estoque visível', () => {
        S.produtos = [
            { id: 1, nome: 'Cerveja', preco_atual: 10, estoque_bar: 5, estoque_deposito: 20, estoque_min_bar: 1, estoque_min_deposito: 5, url_imagem: '' },
        ];
        S.carrinho = [{ id: 1, nome: 'Cerveja', preco: 10, qtd: 3, obs: '' }];
        renderizarCatalogo();
        const stock = document.querySelector('.card-stock');
        expect(stock.textContent).toContain('Bar: 2');
    });

    test('mostra badge ESTOQUE BAIXO quando abaixo do mínimo', () => {
        S.produtos = [
            { id: 1, nome: 'Pouco', preco_atual: 10, estoque_bar: 2, estoque_deposito: 20, estoque_min_bar: 5, estoque_min_deposito: 3, url_imagem: '' },
        ];
        renderizarCatalogo();
        const card = document.querySelector('.card');
        expect(card.classList.contains('card-alerta')).toBe(true);
        expect(card.innerHTML).toContain('ESTOQUE BAIXO');
    });
});

describe('ui.js — atualizarUI()', () => {
    let atualizarUI;
    beforeEach(async () => {
        setupDOM();
        S.produtos = [
            { id: 1, nome: 'Cerveja', preco_atual: 10, estoque_bar: 50, estoque_deposito: 100, estoque_min_bar: 5, estoque_min_deposito: 10, url_imagem: '' },
        ];
        S.carrinho = [];
        S.modoGerenciaEstoque = false;
        const mod = await import('../static/js/ui.js');
        atualizarUI = mod.atualizarUI;
    });

    test('mostra total R$ 0,00 com carrinho vazio', () => {
        S.carrinho = [];
        atualizarUI();
        expect(document.getElementById('total-display').innerText).toBe('R$ 0.00');
    });

    test('calcula total correto com múltiplos itens', () => {
        S.carrinho = [
            { id: 1, nome: 'Cerveja', preco: 10, qtd: 3, obs: '' },
            { id: 2, nome: 'Água', preco: 5, qtd: 2, obs: '' },
        ];
        atualizarUI();
        expect(document.getElementById('total-display').innerText).toBe('R$ 40.00');
    });

    test('renderiza itens do carrinho no DOM', () => {
        S.carrinho = [
            { id: 1, nome: 'Cerveja', preco: 10, qtd: 1, obs: 'Gelada' },
        ];
        atualizarUI();
        const items = document.querySelectorAll('.item-carrinho');
        expect(items.length).toBe(1);
        expect(items[0].innerHTML).toContain('Cerveja');
        expect(items[0].innerHTML).toContain('Gelada');
    });

    test('sanitiza observações no carrinho', () => {
        S.carrinho = [
            { id: 1, nome: 'Item', preco: 10, qtd: 1, obs: '<img onerror=alert(1)>' },
        ];
        atualizarUI();
        const item = document.querySelector('.item-carrinho');
        expect(item.innerHTML).not.toContain('<img');
        expect(item.innerHTML).toContain('&lt;img');
    });
});
