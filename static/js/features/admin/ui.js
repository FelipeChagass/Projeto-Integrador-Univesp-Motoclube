/**
 * Primitivas visuais do painel: escape de HTML, toast, skeleton e fechamento de modais.
 * Não consulta a API nem mantém estado dos cadastros.
 */


export function fecharModalAdmin(id) {
    const modal = document.getElementById(id);
    if (!modal || modal.classList.contains('d-none')) return;
    modal.classList.add('closing');
    setTimeout(() => {
        modal.classList.add('d-none');
        modal.style.display = '';
        modal.classList.remove('closing');

        // Verifica se ainda tem modal aberto
        const existeModalAberto = document.querySelectorAll('.modal-overlay:not(.d-none)').length > 0;
        if (!existeModalAberto) {
            document.body.classList.remove('modal-open');
        }
    }, 250);
}

export function esc(texto) { return (texto || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

export function toast(mensagem, sucesso) {
    const notificacao = document.getElementById('toast');
    notificacao.textContent = mensagem;
    notificacao.className = 'toast show ' + (sucesso ? 'ok' : 'err');
    setTimeout(() => notificacao.className = 'toast', 3500);
}

export function mostrarSkeleton(idCorpoTabela, quantidadeColunas) {
    const corpoTabela = document.getElementById(idCorpoTabela);
    if (!corpoTabela) return;
    const totalColunas = quantidadeColunas || 6;
    let linhasHtml = '';
    for (let indiceLinha = 0; indiceLinha < 5; indiceLinha++) {
        linhasHtml += '<tr class="skeleton-row">';
        for (let indiceColuna = 0; indiceColuna < totalColunas; indiceColuna++) {
            const larguraPercentual = 60 + Math.random() * 30;
            linhasHtml += `<td><div class="skel" style="width:${larguraPercentual.toFixed(0)}%;"></div></td>`;
        }
        linhasHtml += '</tr>';
    }
    corpoTabela.innerHTML = linhasHtml;
}
