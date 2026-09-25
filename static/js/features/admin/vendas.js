/**
 * Filtros e renderização do histórico administrativo de vendas.
 * Usa requests/ui; limites de consulta são definidos pela API, não pelo DOM.
 */
import { BASE, authFetch } from './requests.js';
import { esc, mostrarSkeleton, toast } from './ui.js';
import { criarCsv } from './csv.js';

function filtrosVendas(limite) {
    const inicio = document.getElementById('vendas-data-inicio');
    const fim = document.getElementById('vendas-data-fim');
    if (!inicio.dataset.inicializado && !inicio.value && !fim.value) {
        const hoje = new Date();
        const anoMes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
        inicio.value = `${anoMes}-01`;
        fim.value = `${anoMes}-${new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate()}`;
    }
    inicio.dataset.inicializado = 'true';
    const params = new URLSearchParams();
    if (inicio.value) params.set('data_inicio', inicio.value);
    if (fim.value) params.set('data_fim', fim.value);
    const tipo = document.getElementById('vendas-tipo').value;
    if (tipo) params.set('tipo_venda', tipo);
    params.set('limite', String(limite));
    return params;
}

export async function exportarVendasCsv() {
    const botao = document.getElementById('btn-exportar-vendas');
    if (botao.disabled) return;
    botao.disabled = true;
    try {
        const params = filtrosVendas(500);
        const vendas = new Map();
        let offset = 0;
        while (true) {
            params.set('offset', String(offset));
            const resposta = await authFetch(`${BASE}/api/admin/vendas?${params}`);
            if (!resposta) return;
            const data = await resposta.json();
            for (const venda of data.vendas || []) vendas.set(venda.id, venda);
            if (!data.paginacao?.tem_mais) break;
            if (!data.vendas?.length) throw new Error('Não foi possível concluir a exportação.');
            offset += data.vendas.length;
        }
        const url = URL.createObjectURL(new Blob([criarCsv([...vendas.values()])], { type: 'text/csv;charset=utf-8;' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `vendas-${params.get('data_inicio') || 'inicio'}-${params.get('data_fim') || 'hoje'}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (erro) {
        toast(erro.message || 'Não foi possível exportar as vendas.', false);
    } finally {
        botao.disabled = false;
    }
}

export async function carregarVendas() {
    mostrarSkeleton('tabelaVendas', 6);
    const params = filtrosVendas(200);

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
            <td class="fw-semibold" data-label="Valor">R$ ${v.valor_total.toFixed(2)}</td>
            <td class="td-itens" data-label="Itens">${esc(itensStr)}</td>
            <td data-label="Ações"><div class="btn-group">
                <button type="button" class="btn btn-sm" data-venda-acao="editar" data-id="${v.id}">Editar</button>
                <button type="button" class="btn btn-del btn-sm" data-venda-acao="excluir" data-id="${v.id}">Excluir</button>
            </div></td>`;
        tbody.appendChild(tr);
    });
}
