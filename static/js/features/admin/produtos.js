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
let produtoIdEnvioImagem = null;

export async function carregarProdutos() {
    const resposta = await authFetch(`${BASE}/api/admin/produtos`);
    if (!resposta) return;
    const dadosResposta = await resposta.json();
    const incluirInativos = document.getElementById('mostrarProdutosInativos').checked;
    produtos = (dadosResposta.produtos || []).filter(produto => incluirInativos || produto.ativo);
    renderProdutos();
}

export function renderProdutos() {
    const corpoTabela = document.getElementById('tabelaProdutos');
    corpoTabela.innerHTML = '';
    produtos.forEach(produto => {
        const linhaProduto = document.createElement('tr');
        if (!produto.ativo) linhaProduto.classList.add('row-inactive');
        const imagemHtml = produto.url_imagem
            ? `<img src="${esc(produto.url_imagem)}" class="img-thumb" onerror="this.style.display='none'">`
            : `<span class="img-placeholder" data-action="upload-img" data-id="${produto.id}">—</span>`;
        linhaProduto.innerHTML = `
            <td class="col-imagem" data-label="Img">${imagemHtml}
                <button class="btn-upload-sm" data-action="upload-img" data-id="${produto.id}">Foto</button></td>
            <td data-label="Nome"><input value="${esc(produto.nome)}" data-pid="${produto.id}" data-campo="nome"></td>
            <td data-label="Preço"><input type="number" step="0.01" value="${produto.preco_atual}" data-pid="${produto.id}" data-campo="preco_atual"></td>
            <td data-label="Categ."><select data-pid="${produto.id}" data-campo="categoria">
                <option value="bebida" ${produto.categoria === 'bebida' ? 'selected' : ''}>Bebida</option>
                <option value="comida" ${produto.categoria === 'comida' ? 'selected' : ''}>Comida</option>
                <option value="outro"  ${produto.categoria === 'outro' ? 'selected' : ''}>Outro</option>
            </select></td>
            <td data-label="Estoque"><div class="td-estoque">Bar: <b>${produto.estoque_bar}</b><br>Dep: <b>${produto.estoque_deposito}</b></div></td>
            <td data-label="Mínimos"><div class="td-minimos">Mín Bar: <b>${produto.estoque_min_bar}</b><br>Mín Dep: <b>${produto.estoque_min_deposito}</b></div></td>
            <td class="col-status" data-label="Status">${produto.ativo ? '<span class="badge badge-active">Ativo</span>' : '<span class="badge badge-inactive">Inativo</span>'}</td>
            <td data-label="Ações"><div class="btn-group">
                <button class="btn btn-save btn-sm" data-action="salvar-produto" data-id="${produto.id}">Salvar</button>
                <button class="btn btn-sm" data-action="ajuste-estoque" data-id="${produto.id}">Estoque</button>
                <button class="btn btn-del btn-sm" data-action="excluir-produto" data-id="${produto.id}" data-nome="${esc(produto.nome)}">Excluir</button> ${!produto.ativo ? `<button class="btn btn-reativar btn-sm" data-action="reativar-produto" data-id="${produto.id}">Reativar</button>` : ''}
            </div></td>`;
        prepararEdicao(linhaProduto);
        corpoTabela.appendChild(linhaProduto);
    });
}

export function abrirFormNovoProduto() { document.getElementById('formNovoProduto').classList.remove('d-none'); document.body.classList.add('modal-open'); document.getElementById('novo-nome').focus(); }
export function fecharFormNovoProduto() { document.getElementById('formNovoProduto').classList.add('d-none'); document.body.classList.remove('modal-open'); }

export function previewNovoProdutoImagem(campoArquivo) {
    if (!campoArquivo.files || !campoArquivo.files[0]) return;
    const leitorArquivo = new FileReader();
    leitorArquivo.onload = eventoLeitura => { document.getElementById('novo-img-tag').src = eventoLeitura.target.result; document.getElementById('novo-img-preview').classList.remove('d-none'); document.getElementById('novo-upload-zone').classList.add('d-none'); };
    leitorArquivo.readAsDataURL(campoArquivo.files[0]);
}
export function removerNovoPreview() { document.getElementById('novo-img-preview').classList.add('d-none'); document.getElementById('novo-upload-zone').classList.remove('d-none'); document.getElementById('novo-file-input').value = ''; }

export async function criarNovoProduto() {
    const nome = document.getElementById('novo-nome').value.trim();
    const preco = parseFloat(document.getElementById('novo-preco').value) || 0;
    const categoria = document.getElementById('novo-categoria').value;
    const campoArquivo = document.getElementById('novo-file-input');
    if (!nome) return toast('Nome é obrigatório', false);
    if (preco <= 0) return toast('Preço deve ser maior que zero', false);

    const resposta = await authFetch(`${BASE}/api/admin/produtos`, { method: 'POST', body: JSON.stringify({ nome, preco_atual: preco, categoria }) });
    if (!resposta) return;
    const dadosResposta = await resposta.json();
    if (dadosResposta.status !== 'ok') return toast(dadosResposta.mensagem || 'Erro', false);
    toast('Produto criado!', true);
    if (campoArquivo.files && campoArquivo.files[0] && dadosResposta.produto) await uploadImagemParaProduto(dadosResposta.produto.id, campoArquivo.files[0]);
    fecharFormNovoProduto();
    carregarProdutos();
}

