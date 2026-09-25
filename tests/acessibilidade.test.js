import { expect, test } from '@jest/globals';
import { ajustarFonte } from '../static/js/shared/acessibilidade.js';

test('tamanho da fonte respeita limites, persiste e atualiza controles', () => {
    document.body.innerHTML = '<button data-fonte="-0.1"></button><output data-fonte-valor></output><button data-fonte="0.1"></button>';
    ajustarFonte(-10);
    expect(document.querySelector('[data-fonte="-0.1"]').disabled).toBe(true);
    document.querySelector('[data-fonte="0.1"]').click();
    expect(document.documentElement.style.fontSize).toBe('17.6px');
    expect(localStorage.getItem('pdv:escala-fonte')).toBe('1.1');
    ajustarFonte(10);
    expect(document.querySelector('[data-fonte-valor]').textContent).toBe('150%');
    expect(document.querySelector('[data-fonte="0.1"]').disabled).toBe(true);
    ajustarFonte(-10);
});
