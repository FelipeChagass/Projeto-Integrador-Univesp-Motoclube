import { API, UIModal } from './api.js';
import { initBottomSheetGestures } from './ui.js';
const BASE = '';
let produtos = [], membros = [], usuarios = [];
let uploadingProdutoId = null;
let ajusteMemberId = null;
let supabaseStorageClient = null;
const STORAGE_BUCKET = 'produto-imagens';

async function getAuthHeaders() {
    const client = await API._initSupabase();
    const headers = { 'Content-Type': 'application/json' };
    if (client) {
        const { data: { session } } = await client.auth.getSession();
        if (session && session.access_token) headers['Authorization'] = 'Bearer ' + session.access_token;
    }
    return headers;
}

async function getSupabaseClient() {
    if (supabaseStorageClient) return supabaseStorageClient;
    supabaseStorageClient = await API._initSupabase();
    return supabaseStorageClient;
}

async function authFetch(url, opts = {}) {
    const headers = await getAuthHeaders();
    if (opts.body && typeof opts.body === 'string') {

    } else if (opts.body instanceof FormData) {
        delete headers['Content-Type'];
    }
    const r = await fetch(url, { ...opts, headers: { ...headers, ...opts.headers } });
    if (r.status === 401 || r.status === 403) {
        toast('Acesso restrito. Apenas administradores podem acessar.', false);
        window.location.href = '/';
        return null;
    }
    return r;
}

function fecharModalAdmin(id) {
    const el = document.getElementById(id);
    if (!el) return;
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

function switchTab(name) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
    document.getElementById('tab-btn-' + name).classList.add('active');
    document.getElementById('tab-' + name).classList.add('active');

    if (name === 'membros' && membros.length === 0) carregarMembros();
    if (name === 'usuarios' && usuarios.length === 0) carregarUsuarios();
    if (name === 'vendas') carregarVendas();
    if (name === 'config') carregarConfig();
}

function openAdminSidebar() {
    const sidebar = document.getElementById('admin-sidebar-mobile');
    if (sidebar) {
        sidebar.classList.add('open');
        document.body.style.overflow = 'hidden';
    }
}

function closeAdminSidebar() {
    const sidebar = document.getElementById('admin-sidebar-mobile');
    if (sidebar) {
        sidebar.classList.remove('open');
        document.body.style.overflow = '';
    }
}

async function carregarProdutos() {
    const r = await authFetch(`${BASE}/api/admin/produtos`);
    if (!r) return;
    const data = await r.json();
    const inativos = document.getElementById('mostrarProdutosInativos').checked;
    produtos = (data.produtos || []).filter(p => inativos || p.ativo);
    renderProdutos();
}

function renderProdutos() {
    const tbody = document.getElementById('tabelaProdutos');
    tbody.innerHTML = '';
    produtos.forEach(p => {
        const tr = document.createElement('tr');
        if (!p.ativo) tr.classList.add('row-inactive');
        const imgHtml = p.url_imagem
            ? `<img src="${esc(p.url_imagem)}" class="img-thumb" onerror="this.style.display='none'">`
            : `<span class="img-placeholder" data-action="upload-img" data-id="${p.id}">—</span>`;
        tr.innerHTML = `
            <td class="col-imagem" data-label="Img">${imgHtml}
                <button class="btn-upload-sm" data-action="upload-img" data-id="${p.id}">Foto</button></td>
            <td data-label="Nome"><input value="${esc(p.nome)}" data-pid="${p.id}" data-campo="nome"></td>
            <td data-label="Preço"><input type="number" step="0.01" value="${p.preco_atual}" data-pid="${p.id}" data-campo="preco_atual"></td>
            <td data-label="Categ."><select data-pid="${p.id}" data-campo="categoria">
                <option value="bebida" ${p.categoria === 'bebida' ? 'selected' : ''}>Bebida</option>
                <option value="comida" ${p.categoria === 'comida' ? 'selected' : ''}>Comida</option>
                <option value="outro"  ${p.categoria === 'outro' ? 'selected' : ''}>Outro</option>
            </select></td>
            <td data-label="Estoque"><div class="td-estoque">Bar: <b>${p.estoque_bar}</b><br>Dep: <b>${p.estoque_deposito}</b></div></td>
            <td data-label="Mínimos"><div class="td-minimos">Mín Bar: <b>${p.estoque_min_bar}</b><br>Mín Dep: <b>${p.estoque_min_deposito}</b></div></td>
            <td class="col-status" data-label="Status">${p.ativo ? '<span class="badge badge-active">Ativo</span>' : '<span class="badge badge-inactive">Inativo</span>'}</td>
            <td data-label="Ações"><div class="btn-group">
                <button class="btn btn-save btn-sm" data-action="salvar-produto" data-id="${p.id}">Salvar</button>
                <button class="btn btn-sm" data-action="ajuste-estoque" data-id="${p.id}">Estoque</button>
                ${p.ativo
                ? `<button class="btn btn-del btn-sm" data-action="desativar-produto" data-id="${p.id}" data-nome="${esc(p.nome)}">Desativar</button>`
                : `<button class="btn btn-reativar btn-sm" data-action="reativar-produto" data-id="${p.id}">Reativar</button>`}
            </div></td>`;
        tbody.appendChild(tr);
    });
}

