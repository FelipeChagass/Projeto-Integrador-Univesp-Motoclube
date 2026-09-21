/**
 * Pagamento, troco e criação de operações duráveis de venda/recebimento.
 * Persiste na fila antes de limpar o carrinho ou imprimir; sincronizacao.js obtém o ACK.
 */
import { S, salvarDadosLocais } from '../state.js';
import { formatCurrency } from '../../../shared/utils.js';
import { showToast, fecharModal, abrirModal, atualizarUI, renderizarCatalogo } from '../ui.js';
import { montarImpressao } from '../reports.js';
import { novoIdExterno, persistirOperacao, listarOperacoes } from '../offline-queue.js';
import { processarFilaVendas } from './sincronizacao.js';

/* ─── Payment ─── */

export function iniciarPagamento(metodo) {
    if (!S.operadorAtual) return showToast('Faça login primeiro.');
    if (!S.caixaAberto) return showToast('Necessário realizar a Abertura de Caixa!');
    if (!S.carrinho || !S.carrinho.length) return showToast('Carrinho Vazio!');
    const visitante = document.getElementById('input-cliente').value;
    const total = S.carrinho.reduce((acc, i) => acc + (Number(i.preco) * Number(i.qtd)), 0);
    prepararPagamentoGlobal('VENDA', total, metodo, visitante || 'BALCÃO');
}

export function iniciarLiquidacao(metodo) {
    if (!S.operadorAtual) return showToast('Faça login primeiro.');
    if (!S.caixaAberto) return showToast('Necessário realizar a Abertura de Caixa!');
    if (!S.dadosFechamentoAtual || S.dadosFechamentoAtual.total === 0) return showToast('Nada a pagar.');
    fecharModal('modal-fechar-conta');
    prepararPagamentoGlobal('DIVIDA', S.dadosFechamentoAtual.total, metodo, S.dadosFechamentoAtual.nome);
}

export function prepararPagamentoGlobal(tipo, total, metodo, dadosExtra) {
    S.pagamentoPendente = { tipo, valorTotal: total, dados: dadosExtra };
    if (metodo === 'DINHEIRO') {
        document.getElementById('valor-total-dinheiro').innerText = `Total: ${formatCurrency(total)}`;
        document.getElementById('valor-recebido').value = '';
        document.getElementById('display-troco').innerText = 'Troco: R$ 0,00';
        document.getElementById('btn-confirmar-dinheiro').style.opacity = '0.5';
        document.getElementById('btn-confirmar-dinheiro').style.pointerEvents = 'none';
        abrirModal('modal-dinheiro');
        document.getElementById('valor-recebido').focus();
    } else if (metodo === 'CARTAO') {
        abrirModal('modal-cartao');
    } else {
        executarPagamentoFinal(metodo);
    }
}

export function calcularTroco() {
    const recebido = parseFloat(document.getElementById('valor-recebido').value.replace(',', '.')) || 0;
    const troco = recebido - S.pagamentoPendente.valorTotal;
    const trocoDisplay = document.getElementById('display-troco');
    const btnConfirmar = document.getElementById('btn-confirmar-dinheiro');
    if (troco >= 0) {
        trocoDisplay.innerText = `Troco: ${formatCurrency(troco)}`;
        trocoDisplay.style.color = 'var(--success)';
        btnConfirmar.style.opacity = '1';
        btnConfirmar.style.pointerEvents = 'auto';
    } else {
        trocoDisplay.innerText = `Faltam: ${formatCurrency(Math.abs(troco))}`;
        trocoDisplay.style.color = 'var(--danger)';
        btnConfirmar.style.opacity = '0.5';
        btnConfirmar.style.pointerEvents = 'none';
    }
}

export function finalizarPagamentoDinheiro() {
    fecharModal('modal-dinheiro');
    executarPagamentoFinal('DINHEIRO');
}

