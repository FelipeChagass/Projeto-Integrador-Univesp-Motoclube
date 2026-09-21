/**
 * Filtros e renderização do histórico administrativo de vendas.
 * Usa requests/ui; limites de consulta são definidos pela API, não pelo DOM.
 */
import { BASE, authFetch } from './requests.js';
import { esc, mostrarSkeleton } from './ui.js';

export async function carregarVendas() {
    mostrarSkeleton('tabelaVendas', 6);
    const params = new URLSearchParams();
    const di = document.getElementById('vendas-data-inicio').value;
    const df = document.getElementById('vendas-data-fim').value;
    const tipo = document.getElementById('vendas-tipo').value;
    if (di) params.set('data_inicio', di);
    if (df) params.set('data_fim', df);
    if (tipo) params.set('tipo_venda', tipo);
    params.set('limite', '200');

    const r = await authFetch(`${BASE}/api/admin/vendas?${params}`);
    if (!r) return;
    const data = await r.json();
    const vendas = data.vendas || [];

    const total = vendas.reduce((s, v) => s + v.valor_total, 0);
    const resumoEl = document.getElementById('vendas-resumo');
    resumoEl.innerHTML = `
        <div class="stat-card"><span class="stat-number">${vendas.length}</span><span class="stat-label">Vendas</span></div>
        <div class="stat-card"><span class="stat-number">R$ ${total.toFixed(2)}</span><span class="stat-label">Total</span></div>
    `;

    const tbody = document.getElementById('tabelaVendas');
    tbody.innerHTML = '';
    vendas.forEach(v => {
        const tr = document.createElement('tr');
        const dataStr = v.criado_em ? new Date(v.criado_em).toLocaleString('pt-BR') : '—';
        const itensStr = (v.itens || []).map(i => `${i.quantidade}x ${i.nome_produto}`).join(', ') || '—';
        const tipoBadge = v.tipo_venda === 'fiado' ? 'badge-warn' : v.tipo_venda === 'recebimento_divida' ? 'badge-info' : 'badge-active';
        tr.innerHTML = `
            <td class="td-data" data-label="Data">${dataStr}</td>
            <td data-label="Tipo"><span class="badge ${tipoBadge}">${v.tipo_venda}</span></td>
            <td data-label="Método">${v.metodo_pagamento}</td>
            <td data-label="Operador">${esc(v.usuario_nome || '—')}</td>
            <td data-label="Cliente">${esc(v.nome_cliente || '—')}</td>
            <td class="td-valor" data-label="Valor">R$ ${v.valor_total.toFixed(2)}</td>
            <td class="td-itens" data-label="Itens">${esc(itensStr)}</td>`;
        tbody.appendChild(tr);
    });
}
