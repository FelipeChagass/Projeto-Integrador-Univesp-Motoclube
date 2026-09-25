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
    ['admin.css', 'c467f0b62bd05b008f517c7d848e94c9215dd458e71703c2a1b9903fc27bb416'],
    ['admin-mobile.css', '55d68f1cd3427b3ae15b8b1b2c6b66843f286d09405868be2fad7043665e7761'],
    ['ponto_venda.css', 'b697cc95eae3f5010eed985a59c3f63b57bc79f648528db61ad99f6cff0c5ef6'],
    ['ponto_venda-mobile.css', 'e7f3841352fdf5c5f12387dc3055894ae4e77303c462b9ecaff7002da14b25c2'],
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
