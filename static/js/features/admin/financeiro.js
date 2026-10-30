/**
 * Edição e exclusão de vendas e de movimentações do extrato (modal "modalEdicaoFinanceira").
 * Orquestra o ciclo: abrir, carregar a venda (descartando respostas atrasadas), salvar com a
 * versão para detectar edição concorrente, excluir e recarregar as listas afetadas.
 * Vínculos financeiros sempre passam pela venda: movimento de venda abre a própria venda.
 * Markup em edicao-venda-html.js; comportamento dos itens em edicao-venda-itens.js.
 */
import { requisitar } from "./requests.js";
import { toast, abrirModalAdmin, fecharModalAdmin } from "./ui.js";
import { UIModal } from "../../shared/modals.js";
import { mensagemErro, formatCurrency } from "../../shared/utils.js";
import {
  HTML_CARREGANDO,
  HTML_ERRO_VENDA,
  htmlCamposVenda,
  htmlCamposMovimento,
} from "./edicao-venda-html.js";
import {
  atualizarResumoVenda,
  configurarEditorItens,
} from "./edicao-venda-itens.js";

const MODAL = "modalEdicaoFinanceira";
/** Registro aberto: { url, versao, venda? }. Nulo enquanto a venda carrega. */
let registroEmEdicao = null;
/** Cada consulta ganha um número; resposta de consulta anterior é descartada. */
let geracaoConsultaVenda = 0;

const elemento = (id) => document.getElementById(id);
const botaoSalvar = () => elemento("btn-salvar-edicao-financeira");
const camposEdicao = () => elemento("edicao-financeira-campos");

/** Recarrega o que a edição pode ter mudado: vendas, saldos, estoque e o extrato aberto. */
async function atualizarListas() {
  const [
    { carregarVendas },
    { carregarMembros, atualizarExtratoAberto },
    { carregarProdutos },
  ] = await Promise.all([
    import("./vendas.js"),
    import("./membros.js"),
    import("./produtos.js"),
  ]);
  await Promise.all([carregarVendas(), carregarMembros(), carregarProdutos()]);
  await atualizarExtratoAberto();
}

function limparEdicaoAoFechar() {
  geracaoConsultaVenda++;
  registroEmEdicao = null;
  botaoSalvar().disabled = false;
}

/** A consulta foi substituída por outra, ou o modal já fechou/está fechando. */
function consultaObsoleta(geracao) {
  const modal = elemento(MODAL);
  return (
    geracao !== geracaoConsultaVenda ||
    modal.classList.contains("d-none") ||
    modal.classList.contains("closing")
  );
}

function preencher(titulo, camposHtml, registro, complemento = "") {
  registroEmEdicao = registro;
  elemento("edicao-financeira-subtitulo").textContent = complemento;
  const vendaComItens = Boolean(registro?.venda?.itens?.length);
  // Venda com itens: cabeçalho e rodapé fixos, só os campos rolam.
  const formulario = elemento("form-edicao-financeira");
  for (const classe of ["edicao-venda", "d-flex", "flex-column"])
    formulario.classList.toggle(classe, vendaComItens);
  formulario
    .querySelector(".edicao-aviso-generico")
    ?.classList.toggle("d-none", vendaComItens);
  for (const classe of ["flex-grow-1", "overflow-auto"])
    camposEdicao().classList.toggle(classe, vendaComItens);
  document.querySelector(
    "#edicao-financeira-titulo [data-titulo-texto]",
  ).textContent = titulo;
  camposEdicao().innerHTML = camposHtml;
  if (vendaComItens) atualizarResumoVenda(camposEdicao());
}

function abrir(titulo, camposHtml, registro, complemento = "") {
  fecharModalAdmin("modalExtrato");
  preencher(titulo, camposHtml, registro, complemento);
  abrirModalAdmin(MODAL, {
    // Loading de consulta pode ser cancelado; escrita em andamento, não.
    podeFechar: () => !registroEmEdicao || !botaoSalvar().disabled,
  });
}

function confirmarExclusao(url, versao, descricao) {
  UIModal.confirm(
    `${descricao} Excluir definitivamente? Estoque e valores relacionados serão recalculados.`,
    async () => {
      let versaoAtual = versao;
      if (versaoAtual === undefined) {
        const respostaDetalhe = await requisitar("GET", url);
        if (!respostaDetalhe) return;
        versaoAtual = respostaDetalhe.venda?.versao;
        if (versaoAtual == null)
          return toast("Não foi possível carregar a versão da venda.", false);
      }
      const resposta = await requisitar("DELETE", url, { versao: versaoAtual });
      if (!resposta) return;
      toast(resposta.mensagem, true);
      fecharModalAdmin("modalExtrato");
      await atualizarListas();
    },
  );
}

