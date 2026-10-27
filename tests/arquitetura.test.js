/**
 * Catraca da padronização Bootstrap (plans/padronizacao-bootstrap.md): nenhum
 * arquivo pode piorar e arquivo novo nasce sem layout no CSS, sem style inline
 * e sem escrita em element.style. Depois de uma melhoria, rode
 * `npm run arquitetura:limites` para baixar os limites.
 */
import { expect, test } from "@jest/globals";
import {
  CATEGORIAS,
  excessos,
  lerLimites,
  medir,
} from "../scripts/arquitetura.mjs";

const placar = medir();
const limites = lerLimites();

test.each(Object.keys(CATEGORIAS))(
  "%s não cresce em nenhum arquivo",
  (categoria) => {
    const piorou = excessos({ [categoria]: placar[categoria] }, limites).map(
      (i) => `${i.arquivo}: limite ${i.limite}, medido ${i.medido}`,
    );
    expect(piorou).toEqual([]);
  },
);

test("os limites gravados não ficam acima do medido (a catraca só desce)", () => {
  const folgas = [];
  for (const [categoria, porArquivo] of Object.entries(limites))
    for (const [arquivo, limite] of Object.entries(porArquivo)) {
      const medido = placar[categoria]?.[arquivo] ?? 0;
      if (medido < limite)
        folgas.push(
          `${categoria} ${arquivo}: limite ${limite}, medido ${medido}`,
        );
    }
  // Melhorou? Ótimo: rode `npm run arquitetura:limites` para travar o ganho.
  expect(folgas).toEqual([]);
});