function abrirFormNovoProduto() { document.getElementById('formNovoProduto').classList.remove('d-none'); document.body.classList.add('modal-open'); document.getElementById('novo-nome').focus(); }
function fecharFormNovoProduto() { document.getElementById('formNovoProduto').classList.add('d-none'); document.body.classList.remove('modal-open'); }

function previewNovoProdutoImagem(input) {
    if (!input.files || !input.files[0]) return;
    const reader = new FileReader();
    reader.onload = e => { document.getElementById('novo-img-tag').src = e.target.result; document.getElementById('novo-img-preview').classList.remove('d-none'); document.getElementById('novo-upload-zone').classList.add('d-none'); };
    reader.readAsDataURL(input.files[0]);
}
function removerNovoPreview() { document.getElementById('novo-img-preview').classList.add('d-none'); document.getElementById('novo-upload-zone').classList.remove('d-none'); document.getElementById('novo-file-input').value = ''; }

async function criarNovoProduto() {
    const nome = document.getElementById('novo-nome').value.trim();
    const preco = parseFloat(document.getElementById('novo-preco').value) || 0;
    const categoria = document.getElementById('novo-categoria').value;
    const fileInput = document.getElementById('novo-file-input');
    if (!nome) return toast('Nome é obrigatório', false);
    if (preco <= 0) return toast('Preço deve ser maior que zero', false);

    const r = await authFetch(`${BASE}/api/admin/produtos`, { method: 'POST', body: JSON.stringify({ nome, preco_atual: preco, categoria }) });
    if (!r) return;
    const data = await r.json();
    if (data.status !== 'ok') return toast(data.mensagem || 'Erro', false);
    toast('Produto criado!', true);
    if (fileInput.files && fileInput.files[0] && data.produto) await uploadImagemParaProduto(data.produto.id, fileInput.files[0]);
    fecharFormNovoProduto();
    carregarProdutos();
}

async function deletarProduto(id, nome) {
    UIModal.confirm(`Desativar "${nome}"?`, async function () {
        const r = await authFetch(`${BASE}/api/admin/produtos/${id}`, { method: 'DELETE' });
        if (!r) return;
        const data = await r.json();
        toast(data.mensagem, data.status === 'ok');
        if (data.status === 'ok') carregarProdutos();
    });
}

async function reativarProduto(id) {
    const r = await authFetch(`${BASE}/api/admin/produtos/${id}`, { method: 'PUT', body: JSON.stringify({ ativo: true }) });
    if (!r) return;
    const data = await r.json();
    toast(data.mensagem, data.status === 'ok');
    if (data.status === 'ok') carregarProdutos();
}

async function salvarProduto(id) {
    const dados = {};
    document.querySelectorAll(`[data-pid="${id}"]`).forEach(el => { dados[el.dataset.campo] = el.type === 'number' ? Number(el.value) : el.value; });
    const r = await authFetch(`${BASE}/api/admin/produtos/${id}`, { method: 'PUT', body: JSON.stringify(dados) });
    if (!r) return;
    const data = await r.json();
    toast(data.mensagem, data.status === 'ok');
    if (data.status === 'ok') carregarProdutos();
}

