import { afterEach, describe, expect, test } from "@jest/globals";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";

const ler = (arquivo) => readFileSync(resolve(arquivo), "utf8");
const arquivos = (pasta, extensao) =>
  readdirSync(pasta, { withFileTypes: true }).flatMap((entrada) => {
    const caminho = `${pasta}/${entrada.name}`;
    return entrada.isDirectory()
      ? arquivos(caminho, extensao)
      : caminho.endsWith(extensao)
        ? [caminho]
        : [];
  });
const documento = (arquivo) =>
  new DOMParser().parseFromString(ler(arquivo), "text/html");

function regras(arquivo) {
  const estilo = document.createElement("style");
  // Imports são verificados separadamente; não há rede nos testes de CSS.
  estilo.textContent = ler(arquivo).replace(/@import[^;]+;/g, "");
  document.head.append(estilo);
  return [...estilo.sheet.cssRules];
}

function folhasCarregadas(arquivo) {
  const resultado = [];
  function visitar(caminho) {
    resultado.push(caminho);
    for (const [, relativo] of ler(caminho).matchAll(
      /@import\s+url\(['"]([^'"]+)['"]\);/g,
    )) {
      visitar(resolve(dirname(caminho), relativo));
    }
  }
  for (const link of documento(arquivo).querySelectorAll(
    'link[rel="stylesheet"]',
  )) {
    const caminho = link.getAttribute("href").match(/filename='(css\/[^']+)'/);
    if (caminho) visitar(resolve("static", caminho[1]));
  }
  return resultado;
}

afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

describe("carregamento do tema Motorhead", () => {
  test.each(["ponto_venda", "login"])(
    "%s aplica Bootstrap, tokens, tema, common e feature nessa ordem",
    (pagina) => {
      const doc = documento(`templates/${pagina}.html`);
      const links = [...doc.querySelectorAll('link[rel="stylesheet"]')].map(
        (link) => link.getAttribute("href"),
      );
      const caminhos = [
        "bootstrap.min.css",
        "css/tokens.css",
        "css/tema-bootstrap.css",
        "css/common.css",
        `css/${pagina}.css`,
      ];
      const posicoes = caminhos.map((caminho) =>
        links.findIndex((link) => link.includes(caminho)),
      );
      expect(posicoes.every((posicao) => posicao >= 0)).toBe(true);
      expect(posicoes).toEqual([...posicoes].sort((a, b) => a - b));
      expect(
        folhasCarregadas(`templates/${pagina}.html`).filter((caminho) =>
          caminho.endsWith("tokens.css"),
        ),
      ).toHaveLength(1);
    },
  );

  test.each(["ponto_venda", "login"])(
    "%s permite zoom e carrega o bundle antes da entrada",
    (pagina) => {
      const doc = documento(`templates/${pagina}.html`);
      const viewport = doc.querySelector('meta[name="viewport"]').content;
      expect(viewport).not.toMatch(/maximum-scale|user-scalable\s*=\s*no/);
      const scripts = [...doc.querySelectorAll("script[src]")];
      const bundle = scripts.findIndex((script) =>
        script.src.includes("bootstrap.bundle.min.js"),
      );
      expect(bundle).toBeGreaterThanOrEqual(0);
      expect(bundle).toBeLessThan(
        scripts.findIndex((script) => script.type === "module"),
      );
    },
  );

  test("common não impõe viewport fixo nem flex ao login", () => {
    const corpo = regras("static/css/common.css").find(
      (regra) => regra.selectorText === "body",
    ).style;
    for (const propriedade of [
      "display",
      "height",
      "overflow",
      "flex-direction",
    ]) {
      expect(corpo.getPropertyValue(propriedade)).toBe("");
    }
    expect(
      documento("templates/ponto_venda.html").body.classList.contains(
        "page-pdv",
      ),
    ).toBe(true);
    expect(
      documento("templates/login.html").body.classList.contains("page-login"),
    ).toBe(true);
    const layout = regras("static/css/features/pdv/base/cabecalho.css").find(
      (regra) => regra.selectorText === ".page-pdv",
    );
    expect(layout?.style.getPropertyValue("display")).toBe("flex");
    expect(layout?.style.getPropertyValue("height")).toBe("100dvh");
    const mobile = regras("static/css/login.css").find(
      (regra) => regra.conditionText === "(max-width: 480px)",
    );
    const cartao = [...mobile.cssRules].find(
      (regra) => regra.selectorText === ".login-card",
    );
    expect(cartao.style.getPropertyValue("height")).toBe("");
    expect(cartao.style.getPropertyValue("min-height")).toBe("100dvh");
  });
});

