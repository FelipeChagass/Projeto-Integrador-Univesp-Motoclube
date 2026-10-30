/**
 * Comportamento do editor de itens da venda (markup em edicao-venda-html.js): quantidade
 * com +/−, remoção (quantidade zero, o item segue visível e esmaecido até salvar),
 * observação por item, contador das observações da venda e o resumo com o total.
 * Trabalha só no contêiner de campos do modal; não chama a API.
 */
import { formatCurrency, formatarValor } from "../../shared/utils.js";

const QUANTIDADE_MAXIMA = 100000;
/** Linha da observação aberta: bloco no cartão do celular, linha da tabela no desktop. */
const OBSERVACAO_ABERTA = ["d-block", "d-md-table-row"];

const valorDoCampo = (linha, prefixo) =>
  Math.max(0, Number(linha.querySelector(`[name^="${prefixo}"]`).value) || 0);

/** Recalcula subtotais e o resumo; sem tabela de itens (venda sem itens) não faz nada. */
export function atualizarResumoVenda(camposEdicao) {
  if (!camposEdicao.querySelector(".edicao-itens-venda")) return;
  let total = 0;
  let quantidadeTotal = 0;
  let itensAtivos = 0;
  camposEdicao.querySelectorAll(".edicao-item-venda").forEach((linha) => {
    const quantidade = valorDoCampo(linha, "qtd-");
    const subtotal = quantidade * valorDoCampo(linha, "preco-");
    linha.querySelector("[data-subtotal-item]").textContent =
      formatarValor(subtotal);
    linha.classList.toggle("removido", quantidade === 0);
    linha.querySelector("tr").classList.toggle("opacity-50", quantidade === 0);
    total += subtotal;
    quantidadeTotal += quantidade;
    if (quantidade > 0) itensAtivos += 1;
  });
  camposEdicao.querySelector("[data-resumo-itens]").textContent = itensAtivos;
  camposEdicao.querySelector("[data-resumo-quantidade]").textContent =
    quantidadeTotal;
  camposEdicao.querySelector("[data-resumo-total]").textContent =
    formatCurrency(total);
}

/** Muda a quantidade e avisa pelo evento input, o mesmo caminho da digitação. */
function definirQuantidade(linha, calcular) {
  const campoQuantidade = linha.querySelector('[name^="qtd-"]');
  const atual = Number(campoQuantidade.value) || 0;
  campoQuantidade.value = Math.max(
    0,
    Math.min(QUANTIDADE_MAXIMA, calcular(atual)),
  );
  campoQuantidade.dispatchEvent(new Event("input", { bubbles: true }));
}

function alternarObservacao(linha) {
  const observacaoItem = linha.querySelector("[data-observacao-item]");
  const fechada = observacaoItem.classList.toggle("d-none");
  for (const classe of OBSERVACAO_ABERTA)
    observacaoItem.classList.toggle(classe, !fechada);
  if (!fechada) observacaoItem.querySelector("textarea").focus();
}

/** Liga os controles dos itens no contêiner de campos; chamado uma vez. */
export function configurarEditorItens(camposEdicao) {
  camposEdicao.addEventListener("click", (evento) => {
    const botao = evento.target.closest("button");
    const linha = botao?.closest(".edicao-item-venda");
    if (!linha) return;
    if (botao.hasAttribute("data-quantidade-delta"))
      definirQuantidade(
        linha,
        (atual) => atual + Number(botao.dataset.quantidadeDelta),
      );
    else if (botao.hasAttribute("data-remover-item"))
      definirQuantidade(linha, () => 0);
    else if (botao.hasAttribute("data-alternar-observacao"))
      alternarObservacao(linha);
  });
  camposEdicao.addEventListener("input", (evento) => {
    if (evento.target.matches('[name^="qtd-"], [name^="preco-"]'))
      atualizarResumoVenda(camposEdicao);
    if (evento.target.name === "observacoes") {
      const contador = camposEdicao.querySelector(
        "[data-contador-observacoes]",
      );
      if (contador) contador.textContent = evento.target.value.length;
    }
  });
}
