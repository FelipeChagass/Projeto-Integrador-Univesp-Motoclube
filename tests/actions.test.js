/**
 * Regressões das ações públicas do PDV, incluindo persistência, caixa e erros.
 * DOM, mocks e IndexedDB isolado são preparados por helpers/pdv.js.
 */
import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import { S } from '../static/js/features/pdv/state.js';
import { persistirOperacao, listarOperacoes } from '../static/js/features/pdv/offline-queue.js';
import { actions, reports, loadModules } from './helpers/pdv.js';

describe('actions.js — Carrinho', () => {
    beforeEach(loadModules);

    test('adicionarAoCarrinho adiciona item novo', () => {
        actions.adicionarAoCarrinho(1, 'Cerveja', 10, '');
        expect(S.carrinho).toHaveLength(1);
        expect(S.carrinho[0]).toEqual({ id: 1, nome: 'Cerveja', preco: 10, obs: '', qtd: 1 });
    });

    test('adicionarAoCarrinho incrementa item existente', () => {
        actions.adicionarAoCarrinho(1, 'Cerveja', 10, '');
        actions.adicionarAoCarrinho(1, 'Cerveja', 10, '');
        expect(S.carrinho).toHaveLength(1);
        expect(S.carrinho[0].qtd).toBe(2);
    });

    test('adicionarAoCarrinho permite itens com obs diferentes', () => {
        actions.adicionarAoCarrinho(2, 'Hamburguer', 25, '');
        actions.adicionarAoCarrinho(2, 'Hamburguer', 25, 'Sem cebola');
        expect(S.carrinho).toHaveLength(2);
    });

    test('adicionarAoCarrinho bloqueia se estoque insuficiente', () => {
        S.produtos[0].estoque_bar = 1;
        actions.adicionarAoCarrinho(1, 'Cerveja', 10, '');
        actions.adicionarAoCarrinho(1, 'Cerveja', 10, '');
        expect(S.carrinho).toHaveLength(1);
        expect(S.carrinho[0].qtd).toBe(1);
    });

    test('incrementarQtd aumenta quantidade', () => {
        actions.adicionarAoCarrinho(1, 'Cerveja', 10, '');
        actions.incrementarQtd(0);
        expect(S.carrinho[0].qtd).toBe(2);
    });

    test('decrementarQtd diminui quantidade', () => {
        actions.adicionarAoCarrinho(1, 'Cerveja', 10, '');
        actions.adicionarAoCarrinho(1, 'Cerveja', 10, '');
        actions.decrementarQtd(0);
        expect(S.carrinho[0].qtd).toBe(1);
    });

    test('decrementarQtd remove item quando qtd chega a 0', () => {
        actions.adicionarAoCarrinho(1, 'Cerveja', 10, '');
        actions.decrementarQtd(0);
        expect(S.carrinho).toHaveLength(0);
    });
});

describe('actions.js — cliqueProduto()', () => {
    beforeEach(loadModules);

    test('adiciona bebida direto ao carrinho (sem modal)', () => {
        const prod = S.produtos[0]; // Cerveja = BEBIDA
        actions.cliqueProduto(prod, false);
        expect(S.carrinho).toHaveLength(1);
        expect(S.carrinho[0].nome).toBe('Cerveja');
    });

    test('abre modal obs para COMIDA', () => {
        const prod = S.produtos[1]; // Hamburguer = COMIDA
        actions.cliqueProduto(prod, false);
        expect(S.produtoPendente).not.toBeNull();
        expect(S.produtoPendente.nome).toBe('Hamburguer');
        expect(document.getElementById('modal-obs').style.display).toBe('flex');
    });

    test('bloqueia produto esgotado', () => {
        const prod = S.produtos[0];
        actions.cliqueProduto(prod, true); // barZerado = true
        expect(S.carrinho).toHaveLength(0);
    });

    test('bloqueia se caixa fechado', () => {
        S.caixaAberto = false;
        const prod = S.produtos[0];
        actions.cliqueProduto(prod, false);
        expect(S.carrinho).toHaveLength(0);
    });
});