describe("contratos acessíveis dos templates", () => {
  test.each(arquivos("templates/pdv", ".html"))(
    "%s declara tipo e componente Bootstrap nos controles",
    (arquivo) => {
      const doc = documento(arquivo);
      for (const botao of doc.querySelectorAll("button")) {
        expect(["button", "submit"]).toContain(botao.getAttribute("type"));
        expect(botao.classList.contains("btn")).toBe(true);
      }
      for (const campo of doc.querySelectorAll(
        'input:not([type="checkbox"]), textarea, select',
      )) {
        expect(
          campo.classList.contains(
            campo.tagName === "SELECT" ? "form-select" : "form-control",
          ),
        ).toBe(true);
      }
    },
  );

  test("login tem campos nomeados e senha acessível por Tab", () => {
    const doc = documento("templates/login.html");
    for (const id of ["login-email", "login-senha"]) {
      expect(doc.getElementById(id).classList.contains("form-control")).toBe(
        true,
      );
      expect(
        doc.querySelector(`label[for="${id}"]`)?.textContent.trim(),
      ).toBeTruthy();
    }
    expect(doc.getElementById("btn-toggle-senha").tabIndex).toBe(0);
    expect(
      doc.getElementById("btn-login").classList.contains("btn-primary"),
    ).toBe(true);
  });

  test("carrinho oferece botão nativo com relação e estado para o controlador JS", () => {
    const doc = documento("templates/pdv/catalogo-carrinho.html");
    const botao = doc.getElementById("btn-alternar-carrinho");
    expect(botao?.tagName).toBe("BUTTON");
    expect(botao.getAttribute("aria-controls")).toBe("carrinho-lista");
    expect(botao.getAttribute("aria-expanded")).toBe("false");
    expect(doc.getElementById("titulo-carrinho")).not.toBeNull();
    expect(
      [...doc.querySelectorAll("[data-categoria]")].map(
        (el) => el.dataset.categoria,
      ),
    ).toEqual(["comida", "bebida", "combo", "todos"]);
  });

  test("menu usa Offcanvas com fechamento nativo e permissões preservadas", () => {
    const doc = documento("templates/pdv/navigation.html");
    const menu = doc.getElementById("sidebar-mobile");
    expect(menu.classList.contains("offcanvas")).toBe(true);
    expect(menu.classList.contains("offcanvas-end")).toBe(true);
    expect(menu.tabIndex).toBe(-1);
    expect(
      doc.getElementById(menu.getAttribute("aria-labelledby"))?.textContent,
    ).toBeTruthy();
    expect(
      doc.getElementById("btn-hamburger").getAttribute("data-bs-target"),
    ).toBe("#sidebar-mobile");
    expect(
      doc.getElementById("btn-hamburger").getAttribute("data-bs-toggle"),
    ).toBe("offcanvas");
    expect(
      doc.getElementById("sidebar-close-btn").getAttribute("data-bs-dismiss"),
    ).toBe("offcanvas");
    expect(doc.querySelector(".sidebar-backdrop")).toBeNull();
    for (const id of [
      "sidebar-btn-estoque",
      "sidebar-gestao",
      "sidebar-btn-admin",
      "sidebar-config",
      "sidebar-logout",
    ]) {
      expect(menu.contains(doc.getElementById(id))).toBe(true);
    }
    expect(
      doc.getElementById("sidebar-btn-admin").classList.contains("d-none"),
    ).toBe(true);
  });
});

