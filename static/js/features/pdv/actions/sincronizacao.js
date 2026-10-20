/**
 * Envio da fila, reconciliação/exportação e atualização silenciosa de estoque.
 * Reutiliza payload/ID do operador de origem; offline-queue.js valida o ACK e conserva falhas.
 */
import { API } from '../../../shared/api.js';
import { estadoPdv } from '../state.js';
import { formatCurrency } from '../../../shared/utils.js';
import { showToast, fecharModal, abrirModal, renderizarCatalogo } from '../ui.js';
import { listarOperacoes, registrarTentativa, confirmarOperacao, registrarFalha, reenviarOperacao } from '../offline-queue.js';

/* ─── Queue ─── */

export async function processarFilaVendas({ notificarFalhas = false } = {}) {
    if (estadoPdv.processandoFila || !estadoPdv.usuarioAtual?.id || navigator.onLine === false) return;
    estadoPdv.processandoFila = true;
    try {
        estadoPdv.filaVendas = await listarOperacoes();
        for (const registro of estadoPdv.filaVendas) {
            const dadosOperacao = registro.payload;
            if (dadosOperacao.usuario_origem_id !== estadoPdv.usuarioAtual?.id || !['pendente', 'aguardando_reenvio'].includes(registro.estado) || registro.proxima_tentativa > Date.now()) continue;
            await registrarTentativa(registro.id_externo);
            try {
                const confirmacaoServidor = dadosOperacao.tipo_operacao === 'pagamento' ? await API.quitarContaMembro(dadosOperacao) : await API.processarVenda(dadosOperacao);
                await confirmarOperacao(dadosOperacao, confirmacaoServidor);
                showToast(`Operação confirmada: ${formatCurrency(confirmacaoServidor.total_calculado)}`);
            } catch (erroSincronizacao) {
                await registrarFalha(registro.id_externo, erroSincronizacao);
                if (notificarFalhas) {
                    showToast(`Operação preservada: ${erroSincronizacao.message}. Consulte Operações pendentes.`);
                } else {
                    console.warn(`Falha ao sincronizar operação ${registro.id_externo}; registro preservado.`, erroSincronizacao);
                }
                if ([401, 403].includes(erroSincronizacao.status)) break;
            }
        }
        estadoPdv.filaVendas = await listarOperacoes();
    } catch (erroFila) { showToast(`Fila indisponível: ${erroFila.message}`); }
    finally { estadoPdv.processandoFila = false; }
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
        const listaPendencias = modal.querySelector('#lista-pendencias');
        for (const registro of registros) {
            const linhaPendencia = document.createElement('div');
            linhaPendencia.className = 'pendencia-item';
            const detalhesPendencia = document.createElement('p');
            detalhesPendencia.className = 'pendencia-detalhes';
            const erro = registro.ultimo_erro;
            const diagnostico = erro
                ? ` | erro: ${erro.code || 'DESCONHECIDO'}${erro.status ? ` (HTTP ${erro.status})` : ''} | ${erro.message || ''}${erro.request_id ? ` | request: ${erro.request_id}` : ''}${erro.ocorrido_em ? ` | em: ${new Date(erro.ocorrido_em).toLocaleString('pt-BR')}` : ''}`
                : '';
            detalhesPendencia.textContent = `${registro.id_externo} | ${registro.estado} | tentativas: ${registro.tentativas} | caixa: ${registro.payload.caixa_id || 'desconhecido'}${diagnostico}`;
            linhaPendencia.appendChild(detalhesPendencia);
            if (registro.payload.usuario_origem_id === estadoPdv.usuarioAtual?.id) {
                const botaoReenviar = document.createElement('button');
                botaoReenviar.className = 'btn-action btn-reenviar-pendencia';
                botaoReenviar.textContent = 'Reenviar mesma operação';
                botaoReenviar.onclick = async () => {
                    botaoReenviar.disabled = true;
                    try { await reenviarOperacao(registro.id_externo, estadoPdv.usuarioAtual.id); await processarFilaVendas({ notificarFalhas: true }); await abrirReconciliacao(); }
                    catch (erroReenvio) { showToast(erroReenvio.message); botaoReenviar.disabled = false; }
                };
                linhaPendencia.appendChild(botaoReenviar);
            }
            listaPendencias.appendChild(linhaPendencia);
        }
        modal.querySelector('#fechar-pendencias').onclick = () => fecharModal(modal.id);
        modal.querySelector('#exportar-pendencias').onclick = () => {
            const arquivoExportacao = new Blob([JSON.stringify({ exportado_em: new Date().toISOString(), operacoes: registros }, null, 2)], { type: 'application/json' });
            const urlExportacao = URL.createObjectURL(arquivoExportacao);
            const linkExportacao = document.createElement('a'); linkExportacao.href = urlExportacao; linkExportacao.download = 'operacoes-pendentes.json'; linkExportacao.click(); URL.revokeObjectURL(urlExportacao);
        };
        abrirModal(modal.id);
    } catch (erroReconciliacao) { showToast(`Reconciliação indisponível: ${erroReconciliacao.message}. Preserve os dados locais.`); }
}

export function sincronizarProdutosBackground() {
    if (estadoPdv.filaVendas.length > 0 || document.hidden || navigator.onLine === false) return;
    API.getProdutos()
        .then(dadosProdutos => {
            if (dadosProdutos && dadosProdutos.produtos) {
                dadosProdutos.produtos.forEach(produtoAtualizado => {
                    const produtoLocal = estadoPdv.produtos.find(produto => produto.id === produtoAtualizado.id);
                    if (produtoLocal) { produtoLocal.estoque_bar = produtoAtualizado.estoque_bar; produtoLocal.estoque_deposito = produtoAtualizado.estoque_deposito; }
                });
                renderizarCatalogo();
            }
        })
        .catch(erroSincronizacaoProdutos => console.warn('Erro na sincronização silenciosa:', erroSincronizacaoProdutos));
}