describe('actions.js — Abertura/Fechamento Caixa', () => {
    beforeEach(loadModules);

    test('confirmarAberturaValor abre o caixa somente após ACK', async () => {
        S.caixaAberto = false;
        document.getElementById('input-valor-abertura').value = '150';
        const abertura = actions.confirmarAberturaValor();
        expect(S.caixaAberto).toBe(false);
        await abertura;
        expect(S.caixaAberto).toBe(true);
        expect(S.valorAbertura).toBe(150);
    });

    test('abrirModalAberturaCaixa bloqueia se já aberto', () => {
        S.caixaAberto = true;
        actions.abrirModalAberturaCaixa();
        // Should not open modal, should show toast
        expect(document.getElementById('toast').innerText).toContain('já está aberto');
    });

    test('executarFechamentoCaixa impede fechamento se valor for invalido', () => {
        document.getElementById('input-valor-fechamento').value = '-50';
        reports.executarFechamentoCaixa();
        expect(API.fecharCaixa).not.toHaveBeenCalled();
        expect(document.getElementById('toast').innerText).toContain('valor em caixa válido');
    });

    test('executarFechamentoCaixa fecha o caixa com sucesso e realiza logout', async () => {
        const redirectSpy = jest.fn();
        globalThis.redirect = redirectSpy;

        S.caixaAberto = true;
        S.caixaId = 'cx-test-123';
        S.valorAbertura = 100;
        
        document.getElementById('input-valor-fechamento').value = '150';
        document.getElementById('input-obs-fechamento').value = 'Tudo OK';

        await reports.executarFechamentoCaixa();

        expect(API.fecharCaixa).toHaveBeenCalledWith('cx-test-123', 150, 'Tudo OK');
        expect(S.caixaAberto).toBe(false);
        expect(S.caixaId).toBeNull();
        expect(S.valorAbertura).toBe(0);
        expect(API.logout).toHaveBeenCalled();
        expect(redirectSpy).toHaveBeenCalledWith('/login');

        delete globalThis.redirect;
    });
});

describe('actions.js — Config', () => {
    beforeEach(loadModules);

    test('salvarConfig atualiza S.config', () => {
        document.getElementById('cfg-imprimir').checked = false;
        document.getElementById('cfg-largura').value = 'ticket-58mm';
        actions.salvarConfig();
        expect(S.config.imprimir).toBe(false);
        expect(S.config.largura).toBe('ticket-58mm');
    });

    test('salvarConfig persiste no localStorage', () => {
        document.getElementById('cfg-imprimir').checked = true;
        actions.salvarConfig();
        const saved = JSON.parse(localStorage.getItem('motoBarConfig'));
        expect(saved.imprimir).toBe(true);
    });
});

describe('actions.js — Fila Vendas', () => {
    beforeEach(loadModules);

    test('processarFilaVendas não faz nada com fila vazia', async () => {
        S.filaVendas = [];
        await actions.processarFilaVendas();
        expect(API.processarVenda).not.toHaveBeenCalled();
    });

    test('processarFilaVendas confirma a mesma identidade persistida', async () => {
        const payload = { id_externo: '123', usuario_origem_id: S.usuarioAtual.id, caixa_id: S.caixaId, itens: [], metodo: 'PIX' };
        await persistirOperacao(payload);
        API.processarVenda.mockResolvedValueOnce({ status: 'ok', id_externo: '123', usuario_id: S.usuarioAtual.id, caixa_id: S.caixaId, venda_id: 'venda-1', total_calculado: 10 });
        await actions.processarFilaVendas();
        expect(API.processarVenda).toHaveBeenCalledWith(payload);
        expect(await listarOperacoes()).toHaveLength(0);
    });
});

describe('actions.js — Membros', () => {
    beforeEach(loadModules);

    test('popularSelectMembros preenche o select', () => {
        S.membros = [{ id: 'a', nome: 'Ana' }, { id: 'b', nome: 'Bruno' }, { id: 'c', nome: 'Carlos' }];
        actions.popularSelectMembros('select-membro');
        const options = document.querySelectorAll('#select-membro option');
        // 3 membros + 1 default option = 4
        expect(options.length).toBe(4);
        // Verificar ordem alfabética
        expect(options[1].value).toBe('a');
        expect(options[2].value).toBe('b');
        expect(options[3].value).toBe('c');
    });

    test('fecharModalSelecaoMembro fecha e limpa preview', () => {
        jest.useFakeTimers();
        document.getElementById('modal-selecionar-membro').style.display = 'flex';
        document.getElementById('preview-divida').innerText = 'R$ 50,00';
        actions.fecharModalSelecaoMembro();
        jest.runAllTimers();
        expect(document.getElementById('modal-selecionar-membro').style.display).toBe('none');
        expect(document.getElementById('preview-divida').innerText).toBe('');
        jest.useRealTimers();
    });
});

