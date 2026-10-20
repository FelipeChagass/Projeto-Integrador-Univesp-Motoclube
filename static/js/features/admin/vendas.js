/**
 * Filtros e renderização do histórico administrativo de vendas.
 * Usa requests/ui; limites de consulta são definidos pela API, não pelo DOM.
 */
import { BASE, authFetch } from './requests.js';
import { esc, mostrarSkeleton, toast } from './ui.js';
import { criarCsv } from './csv.js';

function filtrosVendas(limite) {
    const campoDataInicio = document.getElementById('vendas-data-inicio');
    const campoDataFim = document.getElementById('vendas-data-fim');
    if (!campoDataInicio.dataset.inicializado && !campoDataInicio.value && !campoDataFim.value) {
        const hoje = new Date();
        const anoMes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
        campoDataInicio.value = `${anoMes}-01`;
        campoDataFim.value = `${anoMes}-${new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate()}`;
    }
    campoDataInicio.dataset.inicializado = 'true';
    const parametrosConsulta = new URLSearchParams();
    if (campoDataInicio.value) parametrosConsulta.set('data_inicio', campoDataInicio.value);
    if (campoDataFim.value) parametrosConsulta.set('data_fim', campoDataFim.value);
    const tipo = document.getElementById('vendas-tipo').value;
    if (tipo) parametrosConsulta.set('tipo_venda', tipo);
    parametrosConsulta.set('limite', String(limite));
    return parametrosConsulta;
}

export async function exportarVendasCsv() {
    const botao = document.getElementById('btn-exportar-vendas');
    if (botao.disabled) return;
    botao.disabled = true;
    try {
        const parametrosConsulta = filtrosVendas(500);
        const vendas = new Map();
        let deslocamentoPagina = 0;
        while (true) {
            parametrosConsulta.set('offset', String(deslocamentoPagina));
            const resposta = await authFetch(`${BASE}/api/admin/vendas?${parametrosConsulta}`);
            if (!resposta) return;
            const dadosResposta = await resposta.json();
            for (const venda of dadosResposta.vendas || []) vendas.set(venda.id, venda);
            if (!dadosResposta.paginacao?.tem_mais) break;
            if (!dadosResposta.vendas?.length) throw new Error('Não foi possível concluir a exportação.');
            deslocamentoPagina += dadosResposta.vendas.length;
        }
        const url = URL.createObjectURL(new Blob([criarCsv([...vendas.values()])], { type: 'text/csv;charset=utf-8;' }));
        const linkDownload = document.createElement('a');
        linkDownload.href = url;
        linkDownload.download = `vendas-${parametrosConsulta.get('data_inicio') || 'inicio'}-${parametrosConsulta.get('data_fim') || 'hoje'}.csv`;
        document.body.appendChild(linkDownload);
        linkDownload.click();
        linkDownload.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (erro) {
        toast(erro.message || 'Não foi possível exportar as vendas.', false);
    } finally {
        botao.disabled = false;
    }
}

export async function carregarVendas() {
    mostrarSkeleton('tabelaVendas', 6);
    const parametrosConsulta = filtrosVendas(200);

    const resposta = await authFetch(`${BASE}/api/admin/vendas?${parametrosConsulta}`);
    if (!resposta) return;
    const dadosResposta = await resposta.json();
    const vendas = dadosResposta.vendas || [];

    const total = vendas.reduce((totalAcumulado, venda) => totalAcumulado + venda.valor_total, 0);
    const resumoVendas = document.getElementById('vendas-resumo');
    resumoVendas.innerHTML = `
        <div class="stat-card"><span class="stat-number">${vendas.length}</span><span class="stat-label">Vendas</span></div>
        <div class="stat-card"><span class="stat-number">R$ ${total.toFixed(2)}</span><span class="stat-label">Total</span></div>
    `;

    const corpoTabela = document.getElementById('tabelaVendas');
    corpoTabela.innerHTML = '';
    vendas.forEach(venda => {
        const linhaVenda = document.createElement('tr');
        const dataFormatada = venda.criado_em ? new Date(venda.criado_em).toLocaleString('pt-BR') : '—';
        const descricaoItens = (venda.itens || []).map(itemVenda => `${itemVenda.quantidade}x ${itemVenda.nome_produto}`).join(', ') || '—';
        const classeIndicadorTipo = venda.tipo_venda === 'fiado' ? 'badge-warn' : venda.tipo_venda === 'recebimento_divida' ? 'badge-info' : 'badge-active';
        linhaVenda.innerHTML = `
            <td class="td-data" data-label="Data">${dataFormatada}</td>
            <td data-label="Tipo"><span class="badge ${classeIndicadorTipo}">${venda.tipo_venda}</span></td>
            <td data-label="Método">${venda.metodo_pagamento}</td>
            <td data-label="Operador">${esc(venda.usuario_nome || '—')}</td>
            <td data-label="Cliente">${esc(venda.nome_cliente || '—')}</td>
            <td class="fw-semibold" data-label="Valor">R$ ${venda.valor_total.toFixed(2)}</td>
            <td class="td-itens" data-label="Itens">${esc(descricaoItens)}</td>
            <td data-label="Ações"><div class="btn-group">
                <button type="button" class="btn btn-sm" data-venda-acao="editar" data-id="${venda.id}">Editar</button>
                <button type="button" class="btn btn-del btn-sm" data-venda-acao="excluir" data-id="${venda.id}">Excluir</button>
            </div></td>`;
        corpoTabela.appendChild(linhaVenda);
    });
}
