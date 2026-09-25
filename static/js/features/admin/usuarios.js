import { prepararEdicao } from './edicao-linha.js';
/**
 * Cadastro e ativação de usuários via API administrativa, sem acesso direto ao Auth.
 * Exporta usuarios como binding vivo para navigation.js; autorização pertence ao backend.
 */
import { UIModal } from '../../shared/modals.js';
import { BASE, authFetch } from './requests.js';
import { esc, toast, mostrarSkeleton } from './ui.js';

export let usuarios = [];

export async function carregarUsuarios() {
    mostrarSkeleton('tabelaUsuarios', 5);
    const r = await authFetch(`${BASE}/api/admin/usuarios`);
    if (!r) return;
    const data = await r.json();
    usuarios = data.usuarios || [];
    renderUsuarios();
}

export function abrirFormNovoUsuario() {
    document.getElementById('formNovoUsuario').classList.remove('d-none');
    document.body.classList.add('modal-open');
    document.getElementById('novo-user-nome').value = '';
    document.getElementById('novo-user-email').value = '';
    document.getElementById('novo-user-senha').value = '';
    document.getElementById('novo-user-perfil').value = 'operador';
    document.getElementById('novo-user-nome').focus();
}

export function fecharFormNovoUsuario() {
    document.getElementById('formNovoUsuario').classList.add('d-none');
    document.body.classList.remove('modal-open');
}

export async function criarNovoUsuario() {
    const nome = document.getElementById('novo-user-nome').value.trim();
    const email = document.getElementById('novo-user-email').value.trim();
    const senha = document.getElementById('novo-user-senha').value.trim();
    const perfil = document.getElementById('novo-user-perfil').value;

    if (!nome || !email || !senha) return toast('Nome, e-mail e senha são obrigatórios', false);
    if (senha.length < 6) return toast('A senha deve ter pelo menos 6 caracteres', false);

    const r = await authFetch(`${BASE}/api/admin/usuarios`, { method: 'POST', body: JSON.stringify({ nome, email, senha, perfil }) });
    if (!r) return;
    const data = await r.json();
    toast(data.mensagem, data.status === 'ok');
    if (data.status === 'ok') { fecharFormNovoUsuario(); carregarUsuarios(); }
}

export function renderUsuarios() {
    const tbody = document.getElementById('tabelaUsuarios');
    tbody.innerHTML = '';
    usuarios.forEach(u => {
        const tr = document.createElement('tr');
        if (!u.ativo) tr.classList.add('row-inactive');
        tr.innerHTML = `
            <td data-label="Nome"><input value="${esc(u.nome)}" data-uid="${u.id}" data-campo="nome"></td>
            <td class="td-email" data-label="Email"><input type="email" value="${esc(u.email)}" data-uid="${u.id}" data-campo="email"></td>
            <td data-label="Nova Senha"><input type="password" value="" data-uid="${u.id}" data-campo="senha" placeholder="Opcional"></td>
            <td data-label="Perfil"><select data-uid="${u.id}" data-campo="perfil">
                <option value="operador" ${u.perfil === 'operador' ? 'selected' : ''}>Operador</option>
                <option value="admin" ${u.perfil === 'admin' ? 'selected' : ''}>Admin</option>
            </select></td>
            <td class="col-status" data-label="Status">${u.ativo ? '<span class="badge badge-active">Ativo</span>' : '<span class="badge badge-inactive">Inativo</span>'}</td>
            <td data-label="Ações"><div class="btn-group">
                <button class="btn btn-save btn-sm" data-action="salvar-usuario" data-id="${u.id}">Salvar</button>
                <button class="btn btn-del btn-sm" data-action="excluir-usuario" data-id="${u.id}" data-nome="${esc(u.nome)}">Excluir</button>
                ${!u.ativo ? `<button class="btn btn-reativar btn-sm" data-action="toggle-usuario" data-id="${u.id}" data-ativo="true">Reativar</button>` : ''}
            </div></td>`;
        prepararEdicao(tr);
        tbody.appendChild(tr);
    });
}

export async function salvarUsuario(id) {
    const dados = {};
    document.querySelectorAll(`[data-uid="${id}"]`).forEach(el => { dados[el.dataset.campo] = el.value; });
    const r = await authFetch(`${BASE}/api/admin/usuarios/${id}`, { method: 'PUT', body: JSON.stringify(dados) });
    if (!r) return;
    const data = await r.json();
    toast(data.mensagem, data.status === 'ok');
    if (data.status === 'ok') carregarUsuarios();
}

export async function toggleUsuario(id, ativo) {
    const r = await authFetch(`${BASE}/api/admin/usuarios/${id}`, { method: 'PUT', body: JSON.stringify({ ativo }) });
    if (!r) return;
    const data = await r.json();
    toast(data.mensagem, data.status === 'ok');
    if (data.status === 'ok') carregarUsuarios();
}

export async function excluirUsuario(id, nome) {
    UIModal.confirm(`Excluir definitivamente o acesso autenticavel de "${nome}"?`, async function () {
        const r = await authFetch(`${BASE}/api/admin/usuarios/${id}`, { method: 'DELETE' });
        if (!r) return;
        const data = await r.json();
        toast(data.mensagem, data.status === 'ok');
        if (data.status === 'ok') carregarUsuarios();
    });
}
