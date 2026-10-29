/**
 * Markup do editor financeiro (modal de edição de venda e de movimentação do extrato).
 * Só gera HTML a partir dos dados da API, sem estado nem eventos: o comportamento dos itens
 * fica em edicao-venda-itens.js e o ciclo do modal em financeiro.js.
 * Os atributos name dos campos são o contrato lido por montarPayload (financeiro.js).
 */
import { esc } from "./ui.js";

export const dinheiro = (valor) => Number(valor).toFixed(2);

export const HTML_CARREGANDO =
  '<p class="text-body-secondary m-0" role="status">Carregando dados da venda...</p>';
export const HTML_ERRO_VENDA =
  '<p role="alert">Não foi possível carregar a venda. Feche e tente novamente.</p>';

/** Ícone do Bootstrap Icons, decorativo (o texto ou aria-label do controle já nomeia a ação). */
const icone = (classe) => `<i class="bi ${classe}" aria-hidden="true"></i>`;

/** Campo do formulário genérico (movimento, venda sem itens); vai dentro de .row g-3. */
const campo = (rotulo, conteudo, largura = "col-12 col-md-6") =>
  `<label class="${largura} d-flex flex-column gap-2 mb-0"><span class="form-label mb-0">${rotulo}</span>${conteudo}</label>`;

/** Fiado e ajuste não trocam de método; as demais vendas escolhem entre os meios de pagamento. */
function opcoesPagamento(venda) {
  const metodos =
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
  return metodos
    .map(
      ([valor, nome]) =>
        `<option value="${valor}" ${venda.metodo_pagamento === valor ? "selected" : ""}>${nome}</option>`,
    )
    .join("");
}

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
                    <div class="input-group flex-nowrap edicao-item-quantidade mx-md-auto">
                        <button type="button" class="btn btn-escuro" data-quantidade-delta="-1" aria-label="Diminuir quantidade">−</button>
                        <input type="number" class="form-control text-center" name="qtd-${indice}" min="0" max="100000" step="1" required
                            value="${item.quantidade}" aria-label="Quantidade de ${nome}">
                        <button type="button" class="btn btn-escuro" data-quantidade-delta="1" aria-label="Aumentar quantidade">+</button>
                    </div>
                </td>
                <td class="d-flex flex-column gap-1 d-md-table-cell" data-label="Preço unitário (R$)">
                    <input type="number" class="form-control edicao-item-preco mx-md-auto" name="preco-${indice}" min="0" step="0.01" required
                        value="${dinheiro(item.preco_unitario)}" aria-label="Preço unitário (R$)">
                </td>
                <td class="d-flex flex-column gap-1 d-md-table-cell" data-label="Subtotal (R$)">
                    <strong class="edicao-item-subtotal" data-subtotal-item>${dinheiro(item.preco_total)}</strong>
                </td>
                <td class="sem-rotulo d-md-table-cell">
                    <div class="d-flex gap-2 justify-content-md-center">
                        <button type="button" class="btn btn-escuro p-2 flex-fill flex-md-grow-0" data-alternar-observacao aria-label="Editar observação do item" title="Editar observação">
                            ${icone("bi-pencil")}
                        </button>
                        <button type="button" class="btn btn-excluir p-2 flex-fill flex-md-grow-0" data-remover-item aria-label="Remover ${nome}" title="Remover item">
                            ${icone("bi-trash3")}
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

/** Tabela de itens, resumo (preenchido por edicao-venda-itens.js) e o aviso de recálculo. */
function htmlEditorItens(venda) {
  return `
        <div class="col-12">
            <section class="card edicao-itens-venda overflow-hidden" aria-labelledby="edicao-itens-titulo">
                <header class="card-header edicao-itens-cabecalho px-3 px-md-4 py-3">
                    <h3 class="h6 fw-bold m-0" id="edicao-itens-titulo">Itens da venda</h3>
                </header>
                <div class="table-responsive p-3 p-md-0">
                    <table class="table align-middle text-md-center mb-0 tabela-cartoes tabela-itens-venda d-block d-md-table">
                        <thead class="text-uppercase text-nowrap">
                            <tr>
                                <th scope="col">Produto</th>
                                <th scope="col">Quantidade</th>
                                <th scope="col">Preço unitário (R$)</th>
                                <th scope="col">Subtotal (R$)</th>
                                <th scope="col">Ações</th>
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

/** Venda com itens edita cliente, pagamento, observações e itens; sem itens, edita o valor. */
export function htmlCamposVenda(venda) {
  const pagamento = opcoesPagamento(venda);
  if (venda.itens?.length)
    return `<div class="row g-3">
            <div class="col-12 col-md-6">
                <label class="form-label d-flex align-items-center gap-2" for="edicao-cliente">${icone("bi-person")}Cliente</label>
                <input class="form-control py-2" id="edicao-cliente" name="nome_cliente" maxlength="200" value="${esc(venda.nome_cliente || "")}" placeholder="Nome do cliente">
            </div>
            <div class="col-12 col-md-6">
                <label class="form-label d-flex align-items-center gap-2" for="edicao-pagamento">${icone("bi-credit-card")}Pagamento</label>
                <select class="form-select py-2" id="edicao-pagamento" name="metodo_pagamento">${pagamento}</select>
            </div>
            <div class="col-12">
                <label class="form-label d-flex align-items-center gap-2" for="edicao-observacoes">${icone("bi-chat-left-text")}Observações da venda</label>
                <textarea class="form-control" id="edicao-observacoes" name="observacoes" maxlength="2000" rows="2" placeholder="Digite observações gerais da venda...">${esc(venda.observacoes || "")}</textarea>
                <div class="form-text text-end"><span data-contador-observacoes>${(venda.observacoes || "").length}</span>/2000</div>
            </div>
            ${htmlEditorItens(venda)}
        </div>`;
  return `<div class="row g-3">${
    campo(
      "Cliente",
      `<input class="form-control py-2" name="nome_cliente" maxlength="200" value="${esc(venda.nome_cliente || "")}">`,
    ) +
    campo(
      "Pagamento",
      `<select class="form-select py-2" name="metodo_pagamento">${pagamento}</select>`,
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

/** Movimentação avulsa do extrato (sem venda): tipo, valor e descrição. */
export function htmlCamposMovimento(movimento) {
  return `<div class="row g-3">${
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
}
