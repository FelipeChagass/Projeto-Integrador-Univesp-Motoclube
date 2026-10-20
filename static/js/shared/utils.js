export function esc(texto) {
    return String(texto || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

export function sanitizeUrl(url) {
    if (!url) return 'https://placehold.co/150x150/333/FFF?text=Foto';
    try {
        const urlAnalisada = new URL(url, window.location.origin);
        if (!['http:', 'https:', 'data:'].includes(urlAnalisada.protocol)) {
            return 'https://placehold.co/150x150/333/FFF?text=Erro';
        }
        return url;
    } catch {
        return 'https://placehold.co/150x150/333/FFF?text=Erro';
    }
}

export function formatCurrency(valorMonetario) {
    return `R$ ${(Number(valorMonetario) || 0).toFixed(2)}`;
}

export const LocalDB = {
    set: (chaveArmazenamento, valorArmazenado) => { try { localStorage.setItem(chaveArmazenamento, valorArmazenado); } catch { console.warn('Storage Bloqueado'); } },
    get: (chaveArmazenamento) => { try { return localStorage.getItem(chaveArmazenamento); } catch { return null; } },
    remove: (chaveArmazenamento) => { try { localStorage.removeItem(chaveArmazenamento); } catch { /* ignore */ } }
};
