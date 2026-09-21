export function esc(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

export function sanitizeUrl(url) {
    if (!url) return 'https://placehold.co/150x150/333/FFF?text=Foto';
    try {
        const parsed = new URL(url, window.location.origin);
        if (!['http:', 'https:', 'data:'].includes(parsed.protocol)) {
            return 'https://placehold.co/150x150/333/FFF?text=Erro';
        }
        return url;
    } catch (e) {
        return 'https://placehold.co/150x150/333/FFF?text=Erro';
    }
}

export function formatCurrency(v) {
    return `R$ ${(Number(v) || 0).toFixed(2)}`;
}

export const LocalDB = {
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { console.warn('Storage Bloqueado'); } },
    get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    remove: (k) => { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
};
