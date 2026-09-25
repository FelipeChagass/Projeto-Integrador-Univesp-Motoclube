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
    document.getElementById('edicao-financeira-titulo').textContent = titulo;
    document.getElementById('edicao-financeira-campos').innerHTML = campos;
    document.getElementById('modalEdicaoFinanceira').classList.remove('d-none');
    document.body.classList.add('modal-open');
    document.querySelector('#edicao-financeira-campos input, #edicao-financeira-campos select')?.focus();
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
    let campos = campo('Cliente', `<input name="nome_cliente" maxlength="200" value="${esc(venda.nome_cliente || '')}">`);
    const metodos = venda.tipo_venda === 'fiado' ? [['fiado', 'Fiado']] : venda.tipo_venda === 'ajuste' ? [['ajuste', 'Ajuste']] : [
        ['dinheiro', 'Dinheiro'], ['pix', 'Pix'], ['cartao_credito', 'Cartão de crédito'], ['cartao_debito', 'Cartão de débito'],
    ];
    campos += campo('Pagamento', `<select name="metodo_pagamento">${metodos.map(([valor, nome]) => `<option value="${valor}" ${venda.metodo_pagamento === valor ? 'selected' : ''}>${nome}</option>`).join('')}</select>`);
    campos += campo('Observações', `<input name="observacoes" maxlength="2000" value="${esc(venda.observacoes || '')}">`);
    if (venda.itens?.length) {
        campos += '<p class="span-2 mb-0">Use quantidade zero para remover um item.</p>';
        venda.itens.forEach((item, indice) => {
            campos += `<fieldset class="span-2 border rounded p-3"><legend class="fs-6">${esc(item.nome_produto)}</legend><div class="form-grid p-0">`;
            campos += campo('Quantidade', `<input type="number" name="qtd-${indice}" min="0" max="100000" step="1" required value="${item.quantidade}">`);
            campos += campo('Preço unitário (R$)', `<input type="number" name="preco-${indice}" min="0" step="0.01" required value="${dinheiro(item.preco_unitario)}">`);
            campos += campo('Observação do item', `<input name="obs-${indice}" maxlength="1000" value="${esc(item.observacoes || '')}">`);
            campos += '</div></fieldset>';
        });
    } else {
        campos += campo('Valor (R$)', `<input type="number" name="valor_total" min="0" step="0.01" required value="${dinheiro(venda.valor_total)}">`);
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
