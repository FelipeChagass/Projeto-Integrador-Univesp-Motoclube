/**
 * Envio da fila, reconciliação/exportação e atualização silenciosa de estoque.
 * Reutiliza payload/ID do operador de origem; offline-queue.js valida o ACK e conserva falhas.
 */
import { API } from '../../../shared/api.js';
import { S } from '../state.js';
import { formatCurrency } from '../../../shared/utils.js';
import { showToast, fecharModal, abrirModal, renderizarCatalogo } from '../ui.js';
import { listarOperacoes, registrarTentativa, confirmarOperacao, registrarFalha, reenviarOperacao } from '../offline-queue.js';

/* ─── Queue ─── */

export async function processarFilaVendas({ notificarFalhas = false } = {}) {
    if (S.processandoFila || !S.usuarioAtual?.id || navigator.onLine === false) return;
    S.processandoFila = true;
    try {
        S.filaVendas = await listarOperacoes();
        for (const registro of S.filaVendas) {
            const payload = registro.payload;
            if (payload.usuario_origem_id !== S.usuarioAtual?.id || !['pendente', 'aguardando_reenvio'].includes(registro.estado) || registro.proxima_tentativa > Date.now()) continue;
            await registrarTentativa(registro.id_externo);
            try {
                const ack = payload.tipo_operacao === 'pagamento' ? await API.quitarContaMembro(payload) : await API.processarVenda(payload);
                await confirmarOperacao(payload, ack);
                showToast(`Operação confirmada: ${formatCurrency(ack.total_calculado)}`);
            } catch (error) {
                await registrarFalha(registro.id_externo, error);
                if (notificarFalhas) {
                    showToast(`Operação preservada: ${error.message}. Consulte Operações pendentes.`);
                } else {
                    console.warn(`Falha ao sincronizar operação ${registro.id_externo}; registro preservado.`, error);
                }
                if ([401, 403].includes(error.status)) break;
            }
        }
        S.filaVendas = await listarOperacoes();
    } catch (error) { showToast(`Fila indisponível: ${error.message}`); }
    finally { S.processandoFila = false; }
}

export async function abrirReconciliacao() {
    try {
        const registros = await listarOperacoes();
        let modal = document.getElementById('modal-reconciliacao');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'modal-reconciliacao';
            modal.className = 'modal-overlay';
            document.body.appendChild(modal);
        }
        modal.innerHTML = `<div class="modal-content modal-reconciliacao-content"><div class="modal-drag-header"><div class="drag-handle"></div></div><div class="modal-scroll-body"><h2>Operações pendentes (${registros.length})</h2><p class="reconciliacao-description">Registros permanecem neste dispositivo até confirmação. Exporte para reconciliar conflitos com o administrador. Não limpe os dados do navegador.</p><div id="lista-pendencias" class="lista-pendencias"></div><div class="reconciliacao-actions"><button class="btn-action" id="exportar-pendencias">EXPORTAR CÓPIA JSON</button><button class="btn-action" id="fechar-pendencias">FECHAR JANELA</button></div></div></div>`;
        const lista = modal.querySelector('#lista-pendencias');
        for (const registro of registros) {
            const row = document.createElement('div');
            row.className = 'pendencia-item';
            const details = document.createElement('p');
            details.className = 'pendencia-detalhes';
            const erro = registro.ultimo_erro;
            const diagnostico = erro
                ? ` | erro: ${erro.code || 'DESCONHECIDO'}${erro.status ? ` (HTTP ${erro.status})` : ''} | ${erro.message || ''}${erro.request_id ? ` | request: ${erro.request_id}` : ''}${erro.ocorrido_em ? ` | em: ${new Date(erro.ocorrido_em).toLocaleString('pt-BR')}` : ''}`
                : '';
            details.textContent = `${registro.id_externo} | ${registro.estado} | tentativas: ${registro.tentativas} | caixa: ${registro.payload.caixa_id || 'desconhecido'}${diagnostico}`;
            row.appendChild(details);
            if (registro.payload.usuario_origem_id === S.usuarioAtual?.id) {
                const btn = document.createElement('button');
                btn.className = 'btn-action btn-reenviar-pendencia';
                btn.textContent = 'Reenviar mesma operação';
                btn.onclick = async () => {
                    btn.disabled = true;
                    try { await reenviarOperacao(registro.id_externo, S.usuarioAtual.id); await processarFilaVendas({ notificarFalhas: true }); await abrirReconciliacao(); }
                    catch (error) { showToast(error.message); btn.disabled = false; }
                };
                row.appendChild(btn);
            }
            lista.appendChild(row);
        }
        modal.querySelector('#fechar-pendencias').onclick = () => fecharModal(modal.id);
        modal.querySelector('#exportar-pendencias').onclick = () => {
            const blob = new Blob([JSON.stringify({ exportado_em: new Date().toISOString(), operacoes: registros }, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a'); link.href = url; link.download = 'operacoes-pendentes.json'; link.click(); URL.revokeObjectURL(url);
        };
        abrirModal(modal.id);
    } catch (error) { showToast(`Reconciliação indisponível: ${error.message}. Preserve os dados locais.`); }
}

export function sincronizarProdutosBackground() {
    if (S.filaVendas.length > 0 || document.hidden || navigator.onLine === false) return;
    API.getProdutos()
        .then(dados => {
            if (dados && dados.produtos) {
                dados.produtos.forEach(pa => {
                    const pl = S.produtos.find(p => p.id === pa.id);
                    if (pl) { pl.estoque_bar = pa.estoque_bar; pl.estoque_deposito = pa.estoque_deposito; }
                });
                renderizarCatalogo();
            }
        })
        .catch(e => console.warn('Erro na sincronização silenciosa:', e));
}
