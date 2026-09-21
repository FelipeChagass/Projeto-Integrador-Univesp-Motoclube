/**
 * Cadastro de membros, extratos e ajustes de saldo do painel administrativo.
 * Exporta membros como binding vivo para a carga sob demanda em navigation.js.
 */
import { UIModal } from '../../shared/modals.js';
import { BASE, authFetch } from './requests.js';
import { fecharModalAdmin, esc, toast, mostrarSkeleton } from './ui.js';

export let membros = [];
let ajusteMemberId = null;

export async function carregarMembros() {
    mostrarSkeleton('tabelaMembros', 4);
    const r = await authFetch(`${BASE}/api/admin/membros`);
    if (!r) return;
    const data = await r.json();
    const inativos = document.getElementById('mostrarMembrosInativos').checked;
    membros = (data.membros || []).filter(m => inativos || m.ativo);
    renderMembros();
}

export function renderMembros() {
    const tbody = document.getElementById('tabelaMembros');
    tbody.innerHTML = '';
    membros.forEach(m => {
        const tr = document.createElement('tr');
        if (!m.ativo) tr.classList.add('row-inactive');
        const saldoClass = m.saldo_devedor > 0 ? 'saldo-devedor' : 'saldo-ok';
        tr.innerHTML = `
            <td data-label="Nome"><input value="${esc(m.nome)}" data-mid="${m.id}" data-campo="nome"></td>
            <td class="${saldoClass}" data-label="Saldo Devedor">R$ ${m.saldo_devedor.toFixed(2)}</td>
            <td class="col-status" data-label="Status">${m.ativo ? '<span class="badge badge-active">Ativo</span>' : '<span class="badge badge-inactive">Inativo</span>'}</td>
            <td data-label="Ações"><div class="btn-group">
                <button class="btn btn-save btn-sm" data-action="salvar-membro" data-id="${m.id}">Salvar</button>
                <button class="btn btn-sm" data-action="ver-extrato" data-id="${m.id}" data-nome="${esc(m.nome)}">Extrato</button>
                <button class="btn btn-warn btn-sm" data-action="ajuste-saldo" data-id="${m.id}" data-nome="${esc(m.nome)}">Ajuste</button>
                ${m.ativo ? `<button class="btn btn-del btn-sm" data-action="desativar-membro" data-id="${m.id}" data-nome="${esc(m.nome)}">Desativar</button>` : `<button class="btn btn-reativar btn-sm" data-action="reativar-membro" data-id="${m.id}">Reativar</button>`}
            </div></td>`;
        tbody.appendChild(tr);
    });
}

export function abrirFormNovoMembro() {
    document.getElementById('formNovoMembro').classList.remove('d-none');
    document.body.classList.add('modal-open');
    document.getElementById('novo-membro-nome').value = '';
    document.getElementById('novo-membro-nome').focus();
}

export async function criarNovoMembro() {
    const nome = document.getElementById('novo-membro-nome').value.trim();
    if (!nome) return toast('Nome é obrigatório', false);
    const r = await authFetch(`${BASE}/api/admin/membros`, { method: 'POST', body: JSON.stringify({ nome }) });
    if (!r) return;
    const data = await r.json();
    toast(data.mensagem, data.status === 'ok');
    if (data.status === 'ok') { document.getElementById('formNovoMembro').classList.add('d-none'); document.body.classList.remove('modal-open'); carregarMembros(); }
}

export async function salvarMembro(id) {
    const input = document.querySelector(`[data-mid="${id}"][data-campo="nome"]`);
    if (!input) return;
    const r = await authFetch(`${BASE}/api/admin/membros/${id}`, { method: 'PUT', body: JSON.stringify({ nome: input.value }) });
    if (!r) return;
    const data = await r.json();
    toast(data.mensagem, data.status === 'ok');
    if (data.status === 'ok') carregarMembros();
}

export async function desativarMembro(id, nome) {
    UIModal.confirm(`Desativar membro "${nome}"?`, async function () {
        const r = await authFetch(`${BASE}/api/admin/membros/${id}`, { method: 'DELETE' });
        if (!r) return;
        const data = await r.json();
        toast(data.mensagem, data.status === 'ok');
        if (data.status === 'ok') carregarMembros();
    });
}

export async function reativarMembro(id) {
    const r = await authFetch(`${BASE}/api/admin/membros/${id}`, { method: 'PUT', body: JSON.stringify({ ativo: true }) });
    if (!r) return;
    const data = await r.json();
    toast(data.mensagem, data.status === 'ok');
    if (data.status === 'ok') carregarMembros();
}

export async function verExtrato(id, nome) {
    document.getElementById('extrato-titulo').textContent = `Extrato — ${nome}`;
    document.getElementById('extrato-body').innerHTML = '<p class="admin-loading-text">Carregando...</p>';
    document.getElementById('modalExtrato').classList.remove('d-none');
    document.body.classList.add('modal-open');
    const r = await authFetch(`${BASE}/api/admin/membros/${id}/extrato`);
    if (!r) return;
    const data = await r.json();
    document.getElementById('extrato-saldo').innerHTML = `<span class="${data.total > 0 ? 'saldo-devedor' : 'saldo-ok'}">Saldo devedor: R$ ${(data.total || 0).toFixed(2)}</span>`;
    if (!data.itens || data.itens.length === 0) {
        document.getElementById('extrato-body').innerHTML = '<p class="admin-empty-text">Nenhuma movimentação encontrada.</p>';
        return;
    }
    let html = '<table class="inner-table"><thead><tr><th>Data</th><th>Tipo</th><th>Origem</th><th>Descrição</th><th>Valor</th></tr></thead><tbody>';
    data.itens.forEach(i => {
        const tipoClass = i.tipo === 'debito' ? 'tipo-debito' : 'tipo-credito';
        html += `<tr><td>${i.data}</td><td class="${tipoClass}">${i.tipo}</td><td>${i.origem}</td><td>${esc(i.descricao)}</td><td>R$ ${i.valor.toFixed(2)}</td></tr>`;
    });
    html += '</tbody></table>';
    document.getElementById('extrato-body').innerHTML = html;
}

export function abrirAjusteSaldo(id, nome) {
    ajusteMemberId = id;
    document.getElementById('ajuste-membro-nome').textContent = nome;
    document.getElementById('ajuste-valor').value = '';
    document.getElementById('ajuste-descricao').value = '';
    document.getElementById('ajuste-tipo').value = 'credito';
    document.getElementById('modalAjuste').classList.remove('d-none');
    document.body.classList.add('modal-open');
}

export async function confirmarAjusteSaldo() {
    const valor = parseFloat(document.getElementById('ajuste-valor').value) || 0;
    const tipo = document.getElementById('ajuste-tipo').value;
    const descricao = document.getElementById('ajuste-descricao').value;
    if (valor <= 0) return toast('Valor deve ser positivo', false);
    const r = await authFetch(`${BASE}/api/admin/membros/${ajusteMemberId}/ajuste`, { method: 'POST', body: JSON.stringify({ valor, tipo, descricao }) });
    if (!r) return;
    const data = await r.json();
    toast(data.mensagem, data.status === 'ok');
    if (data.status === 'ok') { fecharModalAdmin('modalAjuste'); carregarMembros(); }
}
