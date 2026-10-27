/**
 * Regras de combo compartilhadas por PDV e painel: o combo não tem estoque
 * próprio, então disponibilidade e baixa sempre passam pelos itens dele.
 * O backend repete estas regras na venda; aqui servem para a tela não prometer
 * o que o bar não tem.
 */

export function temCategoriaCombo(produto) {
  return (
    String(produto?.categoria || "")
      .trim()
      .toLowerCase() === "combo"
  );
}

/** Itens de estoque que uma linha do carrinho consome: combo expande, avulso é ele mesmo. */
export function itensConsumidos(produto, idProduto) {
  if (temCategoriaCombo(produto))
    return (produto.itens_combo || []).map((itemCombo) => ({
      id: itemCombo.produto_id,
      fator: Number(itemCombo.quantidade) || 0,
    }));
  return [{ id: Number(idProduto), fator: 1 }];
}

/** Unidades de cada produto de estoque já reservadas pelo carrinho, contando combos. */
export function consumoDoCarrinho(carrinho, produtos) {
  const consumo = new Map();
  (Array.isArray(carrinho) ? carrinho : []).forEach((itemCarrinho) => {
    const produto = produtos.find(
      (candidato) => candidato.id == itemCarrinho.id,
    );
    itensConsumidos(produto, itemCarrinho.id).forEach(({ id, fator }) => {
      consumo.set(
        id,
        (consumo.get(id) || 0) + fator * Number(itemCarrinho.qtd),
      );
    });
  });
  return consumo;
}

/**
 * Quantas unidades ainda cabem no bar. Para combo é o item mais escasso;
 * item fora da lista (inativo ou excluído) zera o combo.
 */
export function disponivelNoBar(produto, produtos, carrinho = []) {
  const consumo = consumoDoCarrinho(carrinho, produtos);
  const restante = (id) => {
    const item = produtos.find((candidato) => candidato.id == id);
    if (!item || item.ativo === false) return 0;
    return (Number(item.estoque_bar) || 0) - (consumo.get(Number(id)) || 0);
  };
  if (!temCategoriaCombo(produto)) return restante(produto.id);
  const itensCombo = produto.itens_combo || [];
  if (!itensCombo.length) return 0;
  return Math.max(
    0,
    Math.min(
      ...itensCombo.map((itemCombo) =>
        Math.floor(restante(itemCombo.produto_id) / itemCombo.quantidade),
      ),
    ),
  );
}

/** Soma dos itens comprados separadamente, base para mostrar a economia do combo. */
export function precoAvulso(itensCombo, produtos = []) {
  return (itensCombo || []).reduce((total, itemCombo) => {
    const produto = produtos.find(
      (candidato) => candidato.id == itemCombo.produto_id,
    );
    const preco =
      Number(produto ? produto.preco_atual : itemCombo.preco_atual) || 0;
    return total + preco * Number(itemCombo.quantidade || 0);
  }, 0);
}

export function descricaoCombo(itensCombo) {
  return (itensCombo || [])
    .map((itemCombo) => `${itemCombo.quantidade}× ${itemCombo.nome}`)
    .join(" + ");
}
