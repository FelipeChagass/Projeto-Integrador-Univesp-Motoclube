import { beforeEach, expect, jest, test } from '@jest/globals';

const request = jest.fn();
const confirm = jest.fn();
jest.unstable_mockModule('../static/js/shared/api.js', () => ({ API: { request } }));
jest.unstable_mockModule('../static/js/shared/modals.js', () => ({ UIModal: { confirm } }));

const { administrarVenda, configurarEdicaoFinanceira } = await import('../static/js/features/admin/financeiro.js');

const venda = {
    id: 42, versao: 3, nome_cliente: 'Balcão', metodo_pagamento: 'dinheiro',
    tipo_venda: 'normal', observacoes: '', valor_total: 10,
    itens: [{ id: 5, produto_id: 7, nome_produto: 'Produto de nome longo', quantidade: 2,
        preco_unitario: 5, preco_total: 10, observacoes: 'Sem gelo' }],
};

beforeEach(() => {
    request.mockReset();
    confirm.mockReset();
    document.body.innerHTML = `
        <div id="toast"></div>
        <div id="modalExtrato" class="modal-overlay d-none"></div>
        <div id="modalEdicaoFinanceira" class="modal-overlay d-none">
            <form id="form-edicao-financeira" class="modal-content modal-lg">
                <h3 id="edicao-financeira-titulo"></h3>
                <div id="edicao-financeira-campos" class="form-grid"></div>
                <button type="button" data-fechar-edicao>Cancelar</button>
                <button id="btn-salvar-edicao-financeira" type="submit">Salvar</button>
            </form>
        </div>`;
    configurarEdicaoFinanceira();
});

test('abre editor com loading sem aguardar a API e preenche quando a venda chega', async () => {
    let concluirBusca;
    request.mockReturnValueOnce(new Promise(resolve => { concluirBusca = resolve; }));
    const carregamento = administrarVenda(42, 'editar');

    expect(document.getElementById('modalEdicaoFinanceira').classList.contains('d-none')).toBe(false);
    expect(document.querySelector('[role="status"]').textContent).toContain('Carregando');
    expect(document.getElementById('btn-salvar-edicao-financeira').disabled).toBe(true);
    expect(request).toHaveBeenCalledWith('GET', '/admin/vendas/42', undefined);

    concluirBusca({ venda });
    await carregamento;
    expect(document.querySelector('.edicao-item-produto strong').textContent).toBe(venda.itens[0].nome_produto);
    expect(document.querySelector('.edicao-item-preco-rotulo').textContent).toContain('Preço');
    expect(document.getElementById('btn-salvar-edicao-financeira').disabled).toBe(false);
});

test('fechar durante a busca não reabre o modal nem exibe dados atrasados', async () => {
    let concluirBusca;
    request.mockReturnValueOnce(new Promise(resolve => { concluirBusca = resolve; }));
    const carregamento = administrarVenda(42, 'editar');
    document.querySelector('[data-fechar-edicao]').click();
    concluirBusca({ venda });
    await carregamento;
    expect(document.querySelector('.edicao-item-produto')).toBeNull();
    expect(document.getElementById('btn-salvar-edicao-financeira').disabled).toBe(false);
});

test('resposta inválida mantém o modal aberto com erro e bloqueia salvamento', async () => {
    request.mockResolvedValueOnce({ status: 'ok' });
    await administrarVenda(42, 'editar');
    expect(document.getElementById('modalEdicaoFinanceira').classList.contains('d-none')).toBe(false);
    expect(document.querySelector('[role="alert"]').textContent).toContain('Não foi possível carregar');
    expect(document.getElementById('btn-salvar-edicao-financeira').disabled).toBe(true);
});

test('confirma exclusão antes de requisitar a versão atual da venda', async () => {
    await administrarVenda(42, 'excluir');
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(request).not.toHaveBeenCalled();

    request.mockResolvedValueOnce({ venda }).mockRejectedValueOnce(new Error('Falha de rede'));
    await confirm.mock.calls[0][1]();
    expect(request).toHaveBeenNthCalledWith(1, 'GET', '/admin/vendas/42', undefined);
    expect(request).toHaveBeenNthCalledWith(2, 'DELETE', '/admin/vendas/42', { versao: 3 });
});
