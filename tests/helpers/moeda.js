/**
 * Dinheiro como a tela mostra: Intl.NumberFormat("pt-BR") separa "R$" do número com um
 * espaço não separável (U+00A0), invisível no editor. reais("12,30") === "R$ 12,30" da tela.
 */
const ESPACO_NAO_SEPARAVEL = String.fromCharCode(0xa0);

export const reais = (valor) => `R$${ESPACO_NAO_SEPARAVEL}${valor}`;
