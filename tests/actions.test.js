/**
 * @jest-environment jsdom
 */
import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import { S, salvarDadosLocais } from '../static/js/state.js';

/* ── Mockup: API global + UIModal (normalmente carregados pelo <script> tag) ── */
globalThis.API = {
    verificarSenhaEstoque: jest.fn(),
    salvarDadosProduto: jest.fn(() => Promise.resolve()),
    processarVenda: jest.fn(() => Promise.resolve('OK')),
    quitarContaMembro: jest.fn(() => Promise.resolve('Conta quitada')),
    getListaMembros: jest.fn(() => Promise.resolve([{ nome: 'João' }, { nome: 'Maria' }])),
    buscarExtratoMembro: jest.fn(() => Promise.resolve({ total: 50, itens: [{ qtd: 2, produto: 'Cerveja', valor: 20 }] })),
    abrirCaixa: jest.fn(() => Promise.resolve({ caixa_id: 'cx-test-123' })),
    invalidateCache: jest.fn(),
    getDadosIniciais: jest.fn(() => Promise.resolve({ produtos: [], membros: [] })),
};
globalThis.UIModal = {
    confirm: jest.fn((msg, cb) => cb()),
    alert: jest.fn(),
};

/* ── Minimal DOM ── */
function setupDOM() {
    document.body.innerHTML = `
        <div id="loading" style="display:none"></div>
        <div id="toast">...</div>
        <div id="barra-operador"></div>
        <button id="container-btn-login"></button>
        <button id="container-abrir-caixa" class="d-none"></button>
        <button id="btn-admin" class="d-none"></button>
        <button id="sidebar-btn-admin" class="d-none"></button>
        <button id="sidebar-abrir-caixa" class="d-none"></button>
        <div id="grid-produtos"></div>
        <div id="carrinho-lista"></div>
        <div id="total-display">R$ 0,00</div>
        <img id="logo-preload" class="d-none" />
        <div id="resultado-relatorio" class="d-none"></div>
        <input type="text" id="input-cliente" value="" />
        <div id="modal-obs" class="modal-overlay" style="display:none"></div>
        <p id="modal-prod-nome"></p>
        <input type="text" id="custom-obs" value="" />
        <div id="modal-estoque" class="modal-overlay" style="display:none"></div>
        <p id="nome-prod-estoque"></p>
        <input id="edit-est-bar" type="number" />
        <input id="edit-est-dep" type="number" />
        <input id="edit-min-bar" type="number" />
        <input id="edit-min-dep" type="number" />
        <div id="modal-senha-estoque" style="display:none"></div>
        <input id="input-senha-estoque" type="password" value="" />
        <p id="erro-senha-estoque" class="d-none"></p>
        <button id="btn-estoque"></button>
        <div id="carrinho-section"></div>
        <header id="app-header"></header>
        <div id="modal-abertura-caixa" style="display:none"></div>
        <input id="input-valor-abertura" type="number" value="100" />
        <div id="modal-config" style="display:none"></div>
        <input id="cfg-imprimir" type="checkbox" checked />
        <select id="cfg-largura"><option value="ticket-80mm">80mm</option><option value="ticket-58mm">58mm</option></select>
        <div id="modal-selecionar-membro" style="display:none"></div>
        <select id="select-membro"></select>
        <div id="preview-divida"></div>
        <div id="modal-fechar-conta" style="display:none"></div>
        <p id="nome-fechar-conta"></p>
        <div id="lista-fechamento"></div>
        <div id="total-fechamento">R$ 0,00</div>
        <div id="area-impressao"></div>
    `;
}

