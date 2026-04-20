/**
 * @jest-environment jsdom
 */
import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import { S, salvarEstadoLocal, salvarDadosLocais, carregarDadosLocais } from '../static/js/state.js';

describe('state.js — Estado Inicial', () => {
    test('S tem todas as propriedades obrigatórias', () => {
        expect(S).toHaveProperty('produtos');
        expect(S).toHaveProperty('membros');
        expect(S).toHaveProperty('carrinho');
        expect(S).toHaveProperty('filaVendas');
        expect(S).toHaveProperty('config');
        expect(S).toHaveProperty('operadorAtual');
        expect(S).toHaveProperty('caixaAberto');
        expect(S).toHaveProperty('caixaId');
        expect(S).toHaveProperty('pagamentoPendente');
        expect(S).toHaveProperty('enviandoVenda');
        expect(S).toHaveProperty('processandoFila');
    });

    test('arrays iniciam vazios', () => {
        expect(Array.isArray(S.produtos)).toBe(true);
        expect(Array.isArray(S.membros)).toBe(true);
        expect(Array.isArray(S.filaVendas)).toBe(true);
    });

    test('config tem valores padrão', () => {
        expect(S.config.imprimir).toBe(true);
        expect(S.config.largura).toBe('ticket-80mm');
    });

    test('caixaAberto inicia fechado', () => {
        expect(S.caixaAberto).toBe(false);
    });

    test('pagamentoPendente tem estrutura correta', () => {
        expect(S.pagamentoPendente).toEqual({ tipo: '', valorTotal: 0, dados: null });
    });
});

describe('state.js — Persistência', () => {
    beforeEach(() => {
        localStorage.clear();
        S.carrinho = [];
        S.produtos = [];
        S.membros = [];
        S.operadorAtual = '';
        S.inicioTurno = null;
        S.filaVendas = [];
        S.config = { imprimir: true, largura: 'ticket-80mm', logo: '/static/img/motorhead.png' };
        S.caixaAberto = false;
        S.valorAbertura = 0;
        S.caixaId = null;
    });

    test('salvarEstadoLocal salva carrinho no localStorage', () => {
        S.carrinho = [{ id: 1, nome: 'Cerveja', preco: 10, qtd: 2, obs: '' }];
        salvarEstadoLocal();
        const saved = JSON.parse(localStorage.getItem('motoBarCarrinho'));
        expect(saved).toHaveLength(1);
        expect(saved[0].nome).toBe('Cerveja');
        expect(saved[0].qtd).toBe(2);
    });

    test('salvarDadosLocais persiste todos os dados', () => {
        S.produtos = [{ id: 1, nome: 'Água' }];
        S.membros = [{ nome: 'João' }];
        S.operadorAtual = 'Maria';
        S.caixaAberto = true;
        S.caixaId = 'cx-123';
        S.valorAbertura = 100;
        salvarDadosLocais();

        expect(localStorage.getItem('motoBarOperador')).toBe('Maria');
        expect(localStorage.getItem('motoBarCaixaAberto')).toBe('true');
        expect(localStorage.getItem('motoBarCaixaId')).toBe('cx-123');
        expect(JSON.parse(localStorage.getItem('motoBarProdutos'))).toHaveLength(1);
        expect(JSON.parse(localStorage.getItem('motoBarMembros'))).toHaveLength(1);
    });

    test('carregarDadosLocais restaura o estado', () => {
        // Salvar
        S.produtos = [{ id: 5, nome: 'Suco' }];
        S.operadorAtual = 'Carlos';
        S.caixaAberto = true;
        S.carrinho = [{ id: 5, nome: 'Suco', preco: 8, qtd: 1, obs: '' }];
        salvarDadosLocais();

        // Resetar
        S.produtos = [];
        S.operadorAtual = '';
        S.caixaAberto = false;
        S.carrinho = [];

        // Restaurar
        carregarDadosLocais();
        expect(S.produtos).toHaveLength(1);
        expect(S.produtos[0].nome).toBe('Suco');
        expect(S.operadorAtual).toBe('Carlos');
        expect(S.caixaAberto).toBe(true);
        expect(S.carrinho).toHaveLength(1);
    });

    test('carregarDadosLocais lida com localStorage vazio', () => {
        carregarDadosLocais();
        expect(S.produtos).toEqual([]);
        expect(S.operadorAtual).toBe('');
        expect(S.caixaAberto).toBe(false);
    });

    test('carregarDadosLocais lida com JSON inválido sem crashar', () => {
        localStorage.setItem('motoBarProdutos', 'INVALID_JSON{{{');
        expect(() => carregarDadosLocais()).not.toThrow();
    });

    test('salvarEstadoLocal com carrinho vazio', () => {
        S.carrinho = [];
        salvarEstadoLocal();
        expect(JSON.parse(localStorage.getItem('motoBarCarrinho'))).toEqual([]);
    });
});