export async function deletarProduto(id, nome) {
    UIModal.confirm(`Excluir definitivamente "${nome}"?`, async function () {
        const resposta = await authFetch(`${BASE}/api/admin/produtos/${id}`, { method: 'DELETE' });
        if (!resposta) return;
        const dadosResposta = await resposta.json();
        toast(dadosResposta.mensagem, dadosResposta.status === 'ok');
        if (dadosResposta.status === 'ok') carregarProdutos();
    });
}

export async function reativarProduto(id) {
    const resposta = await authFetch(`${BASE}/api/admin/produtos/${id}`, { method: 'PUT', body: JSON.stringify({ ativo: true }) });
    if (!resposta) return;
    const dadosResposta = await resposta.json();
    toast(dadosResposta.mensagem, dadosResposta.status === 'ok');
    if (dadosResposta.status === 'ok') carregarProdutos();
}

export async function salvarProduto(id) {
    const dados = {};
    document.querySelectorAll(`[data-pid="${id}"]`).forEach(campoProduto => { dados[campoProduto.dataset.campo] = campoProduto.type === 'number' ? Number(campoProduto.value) : campoProduto.value; });
    const resposta = await authFetch(`${BASE}/api/admin/produtos/${id}`, { method: 'PUT', body: JSON.stringify(dados) });
    if (!resposta) return;
    const dadosResposta = await resposta.json();
    toast(dadosResposta.mensagem, dadosResposta.status === 'ok');
    if (dadosResposta.status === 'ok') carregarProdutos();
}

let ajusteProdutoId = null;

export function abrirAjusteEstoque(id) {
    const produto = produtos.find(produtoCadastrado => produtoCadastrado.id === id);
    if (!produto) return;
    ajusteProdutoId = id;
    document.getElementById('ajuste-estoque-nome').textContent = produto.nome;
    document.getElementById('ajuste-estoque-bar').value = produto.estoque_bar;
    document.getElementById('ajuste-estoque-deposito').value = produto.estoque_deposito;
    document.getElementById('ajuste-estoque-min-bar').value = produto.estoque_min_bar || 0;
    document.getElementById('ajuste-estoque-min-deposito').value = produto.estoque_min_deposito || 0;
    document.getElementById('ajuste-estoque-motivo').value = '';
    document.getElementById('modalAjusteEstoque').classList.remove('d-none');
    document.body.classList.add('modal-open');
}

export async function confirmarAjusteEstoque() {
    const produtoOriginal = produtos.find(produto => produto.id === ajusteProdutoId);
    const dados = {
        estoque_bar_esperado: produtoOriginal?.estoque_bar,
        estoque_deposito_esperado: produtoOriginal?.estoque_deposito,
        estoque_bar: parseInt(document.getElementById('ajuste-estoque-bar').value) || 0,
        estoque_deposito: parseInt(document.getElementById('ajuste-estoque-deposito').value) || 0,
        estoque_min_bar: parseInt(document.getElementById('ajuste-estoque-min-bar').value) || 0,
        estoque_min_deposito: parseInt(document.getElementById('ajuste-estoque-min-deposito').value) || 0,
        motivo: document.getElementById('ajuste-estoque-motivo').value.trim()
    };
    if (!dados.motivo) return toast('O motivo do ajuste é obrigatório.', false);

    const resposta = await authFetch(`${BASE}/api/admin/produtos/${ajusteProdutoId}/estoque`, { method: 'POST', body: JSON.stringify(dados) });
    if (!resposta) return;
    const dadosResposta = await resposta.json();
    toast(dadosResposta.mensagem, dadosResposta.status === 'ok');
    if (dadosResposta.status === 'ok') {
        fecharModalAdmin('modalAjusteEstoque');
        carregarProdutos();
    }
}

export function abrirUpload(produtoId) { produtoIdEnvioImagem = produtoId; document.getElementById('fileInput').click(); }

export async function uploadImagem(campoArquivo) {
    if (!campoArquivo.files || !campoArquivo.files[0] || !produtoIdEnvioImagem) return;
    if (!await uploadImagemParaProduto(produtoIdEnvioImagem, campoArquivo.files[0])) return;
    produtoIdEnvioImagem = null;
    toast('Imagem salva!', true);
    carregarProdutos();
}

export async function uploadImagemParaProduto(produtoId, arquivoImagem) {
    const dadosFormulario = new FormData();
    dadosFormulario.append('imagem', arquivoImagem);
    try {
        await API.request('POST', `/admin/produtos/${produtoId}/imagem`, dadosFormulario);
        return true;
    } catch (erro) {
        toast(erro.message || 'Não foi possível enviar a imagem.', false);
        return false;
    }
}