describe("isolamento CSS", () => {
  test("regras mobile deixam 768px para md e não escondem um Offcanvas aberto", () => {
    function visitar(lista, verificar) {
      for (const regra of lista) {
        verificar(regra);
        if (regra.cssRules) visitar([...regra.cssRules], verificar);
      }
    }
    for (const arquivo of arquivos("static/css/features/pdv", ".css")) {
      visitar(regras(arquivo), (regra) => {
        if (regra.conditionText) {
          expect(regra.conditionText).not.toMatch(
            /max-width:\s*768px|min-width:\s*769px/,
          );
        }
        if (regra.selectorText?.includes(".modal-content")) {
          for (const seletor of regra.selectorText.split(",")) {
            if (seletor.includes(".modal-content")) {
              expect(seletor).toContain(".modal-overlay");
            }
          }
        }
        // JSDOM expõe @page como selectorText, mas não é seletor de elemento.
        if (regra.selectorText && !regra.selectorText.startsWith("@")) {
          const menu = documento(
            "templates/pdv/navigation.html",
          ).getElementById("sidebar-mobile");
          if (menu.matches(regra.selectorText)) {
            expect(regra.style.getPropertyValue("display")).not.toBe("none");
            expect(regra.style.getPropertyValue("visibility")).not.toBe(
              "hidden",
            );
          }
        }
      });
    }
  });

  test("card Bootstrap comum não recebe a aparência de produto", () => {
    const regrasCatalogo = regras("static/css/features/pdv/base/catalogo.css");
    const comum = document.createElement("div");
    comum.className = "card";
    expect(
      regrasCatalogo.filter(
        (regra) => regra.selectorText && comum.matches(regra.selectorText),
      ),
    ).toHaveLength(0);
    const produto = document.createElement("button");
    produto.className = "card pdv-produto-card";
    const regra = regrasCatalogo.find(
      (item) => item.selectorText === ".pdv-produto-card",
    );
    expect(regra).toBeDefined();
    expect(produto.matches(regra.selectorText)).toBe(true);
    expect(regra.style.getPropertyValue("padding")).toBe("0");
    expect(regra.style.getPropertyValue("font")).toBe("inherit");
  });

  test("modal Bootstrap não recebe largura ou animação dos overlays legados", () => {
    const modal = document.createElement("div");
    modal.className = "modal-content";
    const css = regras("static/css/common.css");
    expect(
      css.filter(
        (regra) => regra.selectorText && modal.matches(regra.selectorText),
      ),
    ).toHaveLength(0);
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.append(modal);
    expect(
      css.some(
        (regra) =>
          regra.selectorText &&
          modal.matches(regra.selectorText) &&
          regra.style.getPropertyValue("max-width") === "560px",
      ),
    ).toBe(true);
  });

  test("impressão é exclusiva do PDV e mantém integralmente as regras anteriores", () => {
    const caminho = "static/css/features/pdv/print.css";
    expect(existsSync(caminho)).toBe(true);
    const css = ler(caminho).replace(/\r\n/g, "\n");
    expect(
      createHash("sha256")
        .update(css.slice(css.indexOf("@media print")).trim())
        .digest("hex"),
    ).toBe("af479f8d4748eb4069f498e99dae4c308fc9e10dc02f3c7cfbe3d14ace32616f");
    expect(folhasCarregadas("templates/ponto_venda.html")).toContain(
      resolve(caminho),
    );
    for (const pagina of ["login", "admin"]) {
      expect(folhasCarregadas(`templates/${pagina}.html`)).not.toContain(
        resolve(caminho),
      );
    }
    expect(
      regras("static/css/common.css").some(
        (regra) => regra.conditionText === "print",
      ),
    ).toBe(false);
  });
});
