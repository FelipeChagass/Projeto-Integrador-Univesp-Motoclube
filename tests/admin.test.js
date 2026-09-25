/**
 * Contratos dos módulos administrativos com DOM real de teste e API simulada.
 * Cobre delegação, IDs, valores esperados, navegação e interrupção em falhas HTTP.
 */
import { beforeEach, expect, jest, test } from '@jest/globals';

const request = jest.fn();
jest.unstable_mockModule('../static/js/shared/api.js', () => ({
    API: { request },
}));
jest.unstable_mockModule('../static/js/shared/modals.js', () => ({
    UIModal: { confirm: (_message, onConfirm) => onConfirm() },
}));

const produtos = await import('../static/js/features/admin/produtos.js');
const membros = await import('../static/js/features/admin/membros.js');
const usuarios = await import('../static/js/features/admin/usuarios.js');
const vendas = await import('../static/js/features/admin/vendas.js');
const configuracoes = await import('../static/js/features/admin/configuracoes.js');
const { setupEventListeners } = await import('../static/js/features/admin/events.js');
const { switchTab } = await import('../static/js/features/admin/navigation.js');
const { authFetch } = await import('../static/js/features/admin/requests.js');
const { esc } = await import('../static/js/features/admin/ui.js');
const { criarCsv } = await import('../static/js/features/admin/csv.js');

const product = { id: 7, nome: 'Água', preco_atual: 10, estoque_bar: 5, estoque_deposito: 10,
    categoria: 'bebida', estoque_min_bar: 1, estoque_min_deposito: 2, ativo: true };
const member = { id: 'member-uuid', nome: 'Membro', saldo_devedor: 20, ativo: true };
const user = { id: 'user-uuid', nome: 'Admin', email: 'test@example.test', perfil: 'admin', ativo: true };
const settleEvents = () => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
    request.mockReset();
    request.mockImplementation(async (method, endpoint) => {
        if (method !== 'GET') return { status: 'ok', mensagem: 'Salvo' };
        if (endpoint === '/admin/produtos') return { status: 'ok', produtos: [product] };
        if (endpoint === '/admin/membros') return { status: 'ok', membros: [member] };
        if (endpoint === '/admin/usuarios') return { status: 'ok', usuarios: [user] };
        if (endpoint === '/admin/config') return { config: { imprimir_automatico: true, largura_impressao: 'ticket-58mm' } };
        if (endpoint.startsWith('/admin/vendas')) return { vendas: [{ valor_total: 10, tipo_venda: 'normal', metodo_pagamento: 'pix', itens: [] }] };
        throw new Error(`Unexpected test request: ${endpoint}`);
    });
    document.body.innerHTML = `
        <div id="toast"></div><button id="btn-exportar-vendas"></button>
        <input type="checkbox" id="mostrarProdutosInativos"><input type="checkbox" id="mostrarMembrosInativos">
        <table><tbody id="tabelaProdutos"></tbody></table>
        <table><tbody id="tabelaMembros"></tbody></table>
        <table><tbody id="tabelaUsuarios"></tbody></table>
        <table><tbody id="tabelaVendas"></tbody></table>
        <input id="vendas-data-inicio"><input id="vendas-data-fim"><input id="vendas-tipo"><div id="vendas-resumo"></div>
        <select id="cfg-imprimir"><option value="true">Sim</option><option value="false">Não</option></select>
        <select id="cfg-largura"><option value="ticket-80mm">80</option><option value="ticket-58mm">58</option></select>
        <div id="modalAjusteEstoque" class="modal-overlay d-none"></div><span id="ajuste-estoque-nome"></span>
        <input id="ajuste-estoque-bar"><input id="ajuste-estoque-deposito"><input id="ajuste-estoque-min-bar">
        <input id="ajuste-estoque-min-deposito"><input id="ajuste-estoque-motivo">
        ${['produtos', 'membros', 'usuarios', 'vendas', 'config'].map(name =>
            `<button id="tab-btn-${name}" class="tab-btn"></button><section id="tab-${name}" class="tab-content"></section>`).join('')}
    `;
});

test('os módulos de domínio não fazem requisições ao importar', () => {
    expect(request).not.toHaveBeenCalled();
    expect(esc('<nome>')).toBe('&lt;nome&gt;');
});

test('produtos: renderização e evento delegado conservam o ID numérico e o payload', async () => {
    setupEventListeners();
    await produtos.carregarProdutos();
    document.querySelector('[data-pid="7"][data-campo="preco_atual"]').value = '12.5';
    document.querySelector('[data-action="salvar-produto"]').click();
    await settleEvents();
    expect(request).toHaveBeenCalledWith('PUT', '/admin/produtos/7', { nome: 'Água', preco_atual: 12.5, categoria: 'bebida' });
    expect(document.querySelectorAll('#tabelaProdutos tr')).toHaveLength(1);
});

test('falha de atualização continua sem confirmação visual ou recarga como sucesso', async () => {
    await produtos.carregarProdutos();
    request.mockClear();
    request.mockRejectedValueOnce(new Error('Conflito de edição'));
    await produtos.salvarProduto(7);
    expect(request).toHaveBeenCalledTimes(1);
    expect(document.getElementById('toast').textContent).toBe('Conflito de edição');
    expect(document.querySelectorAll('#tabelaProdutos tr')).toHaveLength(1);
});

