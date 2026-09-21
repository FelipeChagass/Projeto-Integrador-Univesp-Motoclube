/**
 * Snapshots das regras CSS ordenadas capturados antes da extração em módulos.
 * Normaliza CRLF, não a cascata; atualize hashes apenas após mudança visual intencional revisada.
 */
import { expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';

const root = resolve('static/css');

function expandImports(path, parents = []) {
    path = resolve(path);
    if (!path.startsWith(root + sep) || parents.includes(path)) throw new Error('Import CSS inválido/circular');
    return readFileSync(path, 'utf8').replace(/@import\s+url\(['"]([^'"]+)['"]\);/g,
        (_, relative) => expandImports(resolve(dirname(path), relative), [...parents, path]));
}

function orderedRules(rules, media = []) {
    return [...rules].flatMap(rule => rule.type === 4
        ? orderedRules(rule.cssRules, [...media, rule.media.mediaText])
        : [{ media, css: rule.cssText.replace(/\r\n/g, '\n') }]);
}

test.each([
    ['admin.css', '134d0a33c0879bb87776738c5d2efc62a6bb6b152fbe7dc56c7b670a5719c957'],
    ['admin-mobile.css', '7e0bac97bb3f0f64e13798b457eb82fede2616d7f8c0c71d2173aaba8e9a7fc8'],
    ['ponto_venda.css', 'fbbce4fe6b2044082277105d02489537770ccfe372550a7ee2c663fd88443852'],
    ['ponto_venda-mobile.css', 'cf8a21e846cbdfdf95d215b1e1f246bfdec1c525a82855470f3e7d36f584f770'],
])('%s mantém seletores, declarações, media queries e ordem anteriores à extração', (filename, expected) => {
    const style = document.createElement('style');
    style.textContent = expandImports(resolve(root, filename));
    document.head.appendChild(style);
    try {
        const rules = orderedRules(style.sheet.cssRules);
        expect(rules.length).toBeGreaterThan(10);
        const digest = createHash('sha256').update(JSON.stringify(rules)).digest('hex');
        expect(digest).toBe(expected);
    } finally { style.remove(); }
});
