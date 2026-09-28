/** Editor de vendas e movimentos; vínculos financeiros sempre passam pela venda. */
import { authFetch } from './requests.js';
import { esc, toast, fecharModalAdmin } from './ui.js';
import { UIModal } from '../../shared/modals.js';

let edicao = null;
let voltarFoco = null;
const dinheiro = valor => Number(valor).toFixed(2);
const campo = (rotulo, conteudo) => `<label class="form-group">${rotulo}${conteudo}</label>`;

async function atualizar() {
    const [{ carregarVendas }, { carregarMembros }, { carregarProdutos }] = await Promise.all([
        import('./vendas.js'), import('./membros.js'), import('./produtos.js'),
    ]);
    await Promise.all([carregarVendas(), carregarMembros(), carregarProdutos()]);
}

function fechar() {
    fecharModalAdmin('modalEdicaoFinanceira');
    edicao = null;
    voltarFoco?.focus();
}

function abrir(titulo, campos, registro) {
    voltarFoco = document.activeElement;
    fecharModalAdmin('modalExtrato');
    edicao = registro;
    const form = document.getElementById('form-edicao-financeira');
    const vendaComItens = Boolean(registro.venda?.itens?.length);
    form.classList.toggle('edicao-venda', vendaComItens);
    const camposEdicao = document.getElementById('edicao-financeira-campos');
    camposEdicao.classList.toggle('form-grid', !vendaComItens);
    document.getElementById('edicao-financeira-titulo').textContent = titulo;
    camposEdicao.innerHTML = campos;
    if (vendaComItens) atualizarResumoVenda();
    document.getElementById('modalEdicaoFinanceira').classList.remove('d-none');
    document.body.classList.add('modal-open');
    document.querySelector('#edicao-financeira-campos input, #edicao-financeira-campos select')?.focus();
}

function montarEditorItensVenda(venda) {
    const itens = venda.itens.map((item, indice) => `
        <div class="edicao-item-venda" data-item-venda="${indice}">
            <div class="edicao-item-linha">
                <span class="edicao-item-arrastar" aria-hidden="true">⠿</span>
                <div class="edicao-item-produto">
                    <strong>${esc(item.nome_produto)}</strong>
                    <small>Código: ${esc(String(item.produto_id ?? '—'))}</small>
                </div>
                <div class="edicao-item-quantidade" aria-label="Quantidade">
                    <button type="button" data-quantidade-delta="-1" aria-label="Diminuir quantidade">−</button>
                    <input type="number" name="qtd-${indice}" min="0" max="100000" step="1" required
                        value="${item.quantidade}" aria-label="Quantidade de ${esc(item.nome_produto)}">
                    <button type="button" data-quantidade-delta="1" aria-label="Aumentar quantidade">+</button>
                </div>
                <label class="edicao-item-preco">
                    <span class="visually-hidden">Preço unitário de ${esc(item.nome_produto)}</span>
                    <input type="number" name="preco-${indice}" min="0" step="0.01" required
                        value="${dinheiro(item.preco_unitario)}" aria-label="Preço unitário (R$)">
                </label>
                <strong class="edicao-item-subtotal" data-subtotal-item>${dinheiro(item.preco_total)}</strong>
                <div class="edicao-item-acoes">
                    <button type="button" class="edicao-item-editar" data-alternar-observacao aria-label="Editar observação do item" title="Editar observação">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>
                    </button>
                    <button type="button" class="edicao-item-remover" data-remover-item aria-label="Remover ${esc(item.nome_produto)}" title="Remover item">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg>
                    </button>
                </div>
            </div>
            <label class="edicao-item-observacao" data-observacao-item hidden>
                Observação do item
                <textarea name="obs-${indice}" maxlength="1000" rows="2">${esc(item.observacoes || '')}</textarea>
            </label>
        </div>`).join('');

    return `
        <section class="edicao-itens-venda" aria-labelledby="edicao-itens-titulo">
            <header class="edicao-itens-cabecalho">
                <div class="edicao-itens-identificacao">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/></svg>
                    <span id="edicao-itens-titulo">Itens da venda</span>
                </div>
            </header>
            <div class="edicao-itens-tabela py-2">
                <div class="edicao-itens-colunas" aria-hidden="true"><span></span><span>Produto</span><span>Quantidade</span><span>Preço unitário (R$)</span><span>Subtotal (R$)</span><span>Ações</span></div>
                ${itens}
            </div>
        </section>
        <div class="edicao-venda-inferior">
            <section class="edicao-resumo-venda" aria-labelledby="edicao-resumo-titulo">
                <h4 id="edicao-resumo-titulo"><span aria-hidden="true">▤</span> Resumo da venda</h4>
                <dl><div><dt>Itens</dt><dd data-resumo-itens>0</dd></div><div><dt>Quantidade total</dt><dd data-resumo-quantidade>0</dd></div><div class="edicao-resumo-total"><dt>Total da venda</dt><dd data-resumo-total>R$ 0,00</dd></div></dl>
            </section>
            <aside class="edicao-alerta-venda" role="note">
                <h4><span aria-hidden="true">ⓘ</span> Atenção</h4>
                <p>Estoque, divisão e totais do caixa serão recalculados ao salvar as alterações.</p>
            </aside>
        </div>`;
}