test('estoque mantém a fotografia esperada e o ID do produto no módulo correto', async () => {
    await produtos.carregarProdutos();
    produtos.abrirAjusteEstoque(7);
    document.getElementById('ajuste-estoque-bar').value = '6';
    document.getElementById('ajuste-estoque-motivo').value = 'Reposição';
    await produtos.confirmarAjusteEstoque();
    expect(request).toHaveBeenCalledWith('POST', '/admin/produtos/7/estoque', expect.objectContaining({
        estoque_bar: 6, estoque_bar_esperado: 5, estoque_deposito_esperado: 10, motivo: 'Reposição',
    }));
});

test('membros: evento conserva UUID e atualização de nome', async () => {
    setupEventListeners();
    await membros.carregarMembros();
    document.querySelector('[data-mid]').value = 'Nome atualizado';
    document.querySelector('[data-action="salvar-membro"]').click();
    await settleEvents();
    expect(request).toHaveBeenCalledWith('PUT', '/admin/membros/member-uuid', { nome: 'Nome atualizado' });
});

test('usuários: evento conserva UUID e booleano de ativação', async () => {
    setupEventListeners();
    await usuarios.carregarUsuarios();
    document.querySelector('[data-action="excluir-usuario"]').click();
    await settleEvents();
    expect(request).toHaveBeenCalledWith('DELETE', '/admin/usuarios/user-uuid', undefined);
});

test('navegação reutiliza dados de membros já carregados', async () => {
    await membros.carregarMembros();
    request.mockClear();
    switchTab('membros');
    expect(document.getElementById('tab-membros').classList.contains('active')).toBe(true);
    expect(request).not.toHaveBeenCalled();
});

test('vendas mantém filtros e configurações mantém booleanos', async () => {
    document.getElementById('vendas-data-inicio').value = '2026-09-01';
    await vendas.carregarVendas();
    expect(request).toHaveBeenCalledWith('GET', '/admin/vendas?data_inicio=2026-09-01&limite=200', undefined);
    await configuracoes.carregarConfig();
    expect(document.getElementById('cfg-largura').value).toBe('ticket-58mm');
    document.getElementById('cfg-imprimir').value = 'false';
    await configuracoes.salvarConfig();
    expect(request).toHaveBeenCalledWith('PUT', '/admin/config', { imprimir_automatico: false, largura_impressao: 'ticket-58mm' });
});

test('adapter compartilhado mantém tratamento de erro do painel', async () => {
    request.mockRejectedValueOnce(new Error('Não autorizado'));
    expect(await authFetch('/api/admin/usuarios')).toBeNull();
    expect(document.getElementById('toast').textContent).toBe('Não autorizado');
});

test('edição de linha habilita campos e cancelar restaura os valores', async () => {
    await produtos.carregarProdutos();
    const input = document.querySelector('[data-pid="7"][data-campo="nome"]');
    const botoes = [...document.querySelectorAll('#tabelaProdutos button')];
    expect(input.disabled).toBe(true);
    botoes.find(b => b.textContent === 'Editar').click();
    expect(input.disabled).toBe(false);
    input.value = 'Alteração descartada';
    botoes.find(b => b.textContent === 'Cancelar').click();
    expect(input.value).toBe(product.nome);
    expect(input.disabled).toBe(true);
    expect(request.mock.calls.every(([method]) => method === 'GET')).toBe(true);
});

test('CSV protege fórmulas, aspas, acentos e separadores', () => {
    const csv = criarCsv([{ nome_cliente: '=SUM(A1)', usuario_nome: 'João; "Teste"\nLinha', valor_total: 12.5, itens: [] }]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"\'=SUM(A1)"');
    expect(csv).toContain('"João; ""Teste""\nLinha"');
    expect(csv).toContain('"12,50"');
});

test('exportação percorre todas as páginas e mantém filtros', async () => {
    document.getElementById('vendas-data-inicio').value = '2026-09-01';
    document.getElementById('vendas-data-fim').value = '2026-09-30';
    request.mockResolvedValueOnce({ vendas: [{ id: '1', valor_total: 10 }], paginacao: { tem_mais: true } });
    request.mockResolvedValueOnce({ vendas: [{ id: '2', valor_total: 20 }], paginacao: { tem_mais: false } });
    URL.createObjectURL = jest.fn(() => 'blob:test');
    URL.revokeObjectURL = jest.fn();
    const clique = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await vendas.exportarVendasCsv();
    expect(request).toHaveBeenCalledWith('GET', expect.stringContaining('data_inicio=2026-09-01&data_fim=2026-09-30&limite=500&offset=1'), undefined);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(clique).toHaveBeenCalledTimes(1);
    expect(document.getElementById('btn-exportar-vendas').disabled).toBe(false);
    clique.mockRestore();
});

test('falha na segunda página não baixa um CSV parcial', async () => {
    request.mockResolvedValueOnce({ vendas: [{ id: '1', valor_total: 10 }], paginacao: { tem_mais: true } });
    request.mockRejectedValueOnce(new Error('Sem conexão'));
    URL.createObjectURL = jest.fn();
    await vendas.exportarVendasCsv();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(document.getElementById('btn-exportar-vendas').disabled).toBe(false);
});
