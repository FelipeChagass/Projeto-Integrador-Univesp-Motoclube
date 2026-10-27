/**
 * Placar de padronização Bootstrap (plans/padronizacao-bootstrap.md).
 * Mede, por arquivo, o que foge do modelo Bootstrap. tests/arquitetura.test.js
 * impede que qualquer número suba; `npm run arquitetura:limites` regrava os
 * limites depois de uma melhoria (eles só podem descer).
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
export const ARQUIVO_LIMITES = join(RAIZ, "tests", "arquitetura-limites.json");

const DECLARACAO_LAYOUT =
  /^\s*(display:\s*(flex|inline-flex|grid|inline-grid)|flex(-direction|-wrap|-grow|-shrink|-basis|-flow)?:|justify-content:|align-(items|self|content):|(row-|column-)?gap:|margin(-top|-bottom|-left|-right)?:|padding(-top|-bottom|-left|-right)?:)/gm;
const ESCRITA_STYLE =
  /\.style\.[a-zA-Z]+\s*=(?!=)|\.style\[|Object\.assign\([\w.]+\.style|\.style\.(cssText|setProperty)/g;

export const CATEGORIAS = {
  "layout-no-css":
    "display/flex/justify/align/gap/margin/padding declarados no CSS (usar utilities no markup)",
  important: "!important no CSS",
  "seletor-id": "seletores de ID no CSS",
  "cor-literal": "hex/rgb() fora de static/css/tokens.css",
  gradiente: "gradientes no CSS",
  "style-no-js": "escritas em element.style no JS (trocar por classe/atributo)",
  "style-inline": 'atributo style="" em template ou HTML gerado',
  "handler-inline":
    "atributos on*= (onclick, onerror...) em template ou HTML gerado",
};

function arquivos(pasta, extensao) {
  return readdirSync(join(RAIZ, pasta), {
    recursive: true,
    withFileTypes: true,
  })
    .filter((item) => item.isFile() && item.name.endsWith(extensao))
    .map((item) =>
      relative(RAIZ, join(item.parentPath ?? item.path, item.name))
        .split(sep)
        .join("/"),
    )
    .sort();
}

const ler = (caminho) =>
  readFileSync(join(RAIZ, caminho), "utf8").replace(/\r\n/g, "\n");
const contar = (texto, regex) => (texto.match(regex) || []).length;
const semComentariosCss = (texto) => texto.replace(/\/\*[\s\S]*?\*\//g, "");

function seletores(css) {
  return [...css.matchAll(/([^{};]+)\{/g)]
    .map((m) => m[1].trim())
    .filter((s) => s && !s.startsWith("@"));
}

function declaracoes(css) {
  return [...css.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1]).join("\n");
}

export function medir() {
  const placar = Object.fromEntries(
    Object.keys(CATEGORIAS).map((categoria) => [categoria, {}]),
  );
  const anotar = (categoria, arquivo, n) => {
    if (n > 0) placar[categoria][arquivo] = n;
  };

  for (const arquivo of arquivos("static/css", ".css")) {
    const css = semComentariosCss(ler(arquivo));
    const corpo = declaracoes(css);
    anotar("layout-no-css", arquivo, contar(corpo, DECLARACAO_LAYOUT));
    anotar("important", arquivo, contar(corpo, /!important/g));
    anotar(
      "seletor-id",
      arquivo,
      seletores(css).filter((s) => /(^|[\s,>+~])#[a-zA-Z]/.test(s)).length,
    );
    if (!arquivo.endsWith("/tokens.css"))
      anotar(
        "cor-literal",
        arquivo,
        contar(corpo, /#[0-9a-fA-F]{3,8}\b|rgba?\(/g),
      );
    anotar("gradiente", arquivo, contar(corpo, /gradient\(/g));
  }

  for (const arquivo of arquivos("static/js", ".js")) {
    const js = ler(arquivo);
    anotar("style-no-js", arquivo, contar(js, ESCRITA_STYLE));
    anotar("style-inline", arquivo, contar(js, /\sstyle=\\?["']/g));
    anotar("handler-inline", arquivo, contar(js, /\son[a-z]+=\\?["']/g));
  }

  for (const arquivo of arquivos("templates", ".html")) {
    const html = ler(arquivo).replace(/\{#[\s\S]*?#\}/g, "");
    anotar("style-inline", arquivo, contar(html, /\sstyle=["']/g));
    anotar("handler-inline", arquivo, contar(html, /\son[a-z]+=["']/g));
  }
  return placar;
}

export function totais(placar) {
  return Object.fromEntries(
    Object.entries(placar).map(([categoria, porArquivo]) => [
      categoria,
      Object.values(porArquivo).reduce((soma, n) => soma + n, 0),
    ]),
  );
}

export function lerLimites() {
  return JSON.parse(readFileSync(ARQUIVO_LIMITES, "utf8"));
}

/** Itens que pioraram: categoria, arquivo, limite e valor medido. */
export function excessos(placar, limites) {
  const lista = [];
  for (const [categoria, porArquivo] of Object.entries(placar))
    for (const [arquivo, medido] of Object.entries(porArquivo)) {
      const limite = limites[categoria]?.[arquivo] ?? 0;
      if (medido > limite) lista.push({ categoria, arquivo, limite, medido });
    }
  return lista;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const placar = medir();
  if (process.argv.includes("--gravar")) {
    const anteriores = (() => {
      try {
        return lerLimites();
      } catch {
        return null;
      }
    })();
    const piorou = anteriores ? excessos(placar, anteriores) : [];
    if (piorou.length) {
      console.error(
        "Limites não regravados: estes números subiram.\n" +
          piorou
            .map(
              (i) =>
                `  ${i.categoria} ${i.arquivo}: ${i.limite} -> ${i.medido}`,
            )
            .join("\n"),
      );
      process.exit(1);
    }
    writeFileSync(ARQUIVO_LIMITES, JSON.stringify(placar, null, 2) + "\n");
    console.log(`Limites gravados em ${relative(RAIZ, ARQUIVO_LIMITES)}.`);
  }
  for (const [categoria, total] of Object.entries(totais(placar)))
    console.log(
      `${String(total).padStart(5)}  ${categoria}  (${CATEGORIAS[categoria]})`,
    );
}