let ajusteProdutoId = null;

function abrirAjusteEstoque(id) {
    const prod = produtos.find(p => p.id === id);
    if (!prod) return;
    ajusteProdutoId = id;
    document.getElementById('ajuste-estoque-nome').textContent = prod.nome;
    document.getElementById('ajuste-estoque-bar').value = prod.estoque_bar;
    document.getElementById('ajuste-estoque-deposito').value = prod.estoque_deposito;
    document.getElementById('ajuste-estoque-min-bar').value = prod.estoque_min_bar || 0;
    document.getElementById('ajuste-estoque-min-deposito').value = prod.estoque_min_deposito || 0;
    document.getElementById('ajuste-estoque-motivo').value = '';
    document.getElementById('modalAjusteEstoque').classList.remove('d-none');
    document.body.classList.add('modal-open');
}

async function confirmarAjusteEstoque() {
    const dados = {
        estoque_bar: parseInt(document.getElementById('ajuste-estoque-bar').value) || 0,
        estoque_deposito: parseInt(document.getElementById('ajuste-estoque-deposito').value) || 0,
        estoque_min_bar: parseInt(document.getElementById('ajuste-estoque-min-bar').value) || 0,
        estoque_min_deposito: parseInt(document.getElementById('ajuste-estoque-min-deposito').value) || 0,
        motivo: document.getElementById('ajuste-estoque-motivo').value.trim()
    };
    if (!dados.motivo) return toast('O motivo do ajuste é obrigatório.', false);

    const r = await authFetch(`${BASE}/api/admin/produtos/${ajusteProdutoId}/estoque`, { method: 'POST', body: JSON.stringify(dados) });
    if (!r) return;
    const data = await r.json();
    toast(data.mensagem, data.status === 'ok');
    if (data.status === 'ok') {
        fecharModalAdmin('modalAjusteEstoque');
        carregarProdutos();
    }
}

function abrirUpload(produtoId) { uploadingProdutoId = produtoId; document.getElementById('fileInput').click(); }

async function uploadImagem(input) {
    if (!input.files || !input.files[0] || !uploadingProdutoId) return;
    await uploadImagemParaProduto(uploadingProdutoId, input.files[0]);
    uploadingProdutoId = null;
    toast('Imagem salva!', true);
    carregarProdutos();
}

async function uploadImagemParaProduto(produtoId, file) {
    const client = await getSupabaseClient();
    let publicUrl = null;
    if (client) {
        try {
            const ext = file.name.split('.').pop().toLowerCase();
            const filePath = `produtos/${produtoId}.${ext}`;
            const { error } = await client.storage.from(STORAGE_BUCKET).upload(filePath, file, { upsert: true, contentType: file.type });
            if (error) throw error;
            const { data: urlData } = client.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
            if (urlData && urlData.publicUrl) publicUrl = urlData.publicUrl;
        } catch (e) {
            console.error('Storage erro:', e.message);
            toast('Erro ao enviar imagem para a nuvem. Verifique o Storage.', false);
            return;
        }
    }
    if (publicUrl) {
        await authFetch(`${BASE}/api/admin/produtos/${produtoId}`, { method: 'PUT', body: JSON.stringify({ url_imagem: publicUrl }) });
    } else {
        toast('Erro de inicialização do cliente Supabase.', false);
    }
}

async function carregarMembros() {
    mostrarSkeleton('tabelaMembros', 4);
    const r = await authFetch(`${BASE}/api/admin/membros`);
    if (!r) return;
    const data = await r.json();
    const inativos = document.getElementById('mostrarMembrosInativos').checked;
    membros = (data.membros || []).filter(m => inativos || m.ativo);
    renderMembros();
}