function atualizarResumoVenda() {
    const campos = document.getElementById('edicao-financeira-campos');
    if (!campos.querySelector('.edicao-itens-venda')) return;
    let total = 0;
    let quantidadeTotal = 0;
    let itensAtivos = 0;
    campos.querySelectorAll('.edicao-item-venda').forEach(linha => {
        const quantidade = Math.max(0, Number(linha.querySelector('[name^="qtd-"]').value) || 0);
        const preco = Math.max(0, Number(linha.querySelector('[name^="preco-"]').value) || 0);
        const subtotal = quantidade * preco;
        linha.querySelector('[data-subtotal-item]').textContent = dinheiro(subtotal);
        linha.classList.toggle('removido', quantidade === 0);
        total += subtotal;
        quantidadeTotal += quantidade;
        if (quantidade > 0) itensAtivos += 1;
    });
    campos.querySelector('[data-resumo-itens]').textContent = itensAtivos;
    campos.querySelector('[data-resumo-quantidade]').textContent = quantidadeTotal;
    campos.querySelector('[data-resumo-total]').textContent = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(total);
}

async function excluir(url, versao, descricao) {
    UIModal.confirm(`${descricao} Excluir definitivamente? Estoque e valores relacionados serão recalculados.`, async () => {
        const r = await authFetch(url, { method: 'DELETE', body: JSON.stringify({ versao }) });
        if (!r) return;
        toast((await r.json()).mensagem, true);
        fecharModalAdmin('modalExtrato');
        await atualizar();
    });
}

export async function administrarVenda(id, acao) {
    const url = `/api/admin/vendas/${id}`;
    const resposta = await authFetch(url);
    if (!resposta) return;
    const { venda } = await resposta.json();
    if (acao === 'excluir') return excluir(url, venda.versao, `Venda de R$ ${dinheiro(venda.valor_total)} (${venda.nome_cliente || 'sem cliente'}).`);
    const metodos = venda.tipo_venda === 'fiado' ? [['fiado', 'Fiado']] : venda.tipo_venda === 'ajuste' ? [['ajuste', 'Ajuste']] : [
        ['dinheiro', 'Dinheiro'], ['pix', 'Pix'], ['cartao_credito', 'Cartão de crédito'], ['cartao_debito', 'Cartão de débito'],
    ];
    const opcoesPagamento = metodos.map(([valor, nome]) => `<option value="${valor}" ${venda.metodo_pagamento === valor ? 'selected' : ''}>${nome}</option>`).join('');
    let campos;
    if (venda.itens?.length) {
        campos = `<div class="edicao-venda-layout">
            <label class="edicao-venda-campo"><span class="edicao-venda-label"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></svg>Cliente</span>
                <input name="nome_cliente" maxlength="200" value="${esc(venda.nome_cliente || '')}" placeholder="Nome do cliente">
            </label>
            <label class="edicao-venda-campo"><span class="edicao-venda-label"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 10h20"/></svg>Pagamento</span>
                <select name="metodo_pagamento">${opcoesPagamento}</select>
            </label>
            <label class="edicao-venda-campo edicao-venda-observacoes"><span class="edicao-venda-label"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z"/></svg>Observações da venda</span>
                <textarea name="observacoes" maxlength="2000" rows="2" placeholder="Digite observações gerais da venda...">${esc(venda.observacoes || '')}</textarea>
                <small class="edicao-contador"><span data-contador-observacoes>${(venda.observacoes || '').length}</span>/2000</small>
            </label>
            ${montarEditorItensVenda(venda)}
        </div>`;
    } else {
        campos = campo('Cliente', `<input name="nome_cliente" maxlength="200" value="${esc(venda.nome_cliente || '')}">`)
            + campo('Pagamento', `<select name="metodo_pagamento">${opcoesPagamento}</select>`)
            + campo('Observações', `<textarea name="observacoes" maxlength="2000">${esc(venda.observacoes || '')}</textarea>`)
            + campo('Valor (R$)', `<input type="number" name="valor_total" min="0" step="0.01" required value="${dinheiro(venda.valor_total)}">`);
    }
    abrir('Editar venda', campos, { url, venda, versao: venda.versao });
}

