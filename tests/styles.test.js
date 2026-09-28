/**
 * Snapshots das regras CSS ordenadas após extração em módulos e revisão de utilities Bootstrap.
 * Normaliza CRLF, não a cascata; atualize hashes somente após conferir o efeito visual.
 * A simplificação de 25/09/2026 está documentada em plans/utilities-bootstrap.md.
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
    ['admin.css', 'ab5d40a5470930efe7a029f39f40bb078e5699470752b4c03e3bb2c0362b8da9'],
    ['admin-mobile.css', 'be1ae83e22df9841ed7fc45a79f02ef6c2192f9dcd593b5b1bb754b8dcae8bd5'],
    ['ponto_venda.css', 'cab2583ee26cc5d2b025249eadad5f23107430dcda1b26c8b0eef6413bd18d0a'],
    ['ponto_venda-mobile.css', 'e99aa7f62e1c66e503af0a2148c4888a09104b99af1c0aea54f84cadf008902e'],
])('%s mantém seletores, declarações, media queries e ordem revisados', (filename, expected) => {
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