/** Data e hora curtas da venda, mostradas no título ("Editar venda - 25/10/2026, 23:14"). */
const dataDaVenda = (venda) =>
  venda.criado_em
    ? new Date(venda.criado_em).toLocaleString("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "";

export async function administrarVenda(id, acao) {
  const url = `/admin/vendas/${id}`;
  if (acao === "excluir")
    return confirmarExclusao(url, undefined, "Venda selecionada.");

  const geracao = ++geracaoConsultaVenda;
  botaoSalvar().disabled = true;
  abrir("Editar venda", HTML_CARREGANDO, null);
  const resposta = await requisitar("GET", url);
  if (consultaObsoleta(geracao)) return;
  if (!resposta) {
    camposEdicao().innerHTML = HTML_ERRO_VENDA;
    return;
  }
  let venda;
  try {
    ({ venda } = resposta);
    if (!venda) throw new Error("Venda indisponível.");
  } catch (erro) {
    if (!consultaObsoleta(geracao)) {
      camposEdicao().innerHTML = HTML_ERRO_VENDA;
      toast(mensagemErro(erro, "Resposta inválida da venda."), false);
    }
    return;
  }
  if (consultaObsoleta(geracao)) return;
  preencher(
    "Editar venda",
    htmlCamposVenda(venda),
    { url, venda, versao: venda.versao },
    dataDaVenda(venda),
  );
  botaoSalvar().disabled = false;
}

export function administrarMovimento(membroId, movimento, acao) {
  if (movimento.venda_id) return administrarVenda(movimento.venda_id, acao);
  const url = `/admin/membros/${membroId}/movimentos/${movimento.id}`;
  if (acao === "excluir")
    return confirmarExclusao(
      url,
      movimento.versao,
      `Movimentação de ${formatCurrency(movimento.valor)}.`,
    );
  abrir(
    "Editar movimentação",
    htmlCamposMovimento(movimento),
    { url, versao: movimento.versao },
    movimento.data || "",
  );
}

/** Corpo do PUT a partir dos campos (os names são definidos em edicao-venda-html.js). */
function montarPayload(registro, dadosFormulario) {
  const dados = { versao: registro.versao };
  if (!registro.venda)
    return Object.assign(dados, {
      tipo: dadosFormulario.get("tipo"),
      valor: dadosFormulario.get("valor"),
      descricao: dadosFormulario.get("descricao"),
    });
  Object.assign(dados, {
    nome_cliente: dadosFormulario.get("nome_cliente"),
    metodo_pagamento: dadosFormulario.get("metodo_pagamento"),
    observacoes: dadosFormulario.get("observacoes"),
  });
  dados.itens = (registro.venda.itens || []).map((item, indice) => ({
    id: item.id,
    quantidade: Number(dadosFormulario.get(`qtd-${indice}`)),
    preco_unitario: dadosFormulario.get(`preco-${indice}`),
    observacoes: dadosFormulario.get(`obs-${indice}`),
  }));
  if (!dados.itens.length)
    dados.valor_total = dadosFormulario.get("valor_total");
  return dados;
}

async function salvar(evento) {
  evento.preventDefault();
  const botao = botaoSalvar();
  if (!registroEmEdicao || botao.disabled) return;
  const registro = registroEmEdicao;
  const dados = montarPayload(registro, new FormData(evento.target));
  botao.disabled = true;
  try {
    const resposta = await requisitar("PUT", registro.url, dados);
    if (!resposta) return;
    toast(resposta.mensagem, true);
    fecharModalAdmin(MODAL, { concluido: true });
    await atualizarListas();
  } finally {
    botao.disabled = false;
  }
}

export function configurarEdicaoFinanceira() {
  elemento(MODAL)?.addEventListener("admin:fechar", limparEdicaoAoFechar);
  document
    .querySelectorAll("[data-fechar-edicao]")
    .forEach((botao) =>
      botao.addEventListener("click", () => fecharModalAdmin(MODAL)),
    );
  if (camposEdicao()) configurarEditorItens(camposEdicao());
  // Ações da linha da tabela de vendas (acoes-linha.js): data-action "editar" ou "excluir".
  elemento("tabelaVendas")?.addEventListener("click", (evento) => {
    const botao = evento.target.closest("[data-action]");
    if (botao) administrarVenda(botao.dataset.id, botao.dataset.action);
  });
  elemento("form-edicao-financeira")?.addEventListener("submit", salvar);
}