/* Helpers to load modules */
let actions, ui;
async function loadModules() {
    setupDOM();
    localStorage.clear();
    S.produtos = [
        { id: 1, nome: 'Cerveja', preco_atual: 10, estoque_bar: 20, estoque_deposito: 50, estoque_min_bar: 5, estoque_min_deposito: 10, url_imagem: '', categoria: 'BEBIDA' },
        { id: 2, nome: 'Hamburguer', preco_atual: 25, estoque_bar: 10, estoque_deposito: 30, estoque_min_bar: 2, estoque_min_deposito: 5, url_imagem: '', categoria: 'COMIDA' },
    ];
    S.carrinho = [];
    S.membros = [{ nome: 'João' }, { nome: 'Maria' }];
    S.operadorAtual = 'Teste';
    S.caixaAberto = true;
    S.caixaId = 'cx-test';
    S.modoGerenciaEstoque = false;
    S.filaVendas = [];
    S.enviandoVenda = false;
    S.config = { imprimir: false, largura: 'ticket-80mm', logo: '/static/img/motorhead.png' };
    ui = await import('../static/js/ui.js');
    actions = await import('../static/js/actions.js');
}

describe('actions.js — Carrinho', () => {
    beforeEach(loadModules);

    test('adicionarAoCarrinho adiciona item novo', () => {
        actions.adicionarAoCarrinho(1, 'Cerveja', 10, '');
        expect(S.carrinho).toHaveLength(1);
        expect(S.carrinho[0]).toEqual({ id: 1, nome: 'Cerveja', preco: 10, obs: '', qtd: 1 });
    });

    test('adicionarAoCarrinho incrementa item existente', () => {
        actions.adicionarAoCarrinho(1, 'Cerveja', 10, '');
        actions.adicionarAoCarrinho(1, 'Cerveja', 10, '');
        expect(S.carrinho).toHaveLength(1);
        expect(S.carrinho[0].qtd).toBe(2);
    });

    test('adicionarAoCarrinho permite itens com obs diferentes', () => {
        actions.adicionarAoCarrinho(2, 'Hamburguer', 25, '');
        actions.adicionarAoCarrinho(2, 'Hamburguer', 25, 'Sem cebola');
        expect(S.carrinho).toHaveLength(2);
    });

    test('adicionarAoCarrinho bloqueia se estoque insuficiente', () => {
        S.produtos[0].estoque_bar = 1;
        actions.adicionarAoCarrinho(1, 'Cerveja', 10, '');
        actions.adicionarAoCarrinho(1, 'Cerveja', 10, '');
        expect(S.carrinho).toHaveLength(1);
        expect(S.carrinho[0].qtd).toBe(1);
    });

    test('incrementarQtd aumenta quantidade', () => {
        actions.adicionarAoCarrinho(1, 'Cerveja', 10, '');
        actions.incrementarQtd(0);
        expect(S.carrinho[0].qtd).toBe(2);
    });

    test('decrementarQtd diminui quantidade', () => {
        actions.adicionarAoCarrinho(1, 'Cerveja', 10, '');
        actions.adicionarAoCarrinho(1, 'Cerveja', 10, '');
        actions.decrementarQtd(0);
        expect(S.carrinho[0].qtd).toBe(1);
    });

    test('decrementarQtd remove item quando qtd chega a 0', () => {
        actions.adicionarAoCarrinho(1, 'Cerveja', 10, '');
        actions.decrementarQtd(0);
        expect(S.carrinho).toHaveLength(0);
    });
});

describe('actions.js — cliqueProduto()', () => {
    beforeEach(loadModules);

    test('adiciona bebida direto ao carrinho (sem modal)', () => {
        const prod = S.produtos[0]; // Cerveja = BEBIDA
        actions.cliqueProduto(prod, false);
        expect(S.carrinho).toHaveLength(1);
        expect(S.carrinho[0].nome).toBe('Cerveja');
    });

    test('abre modal obs para COMIDA', () => {
        const prod = S.produtos[1]; // Hamburguer = COMIDA
        actions.cliqueProduto(prod, false);
        expect(S.produtoPendente).not.toBeNull();
        expect(S.produtoPendente.nome).toBe('Hamburguer');
        expect(document.getElementById('modal-obs').style.display).toBe('flex');
    });

    test('bloqueia produto esgotado', () => {
        const prod = S.produtos[0];
        actions.cliqueProduto(prod, true); // barZerado = true
        expect(S.carrinho).toHaveLength(0);
    });

    test('bloqueia se caixa fechado', () => {
        S.caixaAberto = false;
        const prod = S.produtos[0];
        actions.cliqueProduto(prod, false);
        expect(S.carrinho).toHaveLength(0);
    });
});

