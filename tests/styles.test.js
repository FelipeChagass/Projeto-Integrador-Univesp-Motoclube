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
    ['admin.css', '4bf57c18b141f78d22e0724c92c4c97f34af8ee3bb33b71d5f9da656da92d192'],
    ['admin-mobile.css', 'ac4379a74c2be7fa54b80780db7e57c24f431084616c982d821938f7ab6167a9'],
    ['ponto_venda.css', 'c72233688c8b6b2a010a3e4001dec28f71168639dc22d5d48a209306e556fd5d'],
    ['ponto_venda-mobile.css', 'cd8a8a964690203679b9aaa8664d1955c3d942919b5a22f8f280c2896634c1fc'],
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
test('paleta preserva a borda dourada e os ícones vermelhos dos headers', () => {
    const style = document.createElement('style');
    style.textContent = readFileSync(resolve(root, 'tokens.css'), 'utf8');
    document.head.appendChild(style);
    try {
        const tokens = style.sheet.cssRules[0].style;
        expect(tokens.getPropertyValue('--header-border').trim()).toBe('#5F451F');
        expect(tokens.getPropertyValue('--accent-text').trim()).toBe('#B30707');
        const pdv = expandImports(resolve(root, 'ponto_venda.css'));
        const admin = expandImports(resolve(root, 'admin.css'));
        for (const css of [pdv, admin]) {
            expect(css).toContain('border-bottom: 1px solid var(--header-border)');
            expect(css).toContain('color: var(--accent-text)');
        }
    } finally { style.remove(); }
});
