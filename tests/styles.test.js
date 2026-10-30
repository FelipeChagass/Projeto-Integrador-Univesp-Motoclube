/**
 * Contratos da paleta: a borda dourada e os ícones vermelhos dos headers.
 * Os snapshots por hash do CSS inteiro saíram em 26/10/2026 (plans/padronizacao-bootstrap.md, F1):
 * falhavam a cada mudança sem dizer o quê. tests/arquitetura.test.js mede a estrutura.
 */
import { expect, test } from "@jest/globals";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve("static/css");

test("paleta preserva a borda dourada e os ícones vermelhos dos headers", () => {
  const style = document.createElement("style");
  style.textContent = readFileSync(resolve(root, "tokens.css"), "utf8");
  document.head.appendChild(style);
  try {
    const tokens = style.sheet.cssRules[0].style;
    expect(tokens.getPropertyValue("--header-border").trim()).toBe("#5F451F");
    // Vermelho dos ícones com contraste mínimo de 3:1 (ver comentário em tokens.css).
    expect(tokens.getPropertyValue("--accent-text").trim()).toBe("#DA0909");
    const pdv = ["cabecalho", "catalogo", "carrinho"]
      .map((nome) =>
        readFileSync(resolve(root, `features/pdv/base/${nome}.css`), "utf8"),
      )
      .join("\n");
    const admin = ["admin/painel.css", "tema-bootstrap.css"]
      .map((arquivo) => readFileSync(resolve(root, arquivo), "utf8"))
      .join("\n");
    for (const css of [pdv, admin]) {
      expect(css).toContain("border-bottom: 1px solid var(--header-border)");
      expect(css).toContain("color: var(--accent-text)");
    }
  } finally {
    style.remove();
  }
});

/** Contraste WCAG 2.1 entre duas cores hex (#rrggbb). */
function contraste(corA, corB) {
  const luminancia = (hex) => {
    const [r, g, b] = [1, 3, 5].map((inicio) => {
      const canal = parseInt(hex.slice(inicio, inicio + 2), 16) / 255;
      return canal <= 0.03928
        ? canal / 12.92
        : ((canal + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [clara, escura] = [luminancia(corA), luminancia(corB)].sort(
    (a, b) => b - a,
  );
  return (clara + 0.05) / (escura + 0.05);
}

test("vermelhos da marca passam no contraste mínimo da WCAG sobre os fundos do app", () => {
  const css = readFileSync(resolve(root, "tokens.css"), "utf8");
  const token = (nome) =>
    css.match(new RegExp(`--${nome}:\\s*(#[0-9a-fA-F]{6})`))[1];
  // Texto (preço, valores): 4,5:1 no fundo mais claro onde aparece.
  expect(
    contraste(token("accent-readable"), token("card-bg")),
  ).toBeGreaterThanOrEqual(4.5);
  // Ícones e bordas: 3:1, inclusive no hover dos botões.
  expect(
    contraste(token("accent-text"), token("surface-hover")),
  ).toBeGreaterThanOrEqual(3);
  expect(
    contraste(token("edit-mode-color"), token("bg-color")),
  ).toBeGreaterThanOrEqual(3);
});
