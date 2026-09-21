/**
 * Troca de operador, abertura de caixa e preferências locais de impressão.
 * Atualiza a abertura somente após ACK válido; logout delega à API e preserva a fila.
 */
import { API } from '../../../shared/api.js';
import { UIModal } from '../../../shared/modals.js';
import { S, salvarDadosLocais } from '../state.js';
import { formatCurrency, LocalDB } from '../../../shared/utils.js';
import { showToast, fecharModal, abrirModal, atualizarUI, atualizarEstadoBotoes } from '../ui.js';

/* ─── Operator ─── */

export function processarTrocaOperador(nomeInput) {
    if (!nomeInput || S.operadorAtual === nomeInput) return;
    if (S.carrinho.length > 0) return showToast('Conclua a venda em andamento antes de trocar o operador', 'err');
    UIModal.confirm('Confirma a troca de operador?', () => {
        S.operadorAtual = nomeInput;
        LocalDB.set('motoBarOperador', S.operadorAtual);
        atualizarUI();
    });
}

export function trocarMembro() {
    UIModal.confirm('Deseja sair do operador atual e voltar ao login?', () => {
        fecharModal('modal-relatorios');
        API.logout({
            preserveKeys: ['motoBarCaixaAberto', 'motoBarCaixaId', 'motoBarValorAbertura']
        }).then(() => {
            S.operadorAtual = '';
            S.usuarioAtual = null;
            S.inicioTurno = null;
            atualizarUI();
            atualizarEstadoBotoes();
            window.location.replace('/login');
        }).catch(() => window.location.replace('/login'));
    });
}

/* ─── Cash Register ─── */

export function abrirModalAberturaCaixa() {
    if (S.caixaAberto) return showToast('O caixa já está aberto!');
    fecharModal('modal-relatorios');
    abrirModal('modal-abertura-caixa');
    document.getElementById('input-valor-abertura').focus();
}

export async function confirmarAberturaValor() {
    let val = parseFloat(document.getElementById('input-valor-abertura').value);
    if (!Number.isFinite(val) || val < 0) return showToast('Informe um valor de abertura válido.');
    try {
        const res = await API.abrirCaixa(val);
        if (res.status !== 'ok' || !res.caixa_id || res.valor_abertura == null || !Number.isFinite(Number(res.valor_abertura)) || Number(res.valor_abertura) < 0) throw new Error('Servidor não confirmou a abertura.');
        S.caixaId = res.caixa_id;
        S.valorAbertura = Number(res.valor_abertura);
        S.caixaAberto = true;
        S.inicioTurno = new Date();
        salvarDadosLocais();
        fecharModal('modal-abertura-caixa');
        showToast(`Caixa Aberto: ${formatCurrency(S.valorAbertura)}`);
        atualizarEstadoBotoes();
    } catch (error) { showToast(`Caixa não aberto: ${error.message}`); }
}

/* ─── Config ─── */

export function abrirConfig() {
    abrirModal('modal-config');
    document.getElementById('cfg-imprimir').checked = S.config.imprimir;
    document.getElementById('cfg-largura').value = S.config.largura;
}

export function salvarConfig() {
    S.config.imprimir = document.getElementById('cfg-imprimir').checked;
    S.config.largura = document.getElementById('cfg-largura').value;
    LocalDB.set('motoBarConfig', JSON.stringify(S.config));
    fecharModal('modal-config');
}
