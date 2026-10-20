import { LocalDB } from "../../shared/utils.js";

export const estadoPdv = {
  logoUrl: "/static/img/motorhead.svg",
  produtos: [],
  categoriaCatalogo: "bebida",
  membros: [],
  carrinho: [],
  filaVendas: [],
  produtoPendente: null,
  produtoEdicao: null,
  config: {
    imprimir: true,
    largura: "ticket-80mm",
    logo: "/static/img/motorhead.svg",
  },
  dadosFechamentoAtual: null,
  dadosRelatorioAtual: null,
  contextoMembro: "",
  modoGerenciaEstoque: false,
  senhaEstoque: null,
  estoqueOriginalBar: 0,
  operadorAtual: "",
  usuarioAtual: null,
  inicioTurno: null,
  pagamentoPendente: { tipo: "", valorTotal: 0, dados: null },
  caixaAberto: false,
  caixaId: null,
  valorAbertura: 0,
  tipoRelatorioAtual: "",
  enviandoVenda: false,
  processandoFila: false,
  lastProcessTime: 0,
};

export function salvarEstadoLocal() {
  LocalDB.set("motoBarCarrinho", JSON.stringify(estadoPdv.carrinho));
}

export function salvarDadosLocais() {
  LocalDB.set("motoBarProdutos", JSON.stringify(estadoPdv.produtos));
  LocalDB.set("motoBarMembros", JSON.stringify(estadoPdv.membros));
  LocalDB.set("motoBarOperador", estadoPdv.operadorAtual);
  LocalDB.set(
    "motoBarInicio",
    estadoPdv.inicioTurno ? estadoPdv.inicioTurno.toString() : "",
  );
  LocalDB.set("motoBarCarrinho", JSON.stringify(estadoPdv.carrinho));
  LocalDB.set("motoBarConfig", JSON.stringify(estadoPdv.config));
  LocalDB.set("motoBarCaixaAberto", estadoPdv.caixaAberto);
  LocalDB.set("motoBarValorAbertura", estadoPdv.valorAbertura);
  if (estadoPdv.caixaId) LocalDB.set("motoBarCaixaId", estadoPdv.caixaId);
}

export function carregarDadosLocais() {
  try {
    const produtosJson = LocalDB.get("motoBarProdutos");
    if (produtosJson) {
      estadoPdv.produtos = JSON.parse(produtosJson);
      if (!Array.isArray(estadoPdv.produtos)) estadoPdv.produtos = [];
    }
    const membrosJson = LocalDB.get("motoBarMembros");
    if (membrosJson) {
      estadoPdv.membros = JSON.parse(membrosJson);
      if (!Array.isArray(estadoPdv.membros)) estadoPdv.membros = [];
    }
    const operadorSalvo = LocalDB.get("motoBarOperador");
    if (operadorSalvo) estadoPdv.operadorAtual = operadorSalvo;
    const inicioSalvo = LocalDB.get("motoBarInicio");
    if (inicioSalvo) estadoPdv.inicioTurno = new Date(inicioSalvo);
    const carrinhoJson = LocalDB.get("motoBarCarrinho");
    if (carrinhoJson) {
      estadoPdv.carrinho = JSON.parse(carrinhoJson);
      if (!Array.isArray(estadoPdv.carrinho)) estadoPdv.carrinho = [];
    }
    // The outbox is loaded asynchronously from IndexedDB, never overwritten here.
    const configuracoesJson = LocalDB.get("motoBarConfig");
    if (configuracoesJson) estadoPdv.config = JSON.parse(configuracoesJson);
    estadoPdv.caixaAberto = LocalDB.get("motoBarCaixaAberto") === "true";
    const valorAberturaSalvo = LocalDB.get("motoBarValorAbertura");
    if (valorAberturaSalvo)
      estadoPdv.valorAbertura = Number(valorAberturaSalvo);
    const caixaIdSalvo = LocalDB.get("motoBarCaixaId");
    if (caixaIdSalvo) estadoPdv.caixaId = caixaIdSalvo;
  } catch (erroCarregamento) {
    console.error("Erro cache", erroCarregamento);
  }
}
