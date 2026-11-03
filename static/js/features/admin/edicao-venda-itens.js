/**
 * Comportamento do editor de itens da venda (markup em edicao-venda-html.js): quantidade
 * com +/−, remoção (quantidade zero, o item segue visível e esmaecido até salvar; o item
 * novo sai da tabela), troca de produto, inclusão de produtos, observação por item,
 * contador das observações da venda e o resumo com o total.
 * Trabalha só no contêiner de campos do modal; não chama a API.
 */
import { formatCurrency, formatarValor } from "../../shared/utils.js";
import { INDICE_MODELO } from "./edicao-venda-html.js";

const QUANTIDADE_MAXIMA = 100000;
/** Linha aberta (troca, observação): bloco no cartão do celular, linha da tabela no desktop. */
const LINHA_ABERTA = ["d-block", "d-md-table-row"];
/** Itens novos ganham índices n0, n1...: nunca colidem com os itens da venda (0, 1...). */
let proximoItemNovo = 0;

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
    Number(campoQuantidade.min) || 0,
    Math.min(QUANTIDADE_MAXIMA, calcular(atual)),
  );
  campoQuantidade.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Abre ou fecha a linha da troca ou da observação e foca o campo dela. */
function alternarLinha(linha, seletor) {
  const linhaExtra = linha.querySelector(seletor);
  const fechada = linhaExtra.classList.toggle("d-none");
  for (const classe of LINHA_ABERTA)
    linhaExtra.classList.toggle(classe, !fechada);
  if (!fechada) linhaExtra.querySelector("select, textarea").focus();
}

/** Clona o modelo do item novo no fim da tabela, com um índice único. */
function adicionarItem(camposEdicao) {
  const modelo = camposEdicao.querySelector("[data-modelo-item-novo]");
  const html = modelo.innerHTML.replaceAll(
    INDICE_MODELO,
    `n${proximoItemNovo++}`,
  );
  const tabela = camposEdicao.querySelector(".tabela-itens-venda");
  tabela.insertAdjacentHTML("beforeend", html);
  tabela.lastElementChild.querySelector("select").focus();
  atualizarResumoVenda(camposEdicao);
}

function removerItem(camposEdicao, linha) {
  if (!linha.hasAttribute("data-item-novo"))
    return definirQuantidade(linha, () => 0);
  linha.remove();
  atualizarResumoVenda(camposEdicao);
  camposEdicao.querySelector("[data-adicionar-item]").focus();
}

/**
 * Produto escolhido (troca ou item novo): o preço passa a ser o da opção (o atual do
 * cadastro, ou o da venda ao desfazer a troca) e o nome e o código acompanham.
 */
function escolherProduto(seletor) {
  const linha = seletor.closest(".edicao-item-venda");
  const opcao = seletor.selectedOptions[0];
  const nome = linha.querySelector("[data-nome-item]");
  if (nome) nome.textContent = opcao.dataset.nome;
  const codigo = linha.querySelector("[data-codigo-item]");
  if (codigo) codigo.textContent = `Código: ${seletor.value || "—"}`;
  if (opcao.dataset.preco === undefined) return;
  const campoPreco = linha.querySelector('[name^="preco-"]');
  campoPreco.value = opcao.dataset.preco;
  campoPreco.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Liga os controles dos itens no contêiner de campos; chamado uma vez. */
export function configurarEditorItens(camposEdicao) {
  camposEdicao.addEventListener("click", (evento) => {
    const botao = evento.target.closest("button");
    if (botao?.hasAttribute("data-adicionar-item"))
      return adicionarItem(camposEdicao);
    const linha = botao?.closest(".edicao-item-venda");
    if (!linha) return;
    if (botao.hasAttribute("data-quantidade-delta"))
      definirQuantidade(
        linha,
        (atual) => atual + Number(botao.dataset.quantidadeDelta),
      );
    else if (botao.hasAttribute("data-remover-item"))
      removerItem(camposEdicao, linha);
    else if (botao.hasAttribute("data-alternar-troca"))
      alternarLinha(linha, "[data-troca-item]");
    else if (botao.hasAttribute("data-alternar-observacao"))
      alternarLinha(linha, "[data-observacao-item]");
  });
  camposEdicao.addEventListener("change", (evento) => {
    if (evento.target.matches('select[name^="produto-"]'))
      escolherProduto(evento.target);
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
