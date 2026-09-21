/**
 * Carrega e salva configurações globais do painel via requests.js.
 * Não confundir com preferências locais de impressão em pdv/actions/sessao.js.
 */
import { BASE, authFetch } from './requests.js';
import { toast } from './ui.js';

export async function carregarConfig() {
    const r = await authFetch(`${BASE}/api/admin/config`);
    if (!r) return;
    const data = await r.json();
    const cfg = data.config || {};
    document.getElementById('cfg-imprimir').value = cfg.imprimir_automatico ? 'true' : 'false';
    document.getElementById('cfg-largura').value = cfg.largura_impressao || 'ticket-80mm';
}

export async function salvarConfig() {
    const dados = {
        imprimir_automatico: document.getElementById('cfg-imprimir').value === 'true',
        largura_impressao: document.getElementById('cfg-largura').value,
    };
    const r = await authFetch(`${BASE}/api/admin/config`, { method: 'PUT', body: JSON.stringify(dados) });
    if (!r) return;
    const data = await r.json();
    toast(data.mensagem, data.status === 'ok');
}
