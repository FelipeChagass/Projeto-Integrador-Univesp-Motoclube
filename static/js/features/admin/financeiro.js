/** Editor de vendas e movimentos; vínculos financeiros sempre passam pela venda. */
import { authFetch } from "./requests.js";
import { esc, toast, fecharModalAdmin } from "./ui.js";
import { UIModal } from "../../shared/modals.js";

let registroEmEdicao = null;
let elementoRetornoFoco = null;
let geracaoConsultaVenda = 0;
const dinheiro = (valor) => Number(valor).toFixed(2);
const campo = (rotulo, conteudo) =>
  `<label class="form-group">${rotulo}${conteudo}</label>`;

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

function preencher(titulo, camposHtml, registro) {
  registroEmEdicao = registro;
  const formularioEdicao = document.getElementById("form-edicao-financeira");
  const vendaComItens = Boolean(registro?.venda?.itens?.length);
  formularioEdicao.classList.toggle("edicao-venda", vendaComItens);
  const camposEdicao = document.getElementById("edicao-financeira-campos");
  camposEdicao.classList.toggle("form-grid", !vendaComItens);
  document.getElementById("edicao-financeira-titulo").textContent = titulo;
  camposEdicao.innerHTML = camposHtml;
  if (vendaComItens) atualizarResumoVenda();
}

