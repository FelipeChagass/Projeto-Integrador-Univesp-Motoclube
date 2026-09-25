import { prepararEdicao } from './edicao-linha.js';
/**
 * Cadastro, imagens e ajustes de estoque do painel; mantém o cache local de produtos.
 * Usa requests/API e ui; ajustes enviam o estoque esperado para detectar concorrência.
 */
import { API } from '../../shared/api.js';
import { UIModal } from '../../shared/modals.js';
import { BASE, authFetch } from './requests.js';
import { fecharModalAdmin, esc, toast } from './ui.js';

let produtos = [];
let uploadingProdutoId = null;

export async function carregarProdutos() {
    const r = await authFetch(`${BASE}/api/admin/produtos`);
    if (!r) return;
    const data = await r.json();
    const inativos = document.getElementById('mostrarProdutosInativos').checked;
    produtos = (data.produtos || []).filter(p => inativos || p.ativo);
    renderProdutos();
}

export function renderProdutos() {
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
                <button class="btn btn-del btn-sm" data-action="excluir-produto" data-id="${p.id}" data-nome="${esc(p.nome)}">Excluir</button> ${!p.ativo ? `<button class="btn btn-reativar btn-sm" data-action="reativar-produto" data-id="${p.id}">Reativar</button>` : ''}
            </div></td>`;
        prepararEdicao(tr);
        tbody.appendChild(tr);
    });
}

export function abrirFormNovoProduto() { document.getElementById('formNovoProduto').classList.remove('d-none'); document.body.classList.add('modal-open'); document.getElementById('novo-nome').focus(); }
export function fecharFormNovoProduto() { document.getElementById('formNovoProduto').classList.add('d-none'); document.body.classList.remove('modal-open'); }

export function previewNovoProdutoImagem(input) {
    if (!input.files || !input.files[0]) return;
    const reader = new FileReader();
    reader.onload = e => { document.getElementById('novo-img-tag').src = e.target.result; document.getElementById('novo-img-preview').classList.remove('d-none'); document.getElementById('novo-upload-zone').classList.add('d-none'); };
    reader.readAsDataURL(input.files[0]);
}
export function removerNovoPreview() { document.getElementById('novo-img-preview').classList.add('d-none'); document.getElementById('novo-upload-zone').classList.remove('d-none'); document.getElementById('novo-file-input').value = ''; }

export async function criarNovoProduto() {
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

export async function deletarProduto(id, nome) {
    UIModal.confirm(`Excluir definitivamente "${nome}"?`, async function () {
        const r = await authFetch(`${BASE}/api/admin/produtos/${id}`, { method: 'DELETE' });
        if (!r) return;
        const data = await r.json();
        toast(data.mensagem, data.status === 'ok');
        if (data.status === 'ok') carregarProdutos();
    });
}

export async function reativarProduto(id) {
    const r = await authFetch(`${BASE}/api/admin/produtos/${id}`, { method: 'PUT', body: JSON.stringify({ ativo: true }) });
    if (!r) return;
    const data = await r.json();
    toast(data.mensagem, data.status === 'ok');
    if (data.status === 'ok') carregarProdutos();
}

export async function salvarProduto(id) {
    const dados = {};
    document.querySelectorAll(`[data-pid="${id}"]`).forEach(el => { dados[el.dataset.campo] = el.type === 'number' ? Number(el.value) : el.value; });
    const r = await authFetch(`${BASE}/api/admin/produtos/${id}`, { method: 'PUT', body: JSON.stringify(dados) });
    if (!r) return;
    const data = await r.json();
    toast(data.mensagem, data.status === 'ok');
    if (data.status === 'ok') carregarProdutos();
}

let ajusteProdutoId = null;

export function abrirAjusteEstoque(id) {
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

export async function confirmarAjusteEstoque() {
    const original = produtos.find(p => p.id === ajusteProdutoId);
    const dados = {
        estoque_bar_esperado: original?.estoque_bar,
        estoque_deposito_esperado: original?.estoque_deposito,
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

export function abrirUpload(produtoId) { uploadingProdutoId = produtoId; document.getElementById('fileInput').click(); }

export async function uploadImagem(input) {
    if (!input.files || !input.files[0] || !uploadingProdutoId) return;
    if (!await uploadImagemParaProduto(uploadingProdutoId, input.files[0])) return;
    uploadingProdutoId = null;
    toast('Imagem salva!', true);
    carregarProdutos();
}

export async function uploadImagemParaProduto(produtoId, file) {
    const form = new FormData();
    form.append('imagem', file);
    try {
        await API.request('POST', `/admin/produtos/${produtoId}/imagem`, form);
        return true;
    } catch (error) {
        toast(error.message || 'Não foi possível enviar a imagem.', false);
        return false;
    }
}
