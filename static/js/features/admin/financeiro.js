/** Editor de vendas e movimentos; vínculos financeiros sempre passam pela venda. */
import { authFetch } from "./requests.js";
import { esc, toast, fecharModalAdmin } from "./ui.js";
import { UIModal } from "../../shared/modals.js";
import { mensagemErro } from "../../shared/utils.js";

let registroEmEdicao = null;
let elementoRetornoFoco = null;
let geracaoConsultaVenda = 0;
const dinheiro = (valor) => Number(valor).toFixed(2);
/** Campo do formulário genérico (movimento, venda sem itens); vai dentro de .row g-3. */
const campo = (rotulo, conteudo, largura = "col-12 col-md-6") =>
  `<label class="${largura} d-flex flex-column gap-2 mb-0"><span class="form-label mb-0">${rotulo}</span>${conteudo}</label>`;

async function atualizar() {
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

function fechar() {
  geracaoConsultaVenda++;
  fecharModalAdmin("modalEdicaoFinanceira");
  registroEmEdicao = null;
  document.getElementById("btn-salvar-edicao-financeira").disabled = false;
  elementoRetornoFoco?.focus();
}

function preencher(titulo, camposHtml, registro, subtitulo = "") {
  registroEmEdicao = registro;
  document.getElementById("edicao-financeira-subtitulo").textContent =
    subtitulo;
  const formularioEdicao = document.getElementById("form-edicao-financeira");
  const vendaComItens = Boolean(registro?.venda?.itens?.length);
  // Venda com itens: cabeçalho e rodapé fixos, só os campos rolam.
  for (const classe of ["edicao-venda", "d-flex", "flex-column"])
    formularioEdicao.classList.toggle(classe, vendaComItens);
  formularioEdicao
    .querySelector(".edicao-aviso-generico")
    ?.classList.toggle("d-none", vendaComItens);
  const camposEdicao = document.getElementById("edicao-financeira-campos");
  for (const classe of ["flex-grow-1", "overflow-auto"])
    camposEdicao.classList.toggle(classe, vendaComItens);
  document.getElementById("edicao-financeira-titulo").textContent = titulo;
  camposEdicao.innerHTML = camposHtml;
  if (vendaComItens) atualizarResumoVenda();
}

function abrir(titulo, camposHtml, registro, subtitulo = "") {
  elementoRetornoFoco = document.activeElement;
  fecharModalAdmin("modalExtrato");
  preencher(titulo, camposHtml, registro, subtitulo);
  document.getElementById("modalEdicaoFinanceira").classList.remove("d-none");
  document.body.classList.add("modal-open");
  if (!window.matchMedia?.("(max-width: 768px)").matches) {
    document
      .querySelector(
        "#edicao-financeira-campos input, #edicao-financeira-campos select",
      )
      ?.focus();
  }
}

const ICONE = (caminhos) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${caminhos}</svg>`;

/** Observação do item: linha própria da tabela, aberta pelo botão de lápis. */
const OBSERVACAO_ABERTA = ["d-block", "d-md-table-row"];

/**
 * Um <tbody> por item: a linha dos campos e a da observação. No desktop é uma linha da
 * .table; no celular (tabela-cartoes) o <tbody> vira o cartão e cada célula mostra o
 * próprio data-label.
 */
function htmlItemVenda(item, indice) {
  const nome = esc(item.nome_produto);
  return `
        <tbody class="edicao-item-venda mb-3 mb-md-0" data-item-venda="${indice}">
            <tr class="d-flex flex-column d-md-table-row">
                <td class="edicao-item-produto d-flex flex-column gap-1 d-md-table-cell" data-label="Produto">
                    <strong class="text-break">${nome}</strong>
                    <small class="d-block text-body-secondary">Código: ${esc(String(item.produto_id ?? "—"))}</small>
                </td>
                <td class="d-flex flex-column gap-1 d-md-table-cell" data-label="Quantidade">
                    <div class="input-group flex-nowrap edicao-item-quantidade">
                        <button type="button" class="btn btn-escuro" data-quantidade-delta="-1" aria-label="Diminuir quantidade">−</button>
                        <input type="number" class="form-control text-center" name="qtd-${indice}" min="0" max="100000" step="1" required
                            value="${item.quantidade}" aria-label="Quantidade de ${nome}">
                        <button type="button" class="btn btn-escuro" data-quantidade-delta="1" aria-label="Aumentar quantidade">+</button>
                    </div>
                </td>
                <td class="d-flex flex-column gap-1 d-md-table-cell" data-label="Preço unitário (R$)">
                    <input type="number" class="form-control edicao-item-preco" name="preco-${indice}" min="0" step="0.01" required
                        value="${dinheiro(item.preco_unitario)}" aria-label="Preço unitário (R$)">
                </td>
                <td class="d-flex flex-column gap-1 d-md-table-cell text-md-end" data-label="Subtotal (R$)">
                    <strong class="edicao-item-subtotal" data-subtotal-item>${dinheiro(item.preco_total)}</strong>
                </td>
                <td class="sem-rotulo d-md-table-cell">
                    <div class="d-flex gap-2 justify-content-md-end">
                        <button type="button" class="btn btn-escuro p-2 flex-fill flex-md-grow-0" data-alternar-observacao aria-label="Editar observação do item" title="Editar observação">
                            ${ICONE('<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/>')}
                        </button>
                        <button type="button" class="btn btn-excluir p-2 flex-fill flex-md-grow-0" data-remover-item aria-label="Remover ${nome}" title="Remover item">
                            ${ICONE('<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/>')}
                        </button>
                    </div>
                </td>
            </tr>
            <tr class="d-none" data-observacao-item>
                <td class="sem-rotulo d-block d-md-table-cell" colspan="5">
                    <label class="form-label" for="obs-item-${indice}">Observação do item</label>
                    <textarea class="form-control" id="obs-item-${indice}" name="obs-${indice}" maxlength="1000" rows="2">${esc(item.observacoes || "")}</textarea>
                </td>
            </tr>
        </tbody>`;
}

function montarEditorItensVenda(venda) {
  return `
        <div class="col-12">
            <section class="card edicao-itens-venda overflow-hidden" aria-labelledby="edicao-itens-titulo">
                <header class="card-header edicao-itens-cabecalho d-flex align-items-center gap-3 px-3 px-md-4 py-3">
                    <div class="d-flex flex-column gap-1 flex-grow-1">
                        <h3 class="h6 fw-bold m-0" id="edicao-itens-titulo">Itens da venda</h3>
                        <p class="small text-body-secondary m-0 d-none d-md-block">Altere a quantidade ou o preço. Quantidade zero remove o item.</p>
                    </div>
                    <span class="edicao-itens-contagem badge rounded-pill flex-shrink-0" data-contagem-itens aria-live="polite"></span>
                </header>
                <div class="table-responsive p-3 p-md-0">
                    <table class="table align-middle mb-0 tabela-cartoes tabela-itens-venda d-block d-md-table">
                        <thead class="text-uppercase text-nowrap">
                            <tr>
                                <th scope="col">Produto</th>
                                <th scope="col">Quantidade</th>
                                <th scope="col">Preço unitário (R$)</th>
                                <th scope="col" class="text-end">Subtotal (R$)</th>
                                <th scope="col" class="text-end">Ações</th>
                            </tr>
                        </thead>
                        ${venda.itens.map(htmlItemVenda).join("")}
                    </table>
                </div>
            </section>
        </div>
        <div class="col-12 col-md-6">
            <section class="card h-100 p-3" aria-labelledby="edicao-resumo-titulo">
                <h4 id="edicao-resumo-titulo" class="h6 fw-bold d-flex align-items-center gap-2 m-0"><span aria-hidden="true">▤</span> Resumo da venda</h4>
                <dl class="d-flex flex-column gap-2 small mt-3 mb-0">
                    <div class="d-flex justify-content-between gap-2"><dt class="fw-normal text-body-secondary">Itens</dt><dd class="fw-bold m-0" data-resumo-itens>0</dd></div>
                    <div class="d-flex justify-content-between gap-2"><dt class="fw-normal text-body-secondary">Quantidade total</dt><dd class="fw-bold m-0" data-resumo-quantidade>0</dd></div>
                    <div class="d-flex justify-content-between gap-2 border-top fs-6 pt-2"><dt>Total da venda</dt><dd class="edicao-resumo-total fw-bold m-0" data-resumo-total>R$ 0,00</dd></div>
                </dl>
            </section>
        </div>
        <div class="col-12 col-md-6">
            <aside class="alert alert-danger h-100 p-3 mb-0" role="note">
                <h4 class="alert-heading h6 fw-bold d-flex align-items-center gap-2 m-0"><span aria-hidden="true">ⓘ</span> Atenção</h4>
                <p class="small text-body-secondary mt-2 mb-0 ps-4">Estoque, divisão e totais do caixa serão recalculados ao salvar as alterações.</p>
            </aside>
        </div>`;
}

function atualizarResumoVenda() {
  const camposEdicao = document.getElementById("edicao-financeira-campos");
  if (!camposEdicao.querySelector(".edicao-itens-venda")) return;
  let total = 0;
  let quantidadeTotal = 0;
  let itensAtivos = 0;
  camposEdicao.querySelectorAll(".edicao-item-venda").forEach((linha) => {
    const quantidade = Math.max(
      0,
      Number(linha.querySelector('[name^="qtd-"]').value) || 0,
    );
    const preco = Math.max(
      0,
      Number(linha.querySelector('[name^="preco-"]').value) || 0,
    );
    const subtotal = quantidade * preco;
    linha.querySelector("[data-subtotal-item]").textContent =
      dinheiro(subtotal);
    linha.classList.toggle("removido", quantidade === 0);
    linha.querySelector("tr").classList.toggle("opacity-50", quantidade === 0);
    total += subtotal;
    quantidadeTotal += quantidade;
    if (quantidade > 0) itensAtivos += 1;
  });
  camposEdicao.querySelector("[data-resumo-itens]").textContent = itensAtivos;
  camposEdicao.querySelector("[data-contagem-itens]").textContent =
    `${quantidadeTotal} ${quantidadeTotal === 1 ? "unidade" : "unidades"}`;
  camposEdicao.querySelector("[data-resumo-quantidade]").textContent =
    quantidadeTotal;
  camposEdicao.querySelector("[data-resumo-total]").textContent =
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(total);
}

async function excluir(url, versao, descricao) {
  UIModal.confirm(
    `${descricao} Excluir definitivamente? Estoque e valores relacionados serão recalculados.`,
    async () => {
      let versaoAtual = versao;
      if (versaoAtual === undefined) {
        const respostaDetalhe = await authFetch(url);
        if (!respostaDetalhe) return;
        versaoAtual = (await respostaDetalhe.json()).venda?.versao;
        if (versaoAtual == null)
          return toast("Não foi possível carregar a versão da venda.", false);
      }
      const resposta = await authFetch(url, {
        method: "DELETE",
        body: JSON.stringify({ versao: versaoAtual }),
      });
      if (!resposta) return;
      toast((await resposta.json()).mensagem, true);
      fecharModalAdmin("modalExtrato");
      await atualizar();
    },
  );
}

export async function administrarVenda(id, acao) {
  const url = `/api/admin/vendas/${id}`;
  if (acao === "excluir") return excluir(url, undefined, "Venda selecionada.");

  const geracaoConsultaAtual = ++geracaoConsultaVenda;
  const botaoSalvar = document.getElementById("btn-salvar-edicao-financeira");
  botaoSalvar.disabled = true;
  abrir(
    "Editar venda",
    '<p class="text-body-secondary m-0" role="status">Carregando dados da venda...</p>',
    null,
  );
  const resposta = await authFetch(url);
  const modal = document.getElementById("modalEdicaoFinanceira");
  if (
    geracaoConsultaAtual !== geracaoConsultaVenda ||
    modal.classList.contains("d-none") ||
    modal.classList.contains("closing")
  )
    return;
  if (!resposta) {
    document.getElementById("edicao-financeira-campos").innerHTML =
      '<p role="alert">Não foi possível carregar a venda. Feche e tente novamente.</p>';
    return;
  }
  let venda;
  try {
    ({ venda } = await resposta.json());
    if (!venda) throw new Error("Venda indisponível.");
  } catch (erro) {
    if (
      geracaoConsultaAtual === geracaoConsultaVenda &&
      !modal.classList.contains("d-none") &&
      !modal.classList.contains("closing")
    ) {
      document.getElementById("edicao-financeira-campos").innerHTML =
        '<p role="alert">Não foi possível carregar a venda. Feche e tente novamente.</p>';
      toast(mensagemErro(erro, "Resposta inválida da venda."), false);
    }
    return;
  }
  if (
    geracaoConsultaAtual !== geracaoConsultaVenda ||
    modal.classList.contains("d-none") ||
    modal.classList.contains("closing")
  )
    return;
  const metodosPagamento =
    venda.tipo_venda === "fiado"
      ? [["fiado", "Fiado"]]
      : venda.tipo_venda === "ajuste"
        ? [["ajuste", "Ajuste"]]
        : [
            ["dinheiro", "Dinheiro"],
            ["pix", "Pix"],
            ["cartao_credito", "Cartão de crédito"],
            ["cartao_debito", "Cartão de débito"],
          ];
  const opcoesPagamento = metodosPagamento
    .map(
      ([valorMetodo, nomeMetodo]) =>
        `<option value="${valorMetodo}" ${venda.metodo_pagamento === valorMetodo ? "selected" : ""}>${nomeMetodo}</option>`,
    )
    .join("");
  let camposHtml;
  if (venda.itens?.length) {
    camposHtml = `<div class="row g-3">
            <div class="col-12 col-md-6">
                <label class="form-label d-flex align-items-center gap-2" for="edicao-cliente">${ICONE('<circle cx="12" cy="8" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>')}Cliente</label>
                <input class="form-control py-2" id="edicao-cliente" name="nome_cliente" maxlength="200" value="${esc(venda.nome_cliente || "")}" placeholder="Nome do cliente">
            </div>
            <div class="col-12 col-md-6">
                <label class="form-label d-flex align-items-center gap-2" for="edicao-pagamento">${ICONE('<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 10h20"/>')}Pagamento</label>
                <select class="form-select py-2" id="edicao-pagamento" name="metodo_pagamento">${opcoesPagamento}</select>
            </div>
            <div class="col-12">
                <label class="form-label d-flex align-items-center gap-2" for="edicao-observacoes">${ICONE('<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z"/>')}Observações da venda</label>
                <textarea class="form-control" id="edicao-observacoes" name="observacoes" maxlength="2000" rows="2" placeholder="Digite observações gerais da venda...">${esc(venda.observacoes || "")}</textarea>
                <div class="form-text text-end"><span data-contador-observacoes>${(venda.observacoes || "").length}</span>/2000</div>
            </div>
            ${montarEditorItensVenda(venda)}
        </div>`;
  } else {
    camposHtml = `<div class="row g-3">${
      campo(
        "Cliente",
        `<input class="form-control py-2" name="nome_cliente" maxlength="200" value="${esc(venda.nome_cliente || "")}">`,
      ) +
      campo(
        "Pagamento",
        `<select class="form-select py-2" name="metodo_pagamento">${opcoesPagamento}</select>`,
      ) +
      campo(
        "Valor (R$)",
        `<input class="form-control py-2" type="number" name="valor_total" min="0" step="0.01" required value="${dinheiro(venda.valor_total)}">`,
      ) +
      campo(
        "Observações",
        `<textarea class="form-control" name="observacoes" maxlength="2000" rows="2">${esc(venda.observacoes || "")}</textarea>`,
        "col-12",
      )
    }</div>`;
  }
  const registradaEm = venda.criado_em
    ? new Date(venda.criado_em).toLocaleString("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "";
  preencher(
    "Editar venda",
    camposHtml,
    { url, venda, versao: venda.versao },
    registradaEm ? `Registrada em ${registradaEm}` : "",
  );
  botaoSalvar.disabled = false;
}

export function administrarMovimento(membroId, movimento, acao) {
  if (movimento.venda_id) return administrarVenda(movimento.venda_id, acao);
  const url = `/api/admin/membros/${membroId}/movimentos/${movimento.id}`;
  if (acao === "excluir")
    return excluir(
      url,
      movimento.versao,
      `Movimentação de R$ ${dinheiro(movimento.valor)}.`,
    );
  const camposHtml = `<div class="row g-3">${
    campo(
      "Tipo",
      `<select class="form-select py-2" name="tipo"><option value="debito" ${movimento.tipo === "debito" ? "selected" : ""}>Débito</option><option value="credito" ${movimento.tipo === "credito" ? "selected" : ""}>Crédito</option></select>`,
    ) +
    campo(
      "Valor (R$)",
      `<input class="form-control py-2" name="valor" type="number" min="0" step="0.01" required value="${dinheiro(movimento.valor)}">`,
    ) +
    campo(
      "Descrição",
      `<input class="form-control py-2" name="descricao" maxlength="1000" value="${esc(movimento.descricao || "")}">`,
      "col-12",
    )
  }</div>`;
  abrir(
    "Editar movimentação",
    camposHtml,
    { url, versao: movimento.versao },
    movimento.data ? `Lançada em ${movimento.data}` : "",
  );
}

export function configurarEdicaoFinanceira() {
  document
    .querySelectorAll("[data-fechar-edicao]")
    .forEach((botao) => botao.addEventListener("click", fechar));
  const camposEdicao = document.getElementById("edicao-financeira-campos");
  camposEdicao?.addEventListener("click", (evento) => {
    const botao = evento.target.closest("button");
    if (!botao) return;
    const linha = botao.closest(".edicao-item-venda");
    if (!linha) return;
    const campoQuantidade = linha.querySelector('[name^="qtd-"]');
    if (botao.hasAttribute("data-quantidade-delta")) {
      campoQuantidade.value = Math.max(
        0,
        Math.min(
          100000,
          (Number(campoQuantidade.value) || 0) +
            Number(botao.dataset.quantidadeDelta),
        ),
      );
      campoQuantidade.dispatchEvent(new Event("input", { bubbles: true }));
    } else if (botao.hasAttribute("data-remover-item")) {
      campoQuantidade.value = 0;
      campoQuantidade.dispatchEvent(new Event("input", { bubbles: true }));
    } else if (botao.hasAttribute("data-alternar-observacao")) {
      const observacaoItem = linha.querySelector("[data-observacao-item]");
      const fechada = observacaoItem.classList.toggle("d-none");
      for (const classe of OBSERVACAO_ABERTA)
        observacaoItem.classList.toggle(classe, !fechada);
      if (!fechada) observacaoItem.querySelector("textarea").focus();
    }
  });
  camposEdicao?.addEventListener("input", (evento) => {
    if (evento.target.matches('[name^="qtd-"], [name^="preco-"]'))
      atualizarResumoVenda();
    if (evento.target.name === "observacoes") {
      const contadorObservacoes = camposEdicao.querySelector(
        "[data-contador-observacoes]",
      );
      if (contadorObservacoes)
        contadorObservacoes.textContent = evento.target.value.length;
    }
  });
  document
    .getElementById("tabelaVendas")
    ?.addEventListener("click", (evento) => {
      const botao = evento.target.closest("[data-venda-acao]");
      if (botao) administrarVenda(botao.dataset.id, botao.dataset.vendaAcao);
    });
  document
    .getElementById("form-edicao-financeira")
    ?.addEventListener("submit", async (evento) => {
      evento.preventDefault();
      const botao = document.getElementById("btn-salvar-edicao-financeira");
      if (!registroEmEdicao || botao.disabled) return;
      const registro = registroEmEdicao;
      const dadosFormulario = new FormData(evento.target);
      const dados = { versao: registro.versao };
      if (registro.venda) {
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
      } else {
        Object.assign(dados, {
          tipo: dadosFormulario.get("tipo"),
          valor: dadosFormulario.get("valor"),
          descricao: dadosFormulario.get("descricao"),
        });
      }
      botao.disabled = true;
      try {
        const resposta = await authFetch(registro.url, {
          method: "PUT",
          body: JSON.stringify(dados),
        });
        if (!resposta) return;
        toast((await resposta.json()).mensagem, true);
        fechar();
        await atualizar();
      } finally {
        botao.disabled = false;
      }
    });
}