export function finalizarPagamentoCartao(tipoCartao) {
    fecharModal('modal-cartao');
    executarPagamentoFinal(`CARTÃO - ${tipoCartao}`);
}

/* ─── Sales ─── */

export async function registrarVendaOtimista(metodo, cliente, membroId = null) {
    try {
        if (S.enviandoVenda) return;
        if (!S.caixaAberto || !S.caixaId || !S.usuarioAtual?.id || !S.carrinho.length) {
            return showToast('Confirme login, caixa aberto e itens antes de registrar a venda.');
        }
        S.enviandoVenda = true;
        cliente = cliente || 'CLIENTE';
        const total = S.carrinho.reduce((acc, i) => acc + (Number(i.preco) * Number(i.qtd)), 0);
        const vendaId = novoIdExterno();
        const novaVenda = {
            id_externo: vendaId,
            usuario_origem_id: S.usuarioAtual.id,
            membro_id: membroId,
            itens: JSON.parse(JSON.stringify(S.carrinho)),
            total, metodo, cliente,
            caixa_id: S.caixaId,
            dataHora: new Date().toISOString()
        };
        // Never clear the cart or print until the durable transaction is committed.
        await persistirOperacao(novaVenda);
        S.filaVendas = await listarOperacoes();
        if (S.produtos) {
            novaVenda.itens.forEach(item => {
                const prod = S.produtos.find(p => p.id == item.id && p.nome == item.nome);
                if (prod) prod.estoque_bar = Number(prod.estoque_bar) - item.qtd;
            });
        }
        try {
            if (S.config.imprimir) {
                montarImpressao(novaVenda.itens, metodo, cliente);
                setTimeout(() => window.print(), 1000);
            }
        } catch (e) { console.error('Erro Impressão', e); }

        S.carrinho = [];
        const inputCliente = document.getElementById('input-cliente');
        if (inputCliente) inputCliente.value = '';
        salvarDadosLocais();
        renderizarCatalogo();
        atualizarUI();
        showToast('Venda salva neste dispositivo. Aguardando confirmação do servidor.');
        await processarFilaVendas();
    } catch (e) {
        S.enviandoVenda = false;
        showToast(`Erro ao registrar venda: ${e.message}`);
        console.error(e);
    } finally { S.enviandoVenda = false; }
}

export async function executarPagamentoFinal(metodoFinal) {
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'none';
    if (S.enviandoVenda) return;
    S.enviandoVenda = true;

    if (S.pagamentoPendente.tipo === 'VENDA') {
        S.enviandoVenda = false;
        return registrarVendaOtimista(metodoFinal, S.pagamentoPendente.dados);
    } else if (S.pagamentoPendente.tipo === 'DIVIDA') {
        if (loadingEl) loadingEl.style.display = 'flex';
        try {
            if (!S.usuarioAtual?.id || !S.caixaId || !S.dadosFechamentoAtual?.membro_id) throw new Error('Selecione um membro e confirme o caixa.');
            const existentes = await listarOperacoes();
            const existente = existentes.find(v => v.payload.tipo_operacao === 'pagamento' && v.payload.membro_id === S.dadosFechamentoAtual.membro_id);
            if (existente) throw new Error('Já existe um recebimento pendente deste membro. Consulte Operações pendentes para reenviar a mesma operação.');
            const pagamento = {
                id_externo: novoIdExterno(), tipo_operacao: 'pagamento',
                usuario_origem_id: S.usuarioAtual.id, caixa_id: S.caixaId,
                membro_id: S.dadosFechamentoAtual.membro_id, metodo: metodoFinal,
                saldo_esperado: S.dadosFechamentoAtual.total,
                valor: S.pagamentoPendente.valorTotal
            };
            await persistirOperacao(pagamento);
            fecharModal('modal-fechar-conta');
            await processarFilaVendas();
        } catch (error) { showToast(`Pagamento não confirmado: ${error.message}`); }
        finally { S.enviandoVenda = false; if (loadingEl) loadingEl.style.display = 'none'; }
    }
}
