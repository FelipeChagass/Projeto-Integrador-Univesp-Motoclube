/**
 * Primitivas visuais do painel: escape de HTML, toast, skeleton e fechamento de modais.
 * Não consulta a API nem mantém estado dos cadastros.
 */


export function fecharModalAdmin(id) {
    const el = document.getElementById(id);
    if (!el || el.classList.contains('d-none')) return;
    el.classList.add('closing');
    setTimeout(() => {
        el.classList.add('d-none');
        el.style.display = '';
        el.classList.remove('closing');

        // Verifica se ainda tem modal aberto
        const hasOpenModal = document.querySelectorAll('.modal-overlay:not(.d-none)').length > 0;
        if (!hasOpenModal) {
            document.body.classList.remove('modal-open');
        }
    }, 250);
}

export function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

export function toast(msg, ok) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast show ' + (ok ? 'ok' : 'err');
    setTimeout(() => el.className = 'toast', 3500);
}

export function mostrarSkeleton(tbodyId, cols) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    const numCols = cols || 6;
    let html = '';
    for (let i = 0; i < 5; i++) {
        html += '<tr class="skeleton-row">';
        for (let c = 0; c < numCols; c++) {
            const w = 60 + Math.random() * 30;
            html += `<td><div class="skel" style="width:${w.toFixed(0)}%;"></div></td>`;
        }
        html += '</tr>';
    }
    tbody.innerHTML = html;
}
