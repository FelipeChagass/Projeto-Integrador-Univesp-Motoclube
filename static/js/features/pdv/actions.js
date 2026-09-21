/**
 * Fachada pública das ações do PDV, preservando os imports dos consumidores.
 * Implemente novos comportamentos em actions/<responsabilidade>.js e exporte-os aqui.
 */
// Interface pública das ações do PDV. Implementações agrupadas por responsabilidade.
export { adicionarAoCarrinho, incrementarQtd, decrementarQtd, abrirModalObs, confirmarObs, cliqueProduto } from './actions/carrinho.js';
export { alternarModoEstoque, salvarEdicaoEstoque } from './actions/estoque.js';
export { iniciarPagamento, iniciarLiquidacao, prepararPagamentoGlobal, calcularTroco, finalizarPagamentoDinheiro, finalizarPagamentoCartao, registrarVendaOtimista, executarPagamentoFinal } from './actions/pagamentos.js';
export { verificarDividaSelecionada, abrirModalMembros, buscarMembrosFrescos, popularSelectMembros, confirmarSelecaoMembro, fecharModalSelecaoMembro, carregarDadosFechamento } from './actions/membros.js';
export { processarTrocaOperador, trocarMembro, abrirModalAberturaCaixa, confirmarAberturaValor, abrirConfig, salvarConfig } from './actions/sessao.js';
export { processarFilaVendas, abrirReconciliacao, sincronizarProdutosBackground } from './actions/sincronizacao.js';