describe('actions.js — Pagamento', () => {
    beforeEach(loadModules);

    test('iniciarPagamento bloqueia sem operador', () => {
        S.operadorAtual = '';
        actions.iniciarPagamento('DINHEIRO');
        expect(document.getElementById('toast').innerText).toContain('login');
    });

    test('iniciarPagamento bloqueia sem caixa aberto', () => {
        S.caixaAberto = false;
        actions.iniciarPagamento('DINHEIRO');
        expect(document.getElementById('toast').innerText).toContain('Abertura');
    });

    test('iniciarPagamento bloqueia com carrinho vazio', () => {
        S.carrinho = [];
        actions.iniciarPagamento('DINHEIRO');
        expect(document.getElementById('toast').innerText).toContain('Vazio');
    });
});

describe('Integridade: falhas e reconciliação', () => {
    beforeEach(loadModules);

    test('abertura com erro mantém caixa fechado', async () => {
        S.caixaAberto = false;
        S.caixaId = null;
        API.abrirCaixa.mockRejectedValueOnce(new Error('indisponível'));
        await actions.confirmarAberturaValor();
        expect(S.caixaAberto).toBe(false);
        expect(S.caixaId).toBeNull();
    });

    test('abertura repetida usa valor confirmado pelo servidor', async () => {
        document.getElementById('input-valor-abertura').value = '900';
        API.abrirCaixa.mockResolvedValueOnce({ status: 'ok', caixa_id: 'same', valor_abertura: 50 });
        await actions.confirmarAberturaValor();
        expect(S.valorAbertura).toBe(50);
    });

    test.each([401, 403, 409, 422, 500])('fechamento rejeitado com %s não fecha nem faz logout', async status => {
        API.fecharCaixa.mockRejectedValueOnce(Object.assign(new Error('rejeitado'), { status }));
        await reports.executarFechamentoCaixa();
        expect(S.caixaAberto).toBe(true);
        expect(S.caixaId).toBe('cx-test');
        expect(API.logout).not.toHaveBeenCalled();
    });

    test('pendência impede fechamento sem chamar servidor', async () => {
        await persistirOperacao({ id_externo: 'pending', usuario_origem_id: S.usuarioAtual.id, caixa_id: S.caixaId });
        await reports.executarFechamentoCaixa();
        expect(API.fecharCaixa).not.toHaveBeenCalled();
        expect(S.caixaAberto).toBe(true);
    });

    test('troca de operador não envia operação de outro usuário', async () => {
        await persistirOperacao({ id_externo: 'foreign', usuario_origem_id: 'another', caixa_id: 'other-box' });
        await actions.processarFilaVendas();
        expect(API.processarVenda).not.toHaveBeenCalled();
        expect(await listarOperacoes()).toHaveLength(1);
    });

    test.each([401, 403, 409, 422, 500])('falha %s de sincronização preserva operação', async status => {
        const payload = { id_externo: 'preserved', usuario_origem_id: S.usuarioAtual.id, caixa_id: S.caixaId };
        await persistirOperacao(payload);
        API.processarVenda.mockRejectedValueOnce(Object.assign(new Error('rejeitado'), { status, retryable: status >= 500 }));
        await actions.processarFilaVendas();
        expect((await listarOperacoes())[0].payload).toEqual(payload);
        await actions.processarFilaVendas();
        expect(API.processarVenda).toHaveBeenCalledTimes(1);
    });

    test('sem persistência durável o carrinho não é apagado', async () => {
        S.carrinho = [{ id: 1, nome: 'Cerveja', preco: 10, qtd: 1 }];
        globalThis.indexedDB = undefined;
        await actions.registrarVendaOtimista('PIX', 'Cliente');
        expect(S.carrinho).toHaveLength(1);
        expect(API.processarVenda).not.toHaveBeenCalled();
    });

    test('relatório exibido e impresso não duplica recebimentos', async () => {
        API.gerarRelatorioCaixa.mockResolvedValueOnce({ periodo: 'Teste', abertura: 100, dinheiro: 14, pix: 16, cartao: 20,
            totalEntradas: 50, recebimentoDivida: 10, vendasFiado: 10, historico: [] });
        await reports.executarRelatorio('TURNO', {});
        const html = document.getElementById('resultado-relatorio').textContent;
        expect(html).toContain('150.00');
        expect(html).not.toContain('160.00');
        window.focus = jest.fn();
        window.print = jest.fn();
        reports.imprimirRelatorioAtual();
        expect(document.getElementById('area-impressao').textContent).toContain('150.00');
        expect(document.getElementById('area-impressao').textContent).not.toContain('160.00');
    });
});