function abrir(titulo, camposHtml, registro) {
  elementoRetornoFoco = document.activeElement;
  fecharModalAdmin("modalExtrato");
  preencher(titulo, camposHtml, registro);
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

function montarEditorItensVenda(venda) {
  const itensHtml = venda.itens
    .map(
      (item, indice) => `
        <div class="edicao-item-venda" data-item-venda="${indice}">
            <div class="edicao-item-linha">
                <span class="edicao-item-arrastar" aria-hidden="true">⠿</span>
                <div class="edicao-item-produto">
                    <strong>${esc(item.nome_produto)}</strong>
                    <small>Código: ${esc(String(item.produto_id ?? "—"))}</small>
                </div>
                <div class="edicao-item-quantidade" aria-label="Quantidade">
                    <button type="button" data-quantidade-delta="-1" aria-label="Diminuir quantidade">−</button>
                    <input type="number" name="qtd-${indice}" min="0" max="100000" step="1" required
                        value="${item.quantidade}" aria-label="Quantidade de ${esc(item.nome_produto)}">
                    <button type="button" data-quantidade-delta="1" aria-label="Aumentar quantidade">+</button>
                </div>
                <label class="edicao-item-preco">
                    <span class="edicao-item-preco-rotulo" aria-hidden="true">Preço unitário (R$)</span>
                    <input type="number" name="preco-${indice}" min="0" step="0.01" required
                        value="${dinheiro(item.preco_unitario)}" aria-label="Preço unitário (R$)">
                </label>
                <strong class="edicao-item-subtotal" data-subtotal-item>${dinheiro(item.preco_total)}</strong>
                <div class="edicao-item-acoes">
                    <button type="button" class="edicao-item-editar" data-alternar-observacao aria-label="Editar observação do item" title="Editar observação">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>
                    </button>
                    <button type="button" class="edicao-item-remover" data-remover-item aria-label="Remover ${esc(item.nome_produto)}" title="Remover item">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg>
                    </button>
                </div>
            </div>
            <label class="edicao-item-observacao" data-observacao-item hidden>
                Observação do item
                <textarea name="obs-${indice}" maxlength="1000" rows="2">${esc(item.observacoes || "")}</textarea>
            </label>
        </div>`,
    )
    .join("");

  return `
        <section class="edicao-itens-venda" aria-labelledby="edicao-itens-titulo">
            <header class="edicao-itens-cabecalho">
                <div class="edicao-itens-identificacao">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/></svg>
                    <span id="edicao-itens-titulo">Itens da venda</span>
                </div>
            </header>
            <div class="edicao-itens-tabela py-2">
                <div class="edicao-itens-colunas" aria-hidden="true"><span></span><span>Produto</span><span>Quantidade</span><span>Preço unitário (R$)</span><span>Subtotal (R$)</span><span>Ações</span></div>
                ${itensHtml}
            </div>
        </section>
        <div class="edicao-venda-inferior">
            <section class="edicao-resumo-venda" aria-labelledby="edicao-resumo-titulo">
                <h4 id="edicao-resumo-titulo"><span aria-hidden="true">▤</span> Resumo da venda</h4>
                <dl><div><dt>Itens</dt><dd data-resumo-itens>0</dd></div><div><dt>Quantidade total</dt><dd data-resumo-quantidade>0</dd></div><div class="edicao-resumo-total"><dt>Total da venda</dt><dd data-resumo-total>R$ 0,00</dd></div></dl>
            </section>
            <aside class="edicao-alerta-venda" role="note">
                <h4><span aria-hidden="true">ⓘ</span> Atenção</h4>
                <p>Estoque, divisão e totais do caixa serão recalculados ao salvar as alterações.</p>
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
    total += subtotal;
    quantidadeTotal += quantidade;
    if (quantidade > 0) itensAtivos += 1;
  });
  camposEdicao.querySelector("[data-resumo-itens]").textContent = itensAtivos;
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
    '<p class="edicao-venda-carregando" role="status">Carregando dados da venda...</p>',
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
      toast(erro.message || "Resposta inválida da venda.", false);
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
    camposHtml = `<div class="edicao-venda-layout">
            <label class="edicao-venda-campo"><span class="edicao-venda-label"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></svg>Cliente</span>
                <input name="nome_cliente" maxlength="200" value="${esc(venda.nome_cliente || "")}" placeholder="Nome do cliente">
            </label>
            <label class="edicao-venda-campo"><span class="edicao-venda-label"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 10h20"/></svg>Pagamento</span>
                <select name="metodo_pagamento">${opcoesPagamento}</select>
            </label>
            <label class="edicao-venda-campo edicao-venda-observacoes"><span class="edicao-venda-label"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z"/></svg>Observações da venda</span>
                <textarea name="observacoes" maxlength="2000" rows="2" placeholder="Digite observações gerais da venda...">${esc(venda.observacoes || "")}</textarea>
                <small class="edicao-contador"><span data-contador-observacoes>${(venda.observacoes || "").length}</span>/2000</small>
            </label>
            ${montarEditorItensVenda(venda)}
        </div>`;
  } else {
    camposHtml =
      campo(
        "Cliente",
        `<input name="nome_cliente" maxlength="200" value="${esc(venda.nome_cliente || "")}">`,
      ) +
      campo(
        "Pagamento",
        `<select name="metodo_pagamento">${opcoesPagamento}</select>`,
      ) +
      campo(
        "Observações",
        `<textarea name="observacoes" maxlength="2000">${esc(venda.observacoes || "")}</textarea>`,
      ) +
      campo(
        "Valor (R$)",
        `<input type="number" name="valor_total" min="0" step="0.01" required value="${dinheiro(venda.valor_total)}">`,
      );
  }
  preencher("Editar venda", camposHtml, { url, venda, versao: venda.versao });
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
  const camposHtml =
    campo(
      "Tipo",
      `<select name="tipo"><option value="debito" ${movimento.tipo === "debito" ? "selected" : ""}>Débito</option><option value="credito" ${movimento.tipo === "credito" ? "selected" : ""}>Crédito</option></select>`,
    ) +
    campo(
      "Valor (R$)",
      `<input name="valor" type="number" min="0" step="0.01" required value="${dinheiro(movimento.valor)}">`,
    ) +
    campo(
      "Descrição",
      `<input name="descricao" maxlength="1000" value="${esc(movimento.descricao || "")}">`,
    );
  abrir("Editar movimentação", camposHtml, { url, versao: movimento.versao });
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
      observacaoItem.hidden = !observacaoItem.hidden;
      if (!observacaoItem.hidden)
        observacaoItem.querySelector("textarea").focus();
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