function renderMembros() {
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

function abrirFormNovoMembro() {
    document.getElementById('formNovoMembro').classList.remove('d-none');
    document.body.classList.add('modal-open');
    document.getElementById('novo-membro-nome').value = '';
    document.getElementById('novo-membro-nome').focus();
}

async function criarNovoMembro() {
    const nome = document.getElementById('novo-membro-nome').value.trim();
    if (!nome) return toast('Nome é obrigatório', false);
    const r = await authFetch(`${BASE}/api/admin/membros`, { method: 'POST', body: JSON.stringify({ nome }) });
    if (!r) return;
    const data = await r.json();
    toast(data.mensagem, data.status === 'ok');
    if (data.status === 'ok') { document.getElementById('formNovoMembro').classList.add('d-none'); document.body.classList.remove('modal-open'); carregarMembros(); }
}

async function salvarMembro(id) {
    const input = document.querySelector(`[data-mid="${id}"][data-campo="nome"]`);
    if (!input) return;
    const r = await authFetch(`${BASE}/api/admin/membros/${id}`, { method: 'PUT', body: JSON.stringify({ nome: input.value }) });
    if (!r) return;
    const data = await r.json();
    toast(data.mensagem, data.status === 'ok');
    if (data.status === 'ok') carregarMembros();
}

async function desativarMembro(id, nome) {
    UIModal.confirm(`Desativar membro "${nome}"?`, async function () {
        const r = await authFetch(`${BASE}/api/admin/membros/${id}`, { method: 'DELETE' });
        if (!r) return;
        const data = await r.json();
        toast(data.mensagem, data.status === 'ok');
        if (data.status === 'ok') carregarMembros();
    });
}

async function reativarMembro(id) {
    const r = await authFetch(`${BASE}/api/admin/membros/${id}`, { method: 'PUT', body: JSON.stringify({ ativo: true }) });
    if (!r) return;
    const data = await r.json();
    toast(data.mensagem, data.status === 'ok');
    if (data.status === 'ok') carregarMembros();
}

async function verExtrato(id, nome) {
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

function abrirAjusteSaldo(id, nome) {
    ajusteMemberId = id;
    document.getElementById('ajuste-membro-nome').textContent = nome;
    document.getElementById('ajuste-valor').value = '';
    document.getElementById('ajuste-descricao').value = '';
    document.getElementById('ajuste-tipo').value = 'credito';
    document.getElementById('modalAjuste').classList.remove('d-none');
    document.body.classList.add('modal-open');
}

async function confirmarAjusteSaldo() {
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

async function carregarUsuarios() {
    mostrarSkeleton('tabelaUsuarios', 5);
    const r = await authFetch(`${BASE}/api/admin/usuarios`);
    if (!r) return;
    const data = await r.json();
    usuarios = data.usuarios || [];
    renderUsuarios();
}

function abrirFormNovoUsuario() {
    document.getElementById('formNovoUsuario').classList.remove('d-none');
    document.body.classList.add('modal-open');
    document.getElementById('novo-user-nome').value = '';
    document.getElementById('novo-user-email').value = '';
    document.getElementById('novo-user-senha').value = '';
    document.getElementById('novo-user-perfil').value = 'operador';
    document.getElementById('novo-user-nome').focus();
}

function fecharFormNovoUsuario() {
    document.getElementById('formNovoUsuario').classList.add('d-none');
    document.body.classList.remove('modal-open');
}

async function criarNovoUsuario() {
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

function renderUsuarios() {
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
                ${u.ativo
                ? `<button class="btn btn-del btn-sm" data-action="toggle-usuario" data-id="${u.id}" data-ativo="false">Desativar</button>`
                : `<button class="btn btn-reativar btn-sm" data-action="toggle-usuario" data-id="${u.id}" data-ativo="true">Reativar</button>
                   <button class="btn btn-del btn-sm" data-action="excluir-usuario" data-id="${u.id}" data-nome="${esc(u.nome)}">Excluir</button>`}
            </div></td>`;
        tbody.appendChild(tr);
    });
}

async function salvarUsuario(id) {
    const dados = {};
    document.querySelectorAll(`[data-uid="${id}"]`).forEach(el => { dados[el.dataset.campo] = el.value; });
    const r = await authFetch(`${BASE}/api/admin/usuarios/${id}`, { method: 'PUT', body: JSON.stringify(dados) });
    if (!r) return;
    const data = await r.json();
    toast(data.mensagem, data.status === 'ok');
    if (data.status === 'ok') carregarUsuarios();
}

async function toggleUsuario(id, ativo) {
    const r = await authFetch(`${BASE}/api/admin/usuarios/${id}`, { method: 'PUT', body: JSON.stringify({ ativo }) });
    if (!r) return;
    const data = await r.json();
    toast(data.mensagem, data.status === 'ok');
    if (data.status === 'ok') carregarUsuarios();
}

async function excluirUsuario(id, nome) {
    UIModal.confirm(`Excluir definitivamente o acesso autenticavel de "${nome}"?`, async function () {
        const r = await authFetch(`${BASE}/api/admin/usuarios/${id}`, { method: 'DELETE' });
        if (!r) return;
        const data = await r.json();
        toast(data.mensagem, data.status === 'ok');
        if (data.status === 'ok') carregarUsuarios();
    });
}

async function carregarVendas() {
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
            <td data-label="Cliente">${esc(v.nome_cliente || '—')}</td>
            <td class="td-valor" data-label="Valor">R$ ${v.valor_total.toFixed(2)}</td>
            <td class="td-itens" data-label="Itens">${esc(itensStr)}</td>`;
        tbody.appendChild(tr);
    });
}

async function carregarConfig() {
    const r = await authFetch(`${BASE}/api/admin/config`);
    if (!r) return;
    const data = await r.json();
    const cfg = data.config || {};
    document.getElementById('cfg-imprimir').value = cfg.imprimir_automatico ? 'true' : 'false';
    document.getElementById('cfg-largura').value = cfg.largura_impressao || 'ticket-80mm';
}

async function salvarConfig() {
    const dados = {
        imprimir_automatico: document.getElementById('cfg-imprimir').value === 'true',
        largura_impressao: document.getElementById('cfg-largura').value,
    };
    const r = await authFetch(`${BASE}/api/admin/config`, { method: 'PUT', body: JSON.stringify(dados) });
    if (!r) return;
    const data = await r.json();
    toast(data.mensagem, data.status === 'ok');
}

function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function toast(msg, ok) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast show ' + (ok ? 'ok' : 'err');
    setTimeout(() => el.className = 'toast', 3500);
}

function mostrarSkeleton(tbodyId, cols) {
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

function setupEventListeners() {
    document.getElementById('tab-btn-produtos')?.addEventListener('click', () => switchTab('produtos'));
    document.getElementById('tab-btn-membros')?.addEventListener('click', () => switchTab('membros'));
    document.getElementById('tab-btn-usuarios')?.addEventListener('click', () => switchTab('usuarios'));
    document.getElementById('tab-btn-vendas')?.addEventListener('click', () => switchTab('vendas'));
    document.getElementById('tab-btn-config')?.addEventListener('click', () => switchTab('config'));

    document.getElementById('mostrarProdutosInativos')?.addEventListener('change', carregarProdutos);
    document.getElementById('mostrarMembrosInativos')?.addEventListener('change', carregarMembros);

    document.getElementById('btn-add-produto')?.addEventListener('click', abrirFormNovoProduto);
    document.getElementById('btn-close-form-produto')?.addEventListener('click', fecharFormNovoProduto);
    document.getElementById('novo-upload-zone')?.addEventListener('click', () => document.getElementById('novo-file-input').click());
    document.getElementById('novo-file-input')?.addEventListener('change', (e) => previewNovoProdutoImagem(e.target));
    document.getElementById('btn-remove-preview-produto')?.addEventListener('click', removerNovoPreview);
    document.getElementById('btn-save-novo-produto')?.addEventListener('click', criarNovoProduto);
    document.getElementById('btn-cancel-novo-produto')?.addEventListener('click', fecharFormNovoProduto);

    document.getElementById('btn-add-membro')?.addEventListener('click', abrirFormNovoMembro);
    document.getElementById('btn-close-form-membro')?.addEventListener('click', () => document.getElementById('formNovoMembro').classList.add('d-none'));
    document.getElementById('btn-save-novo-membro')?.addEventListener('click', criarNovoMembro);
    document.getElementById('btn-cancel-novo-membro')?.addEventListener('click', () => document.getElementById('formNovoMembro').classList.add('d-none'));

    document.getElementById('btn-add-usuario')?.addEventListener('click', abrirFormNovoUsuario);
    document.getElementById('btn-close-form-usuario')?.addEventListener('click', fecharFormNovoUsuario);
    document.getElementById('btn-save-novo-usuario')?.addEventListener('click', criarNovoUsuario);
    document.getElementById('btn-cancel-novo-usuario')?.addEventListener('click', fecharFormNovoUsuario);

    document.getElementById('btn-filtrar-vendas')?.addEventListener('click', carregarVendas);
    document.getElementById('btn-save-config')?.addEventListener('click', salvarConfig);

    document.getElementById('btn-close-modal-extrato')?.addEventListener('click', () => fecharModalAdmin('modalExtrato'));
    document.getElementById('btn-close-modal-ajuste')?.addEventListener('click', () => fecharModalAdmin('modalAjuste'));
    document.getElementById('btn-cancel-modal-ajuste')?.addEventListener('click', () => fecharModalAdmin('modalAjuste'));
    document.getElementById('btn-confirmar-ajuste-saldo')?.addEventListener('click', confirmarAjusteSaldo);

    document.getElementById('btn-close-modal-estoque')?.addEventListener('click', () => fecharModalAdmin('modalAjusteEstoque'));
    document.getElementById('btn-cancel-modal-estoque')?.addEventListener('click', () => fecharModalAdmin('modalAjusteEstoque'));
    document.getElementById('btn-confirmar-ajuste-estoque')?.addEventListener('click', confirmarAjusteEstoque);

    document.getElementById('fileInput')?.addEventListener('change', (e) => uploadImagem(e.target));

    document.getElementById('tabelaProdutos')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
        const id = parseInt(btn.dataset.id);
        if (action === 'upload-img') abrirUpload(id);
        if (action === 'salvar-produto') salvarProduto(id);
        if (action === 'ajuste-estoque') abrirAjusteEstoque(id);
        if (action === 'desativar-produto') deletarProduto(id, btn.dataset.nome);
        if (action === 'reativar-produto') reativarProduto(id);
    });

    document.getElementById('tabelaMembros')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        if (action === 'salvar-membro') salvarMembro(id);
        if (action === 'ver-extrato') verExtrato(id, btn.dataset.nome);
        if (action === 'ajuste-saldo') abrirAjusteSaldo(id, btn.dataset.nome);
        if (action === 'desativar-membro') desativarMembro(id, btn.dataset.nome);
        if (action === 'reativar-membro') reativarMembro(id);
    });

    document.getElementById('tabelaUsuarios')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        if (action === 'salvar-usuario') salvarUsuario(id);
        if (action === 'toggle-usuario') toggleUsuario(id, btn.dataset.ativo === 'true');
        if (action === 'excluir-usuario') excluirUsuario(id, btn.dataset.nome || 'usuário');
    });

    // ── Admin Sidebar Mobile ──
    document.getElementById('admin-btn-hamburger')?.addEventListener('click', openAdminSidebar);
    document.getElementById('admin-sidebar-close')?.addEventListener('click', closeAdminSidebar);
    document.querySelector('#admin-sidebar-mobile .sidebar-backdrop')?.addEventListener('click', closeAdminSidebar);

    document.querySelectorAll('#admin-sidebar-mobile [data-admin-tab]').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.adminTab;
            switchTab(tab);
            closeAdminSidebar();
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initBottomSheetGestures();
    setupEventListeners();
    mostrarSkeleton('tabelaProdutos', 8);
    carregarProdutos();

    // ── ESC fecha modal aberto ──
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const aberto = document.querySelector('.modal-overlay:not(.d-none)');
        if (aberto) {
            aberto.classList.add('closing');
            setTimeout(() => { aberto.classList.add('d-none'); aberto.classList.remove('closing'); }, 250);
        }
    });

    // ── Clique no overlay (fora do conteúdo) fecha o modal ──
    let _adminModalMouseDownOnOverlay = false;
    document.addEventListener('mousedown', (e) => {
        _adminModalMouseDownOnOverlay = e.target.classList.contains('modal-overlay');
    });

    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-overlay') && !e.target.classList.contains('d-none') && _adminModalMouseDownOnOverlay) {
            e.target.classList.add('closing');
            setTimeout(() => { e.target.classList.add('d-none'); e.target.classList.remove('closing'); }, 250);
        }
    });
});