describe('actions.js — Abertura/Fechamento Caixa', () => {
    beforeEach(loadModules);

    test('confirmarAberturaValor abre o caixa', () => {
        S.caixaAberto = false;
        document.getElementById('input-valor-abertura').value = '150';
        actions.confirmarAberturaValor();
        expect(S.caixaAberto).toBe(true);
        expect(S.valorAbertura).toBe(150);
    });

    test('abrirModalAberturaCaixa bloqueia se já aberto', () => {
        S.caixaAberto = true;
        actions.abrirModalAberturaCaixa();
        // Should not open modal, should show toast
        expect(document.getElementById('toast').innerText).toContain('já está aberto');
    });
});

describe('actions.js — Config', () => {
    beforeEach(loadModules);

    test('salvarConfig atualiza S.config', () => {
        document.getElementById('cfg-imprimir').checked = false;
        document.getElementById('cfg-largura').value = 'ticket-58mm';
        actions.salvarConfig();
        expect(S.config.imprimir).toBe(false);
        expect(S.config.largura).toBe('ticket-58mm');
    });

    test('salvarConfig persiste no localStorage', () => {
        document.getElementById('cfg-imprimir').checked = true;
        actions.salvarConfig();
        const saved = JSON.parse(localStorage.getItem('motoBarConfig'));
        expect(saved.imprimir).toBe(true);
    });
});

describe('actions.js — Fila Vendas', () => {
    beforeEach(loadModules);

    test('processarFilaVendas não faz nada com fila vazia', () => {
        S.filaVendas = [];
        actions.processarFilaVendas();
        expect(API.processarVenda).not.toHaveBeenCalled();
    });

    test('processarFilaVendas envia primeira venda da fila', () => {
        S.filaVendas = [{ id: '123', itens: [], total: 10, metodo: 'PIX' }];
        S.processandoFila = false;
        actions.processarFilaVendas();
        expect(API.processarVenda).toHaveBeenCalledWith(S.filaVendas[0]);
    });
});

describe('actions.js — Membros', () => {
    beforeEach(loadModules);

    test('popularSelectMembros preenche o select', () => {
        S.membros = [{ nome: 'Ana' }, { nome: 'Bruno' }, { nome: 'Carlos' }];
        actions.popularSelectMembros('select-membro');
        const options = document.querySelectorAll('#select-membro option');
        // 3 membros + 1 default option = 4
        expect(options.length).toBe(4);
        // Verificar ordem alfabética
        expect(options[1].value).toBe('Ana');
        expect(options[2].value).toBe('Bruno');
        expect(options[3].value).toBe('Carlos');
    });

    test('fecharModalSelecaoMembro fecha e limpa preview', () => {
        document.getElementById('modal-selecionar-membro').style.display = 'flex';
        document.getElementById('preview-divida').innerText = 'R$ 50,00';
        actions.fecharModalSelecaoMembro();
        expect(document.getElementById('modal-selecionar-membro').style.display).toBe('none');
        expect(document.getElementById('preview-divida').innerText).toBe('');
    });
});

describe('actions.js — Pagamento', () => {
    beforeEach(loadModules);

    test('iniciarPagamento bloqueia sem operador', () => {
        S.operadorAtual = '';
        actions.iniciarPagamento('DINHEIRO');
        expect(document.getElementById('toast').innerText).toContain('login');
    });

    test('iniciarPagamento bloqueia sem caixa aberto', () => {
        S.caixaAberto = false;
        actions.iniciarPagamento('DINHEIRO');
        expect(document.getElementById('toast').innerText).toContain('Abertura');
    });

    test('iniciarPagamento bloqueia com carrinho vazio', () => {
        S.carrinho = [];
        actions.iniciarPagamento('DINHEIRO');
        expect(document.getElementById('toast').innerText).toContain('Vazio');
    });
});
