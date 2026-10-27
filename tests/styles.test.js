/**
 * Contratos da paleta: a borda dourada e os ícones vermelhos dos headers.
 * Os snapshots por hash do CSS inteiro saíram em 26/10/2026 (plans/padronizacao-bootstrap.md, F1):
 * falhavam a cada mudança sem dizer o quê. tests/arquitetura.test.js mede a estrutura.
 */
import { expect, test } from "@jest/globals";
import { readFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";

const root = resolve("static/css");

function expandImports(path, parents = []) {
  path = resolve(path);
  if (!path.startsWith(root + sep) || parents.includes(path))
    throw new Error("Import CSS inválido/circular");
  return readFileSync(path, "utf8").replace(
    /@import\s+url\(['"]([^'"]+)['"]\);/g,
    (_, relative) =>
      expandImports(resolve(dirname(path), relative), [...parents, path]),
  );
}

test("paleta preserva a borda dourada e os ícones vermelhos dos headers", () => {
  const style = document.createElement("style");
  style.textContent = readFileSync(resolve(root, "tokens.css"), "utf8");
  document.head.appendChild(style);
  try {
    const tokens = style.sheet.cssRules[0].style;
    expect(tokens.getPropertyValue("--header-border").trim()).toBe("#5F451F");
    expect(tokens.getPropertyValue("--accent-text").trim()).toBe("#B30707");
    const pdv = expandImports(resolve(root, "ponto_venda.css"));
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
