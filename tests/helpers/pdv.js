/**
 * @jest-environment jsdom
 * Infraestrutura das ações do PDV: DOM mínimo, mocks ESM e IndexedDB exclusivo.
 * loadModules reinicializa o cenário; as asserções permanecem em actions.test.js.
 */
import { jest } from '@jest/globals';
import { S } from '../../static/js/features/pdv/state.js';
import { IDBFactory } from 'fake-indexeddb';
import { readFileSync } from 'node:fs';

/* ── Mockup: API module + globals (alinha com imports ESM) ── */
const mockedApi = {
    salvarDadosProduto: jest.fn(() => Promise.resolve()),
    processarVenda: jest.fn(() => Promise.resolve('OK')),
    quitarContaMembro: jest.fn(() => Promise.resolve('Conta quitada')),
    getListaMembros: jest.fn(() => Promise.resolve([{ nome: 'João' }, { nome: 'Maria' }])),
    buscarExtratoMembro: jest.fn(() => Promise.resolve({ total: 50, itens: [{ qtd: 2, produto: 'Cerveja', valor: 20 }] })),
    abrirCaixa: jest.fn(() => Promise.resolve({ status: 'ok', caixa_id: 'cx-test-123', valor_abertura: 150 })),
    fecharCaixa: jest.fn(() => Promise.resolve({ status: 'ok', caixa_id: 'cx-test-123' })),
    logout: jest.fn(() => Promise.resolve({ status: 'ok' })),
    invalidateCache: jest.fn(),
    getDadosIniciais: jest.fn(() => Promise.resolve({ produtos: [], membros: [] })),
    getProdutos: jest.fn(() => Promise.resolve({ produtos: [] })),
    verificarSenhaEstoque: jest.fn(() => Promise.resolve({ status: 'ok' })),
    gerarRelatorioCaixa: jest.fn(),
};
const mockedUiModal = {
    confirm: jest.fn((msg, cb) => cb()),
    alert: jest.fn(),
    prompt: jest.fn((msg, cb) => cb('senha-teste')),
};

jest.unstable_mockModule('../../static/js/shared/api.js', () => ({
    API: mockedApi,
}));
jest.unstable_mockModule('../../static/js/shared/modals.js', () => ({ UIModal: mockedUiModal }));

globalThis.API = mockedApi;

function mockMatchMedia() {
    window.matchMedia = jest.fn().mockImplementation(() => ({
        matches: false,
        media: '(max-width: 768px)',
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
    }));
}

/* ── Minimal DOM ── */
function setupDOM() {
    document.body.innerHTML = `
        <div id="loading" style="display:none"></div>
        <div id="toast">...</div>
        <div id="barra-operador"></div>
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
        <div id="pdv-extrato-membro">${readFileSync('templates/shared/extrato-membro.html', 'utf8').replace(/\{#[\s\S]*?#\}/g, '')}</div>
        <div id="modal-fechar-conta" style="display:none"></div>
        <p id="nome-fechar-conta"></p>
        <div id="lista-fechamento"></div>
        <div id="total-fechamento">R$ 0,00</div>
        <div id="area-impressao"></div>
        <div id="modal-fechar-caixa" style="display:none"></div>
        <input id="input-valor-fechamento" type="number" />
        <input id="input-obs-fechamento" type="text" />
        <div id="modal-relatorios" style="display:none"></div>
    `;
}

/* Helpers to load modules */
export let actions, ui, reports;
export async function loadModules() {
    setupDOM();
    jest.clearAllMocks();
    mockMatchMedia();
    localStorage.clear();
    globalThis.indexedDB = new IDBFactory();
    S.usuarioAtual = { id: 'operador-test', perfil: 'operador' };
    S.processandoFila = false;
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
    S.senhaEstoque = null;
    S.filaVendas = [];
    S.enviandoVenda = false;
    S.config = { imprimir: false, largura: 'ticket-80mm', logo: '/static/img/motorhead.svg' };
    ui = await import('../../static/js/features/pdv/ui.js');
    actions = await import('../../static/js/features/pdv/actions.js');
    reports = await import('../../static/js/features/pdv/reports.js');
}
