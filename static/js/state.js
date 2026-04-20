import { LocalDB } from './utils.js';

export const S = {
    logoUrl: '/static/img/motorhead.png',
    produtos: [],
    membros: [],
    carrinho: [],
    filaVendas: [],
    produtoPendente: null,
    produtoEdicao: null,
    config: { imprimir: true, largura: 'ticket-80mm', logo: '/static/img/motorhead.png' },
    dadosFechamentoAtual: null,
    dadosRelatorioAtual: null,
    contextoMembro: '',
    modoGerenciaEstoque: false,
    estoqueOriginalBar: 0,
    operadorAtual: '',
    usuarioAtual: null,
    inicioTurno: null,
    pagamentoPendente: { tipo: '', valorTotal: 0, dados: null },
    caixaAberto: false,
    caixaId: null,
    valorAbertura: 0,
    tipoRelatorioAtual: '',
    enviandoVenda: false,
    processandoFila: false,
    lastProcessTime: 0,
};

export function salvarEstadoLocal() {
    LocalDB.set('motoBarCarrinho', JSON.stringify(S.carrinho));
}

export function salvarDadosLocais() {
    LocalDB.set('motoBarProdutos', JSON.stringify(S.produtos));
    LocalDB.set('motoBarMembros', JSON.stringify(S.membros));
    LocalDB.set('motoBarOperador', S.operadorAtual);
    LocalDB.set('motoBarInicio', S.inicioTurno ? S.inicioTurno.toString() : '');
    LocalDB.set('motoBarCarrinho', JSON.stringify(S.carrinho));
    LocalDB.set('motoBarFila', JSON.stringify(S.filaVendas));
    LocalDB.set('motoBarConfig', JSON.stringify(S.config));
    LocalDB.set('motoBarCaixaAberto', S.caixaAberto);
    LocalDB.set('motoBarValorAbertura', S.valorAbertura);
    if (S.caixaId) LocalDB.set('motoBarCaixaId', S.caixaId);
}

export function carregarDadosLocais() {
    try {
        const produtosJson = LocalDB.get('motoBarProdutos');
        if (produtosJson) {
            S.produtos = JSON.parse(produtosJson);
            if (!Array.isArray(S.produtos)) S.produtos = [];
        }
        const membrosJson = LocalDB.get('motoBarMembros');
        if (membrosJson) {
            S.membros = JSON.parse(membrosJson);
            if (!Array.isArray(S.membros)) S.membros = [];
        }
        const operadorSalvo = LocalDB.get('motoBarOperador');
        if (operadorSalvo) S.operadorAtual = operadorSalvo;
        const inicioSalvo = LocalDB.get('motoBarInicio');
        if (inicioSalvo) S.inicioTurno = new Date(inicioSalvo);
        const carrinhoJson = LocalDB.get('motoBarCarrinho');
        if (carrinhoJson) {
            S.carrinho = JSON.parse(carrinhoJson);
            if (!Array.isArray(S.carrinho)) S.carrinho = [];
        }
        const filaJson = LocalDB.get('motoBarFila');
        if (filaJson) {
            S.filaVendas = JSON.parse(filaJson);
            if (!Array.isArray(S.filaVendas)) S.filaVendas = [];
        }
        const configJson = LocalDB.get('motoBarConfig');
        if (configJson) S.config = JSON.parse(configJson);
        S.caixaAberto = LocalDB.get('motoBarCaixaAberto') === 'true';
        const valorAberturaSalvo = LocalDB.get('motoBarValorAbertura');
        if (valorAberturaSalvo) S.valorAbertura = Number(valorAberturaSalvo);
        const caixaIdSalvo = LocalDB.get('motoBarCaixaId');
        if (caixaIdSalvo) S.caixaId = caixaIdSalvo;
    } catch (e) {
        console.error('Erro cache', e);
    }
}