export function administrarMovimento(membroId, movimento, acao) {
    if (movimento.venda_id) return administrarVenda(movimento.venda_id, acao);
    const url = `/api/admin/membros/${membroId}/movimentos/${movimento.id}`;
    if (acao === 'excluir') return excluir(url, movimento.versao, `Movimentação de R$ ${dinheiro(movimento.valor)}.`);
    const campos = campo('Tipo', `<select name="tipo"><option value="debito" ${movimento.tipo === 'debito' ? 'selected' : ''}>Débito</option><option value="credito" ${movimento.tipo === 'credito' ? 'selected' : ''}>Crédito</option></select>`)
        + campo('Valor (R$)', `<input name="valor" type="number" min="0" step="0.01" required value="${dinheiro(movimento.valor)}">`)
        + campo('Descrição', `<input name="descricao" maxlength="1000" value="${esc(movimento.descricao || '')}">`);
    abrir('Editar movimentação', campos, { url, versao: movimento.versao });
}

export function configurarEdicaoFinanceira() {
    document.querySelectorAll('[data-fechar-edicao]').forEach(botao => botao.addEventListener('click', fechar));
    const camposEdicao = document.getElementById('edicao-financeira-campos');
    camposEdicao?.addEventListener('click', event => {
        const botao = event.target.closest('button');
        if (!botao) return;
        const linha = botao.closest('.edicao-item-venda');
        if (!linha) return;
        const quantidade = linha.querySelector('[name^="qtd-"]');
        if (botao.hasAttribute('data-quantidade-delta')) {
            quantidade.value = Math.max(0, Math.min(100000, (Number(quantidade.value) || 0) + Number(botao.dataset.quantidadeDelta)));
            quantidade.dispatchEvent(new Event('input', { bubbles: true }));
        } else if (botao.hasAttribute('data-remover-item')) {
            quantidade.value = 0;
            quantidade.dispatchEvent(new Event('input', { bubbles: true }));
        } else if (botao.hasAttribute('data-alternar-observacao')) {
            const observacao = linha.querySelector('[data-observacao-item]');
            observacao.hidden = !observacao.hidden;
            if (!observacao.hidden) observacao.querySelector('textarea').focus();
        }
    });
    camposEdicao?.addEventListener('input', event => {
        if (event.target.matches('[name^="qtd-"], [name^="preco-"]')) atualizarResumoVenda();
        if (event.target.name === 'observacoes') {
            const contador = camposEdicao.querySelector('[data-contador-observacoes]');
            if (contador) contador.textContent = event.target.value.length;
        }
    });
    document.getElementById('tabelaVendas')?.addEventListener('click', event => {
        const botao = event.target.closest('[data-venda-acao]');
        if (botao) administrarVenda(botao.dataset.id, botao.dataset.vendaAcao);
    });
    document.getElementById('form-edicao-financeira')?.addEventListener('submit', async event => {
        event.preventDefault();
        const botao = document.getElementById('btn-salvar-edicao-financeira');
        if (!edicao || botao.disabled) return;
        const registro = edicao;
        const form = new FormData(event.target);
        const dados = { versao: registro.versao };
        if (registro.venda) {
            Object.assign(dados, { nome_cliente: form.get('nome_cliente'), metodo_pagamento: form.get('metodo_pagamento'), observacoes: form.get('observacoes') });
            dados.itens = (registro.venda.itens || []).map((item, indice) => ({ id: item.id, quantidade: Number(form.get(`qtd-${indice}`)), preco_unitario: form.get(`preco-${indice}`), observacoes: form.get(`obs-${indice}`) }));
            if (!dados.itens.length) dados.valor_total = form.get('valor_total');
        } else {
            Object.assign(dados, { tipo: form.get('tipo'), valor: form.get('valor'), descricao: form.get('descricao') });
        }
        botao.disabled = true;
        try {
            const resposta = await authFetch(registro.url, { method: 'PUT', body: JSON.stringify(dados) });
            if (!resposta) return;
            toast((await resposta.json()).mensagem, true);
            fechar();
            await atualizar();
        } finally {
            botao.disabled = false;
        }
    });
}
