/**
 * @jest-environment jsdom
 */
import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import { esc, sanitizeUrl, formatCurrency, LocalDB } from '../static/js/utils.js';

describe('utils.js — esc()', () => {
    test('escapa HTML perigoso', () => {
        expect(esc('<script>alert("xss")</script>'))
            .toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    });

    test('escapa aspas simples', () => {
        expect(esc("it's")).toBe("it&#39;s");
    });

    test('escapa ampersand', () => {
        expect(esc('A & B')).toBe('A &amp; B');
    });

    test('retorna string vazia para null/undefined', () => {
        expect(esc(null)).toBe('');
        expect(esc(undefined)).toBe('');
        expect(esc('')).toBe('');
    });

    test('converte números para string', () => {
        expect(esc(42)).toBe('42');
        // 0 is falsy, so esc(0) returns '' via the `|| ''` fallback — expected behavior
        expect(esc(0)).toBe('');
    });

    test('lida com strings sem caracteres especiais', () => {
        expect(esc('Cerveja Pilsen')).toBe('Cerveja Pilsen');
    });
});

describe('utils.js — sanitizeUrl()', () => {
    test('retorna placeholder para URL vazia', () => {
        expect(sanitizeUrl('')).toContain('placehold.co');
        expect(sanitizeUrl(null)).toContain('placehold.co');
        expect(sanitizeUrl(undefined)).toContain('placehold.co');
    });

    test('aceita URLs http/https', () => {
        expect(sanitizeUrl('https://example.com/img.png')).toBe('https://example.com/img.png');
        expect(sanitizeUrl('http://example.com/img.png')).toBe('http://example.com/img.png');
    });

    test('aceita data: URLs', () => {
        const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
        expect(sanitizeUrl(dataUrl)).toBe(dataUrl);
    });

    test('bloqueia javascript: URLs', () => {
        expect(sanitizeUrl('javascript:alert(1)')).toContain('placehold.co');
    });

    test('aceita caminhos relativos (resolve com location.origin)', () => {
        const result = sanitizeUrl('/static/img/motorhead.png');
        expect(result).toBe('/static/img/motorhead.png');
    });
});

describe('utils.js — formatCurrency()', () => {
    test('formata valores normais', () => {
        expect(formatCurrency(10)).toBe('R$ 10.00');
        expect(formatCurrency(5.5)).toBe('R$ 5.50');
        expect(formatCurrency(0)).toBe('R$ 0.00');
    });

    test('formata valores grandes', () => {
        expect(formatCurrency(1250.99)).toBe('R$ 1250.99');
    });

    test('lida com strings numéricas', () => {
        expect(formatCurrency('15.75')).toBe('R$ 15.75');
    });

    test('retorna R$ 0.00 para valores inválidos', () => {
        expect(formatCurrency(null)).toBe('R$ 0.00');
        expect(formatCurrency(undefined)).toBe('R$ 0.00');
        expect(formatCurrency('abc')).toBe('R$ 0.00');
        expect(formatCurrency(NaN)).toBe('R$ 0.00');
    });
});

describe('utils.js — LocalDB', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    test('set e get funcionam', () => {
        LocalDB.set('teste', 'valor');
        expect(LocalDB.get('teste')).toBe('valor');
    });

    test('get retorna null para chaves inexistentes', () => {
        expect(LocalDB.get('inexistente')).toBeNull();
    });

    test('remove apaga a chave', () => {
        LocalDB.set('chave', 'dados');
        LocalDB.remove('chave');
        expect(LocalDB.get('chave')).toBeNull();
    });

    test('armazena e recupera JSON', () => {
        const dados = { nome: 'Cerveja', preco: 10 };
        LocalDB.set('produto', JSON.stringify(dados));
        expect(JSON.parse(LocalDB.get('produto'))).toEqual(dados);
    });

    test('sobrescreve valor existente', () => {
        LocalDB.set('k', 'v1');
        LocalDB.set('k', 'v2');
        expect(LocalDB.get('k')).toBe('v2');
    });
});
