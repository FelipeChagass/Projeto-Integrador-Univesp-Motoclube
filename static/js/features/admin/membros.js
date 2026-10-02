import { prepararEdicao } from './edicao-linha.js';
import { administrarMovimento } from './financeiro.js';
/**
 * Cadastro de membros, extratos e ajustes de saldo do painel administrativo.
 * Exporta membros como binding vivo para a carga sob demanda em navigation.js.
 */
import { UIModal } from '../../shared/modals.js';
import { BASE, authFetch } from './requests.js';
import { fecharModalAdmin, esc, toast, mostrarSkeleton } from './ui.js';
import { criarConsultaExtrato } from '../../shared/extrato-membro.js';
import { API } from '../../shared/api.js';

export let membros = [];
let ajusteMemberId = null;
const consultas = new WeakMap();

export function atualizarExtratoAberto() {
    const modal = document.getElementById('modalExtrato');
    if (modal && !modal.classList.contains('d-none') && !modal.classList.contains('closing')) {
        return consultas.get(document.getElementById('extrato-body'))?.atualizar();
    }
}

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
                <button class="btn btn-del btn-sm" data-action="excluir-membro" data-id="${m.id}" data-nome="${esc(m.nome)}">Excluir</button> ${!m.ativo ? `<button class="btn btn-reativar btn-sm" data-action="reativar-membro" data-id="${m.id}">Reativar</button>` : ''}
            </div></td>`;
        prepararEdicao(tr);
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

export async function excluirMembro(id, nome) {
    UIModal.confirm(`Excluir definitivamente membro "${nome}"?`, async function () {
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
    document.getElementById('modalExtrato').classList.remove('d-none');
    document.getElementById('modalExtrato').classList.remove('closing');
    document.body.classList.add('modal-open');
    const root = document.getElementById('extrato-body');
    if (!consultas.has(root)) consultas.set(root, criarConsultaExtrato(root, {
        // A consulta trata o erro após validar a geração; evita toasts de requisições antigas.
        buscar: (membroId, filtros) => API.request('GET', `/admin/membros/${encodeURIComponent(membroId)}/extrato?${new URLSearchParams(filtros)}`, undefined),
        notificar: mensagem => toast(mensagem, false),
        administrar: administrarMovimento,
    }));
    return consultas.get(root).selecionar(id);
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
