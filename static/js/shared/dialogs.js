/** Diálogos Bootstrap: uma instância por vez, callbacks após hidden e texto seguro. */
let sequencia = 0;
const fila = [];
let dialogoAtual = null;

export function elementoVisivel(elemento) {
  if (!elemento?.isConnected) return false;
  for (let atual = elemento; atual; atual = atual.parentElement) {
    if (
      atual.hidden ||
      atual.classList.contains("d-none") ||
      atual.hasAttribute("inert")
    )
      return false;
    const estilo = window.getComputedStyle(atual);
    if (estilo.display === "none" || estilo.visibility === "hidden")
      return false;
  }
  return true;
}

export function sincronizarScrollDialogos() {
  const aberto = [
    ...document.querySelectorAll(
      ".modal-overlay, .modal.show, .offcanvas.show, .offcanvas.showing",
    ),
  ].some(elementoVisivel);
  document.body.classList.toggle("modal-open", aberto);
}

function carregarEstilos() {
  if (document.querySelector("link[data-estilos-dialogos]")) return;
  const estilos = document.createElement("link");
  estilos.rel = "stylesheet";
  estilos.href = new URL("../../css/shared/dialogs.css", import.meta.url).href;
  estilos.dataset.estilosDialogos = "";
  document.head.append(estilos);
}

function elemento(tag, classes, texto) {
  const criado = document.createElement(tag);
  criado.className = classes;
  if (texto !== undefined) criado.textContent = texto;
  return criado;
}

export function abrirDialogo(opcoes) {
  if (!window.bootstrap?.Modal)
    throw new Error(
      "Bootstrap Modal precisa estar carregado antes de abrir um diálogo.",
    );
  carregarEstilos();
  fila.push({ ...opcoes, retorno: document.activeElement });
  exibirProximo();
}

function exibirProximo() {
  if (dialogoAtual || !fila.length) return;
  const opcoes = fila.shift();
  const {
    titulo,
    mensagem,
    exigeConfirmacao,
    solicitaEntrada,
    aoConfirmar,
    aoCancelar,
  } = opcoes;
  const identificador = `ui-dialogo-${++sequencia}`;
  const modal = elemento("div", "modal ui-dialogo");
  modal.tabIndex = -1;
  modal.setAttribute("aria-labelledby", `${identificador}-titulo`);
  modal.setAttribute("aria-describedby", `${identificador}-mensagem`);
  const caixa = elemento(
    "div",
    "modal-dialog modal-dialog-centered modal-dialog-scrollable",
  );
  const conteudo = elemento("div", "modal-content");
  const cabecalho = elemento("div", "modal-header");
  const tituloElemento = elemento("h2", "modal-title fs-5", titulo);
  tituloElemento.id = `${identificador}-titulo`;
  cabecalho.append(tituloElemento);
  const corpo = elemento("div", "modal-body");
  const mensagemElemento = elemento("p", "mb-0 text-break", mensagem);
  mensagemElemento.id = `${identificador}-mensagem`;
  corpo.append(mensagemElemento);
  let entrada = null;
  if (solicitaEntrada) {
    entrada = elemento("input", "form-control mt-3");
    entrada.type = "password";
    entrada.id = "ui-prompt-input";
    entrada.autocomplete = "current-password";
    entrada.setAttribute("aria-labelledby", mensagemElemento.id);
    corpo.append(entrada);
  }
  const rodape = elemento("div", "modal-footer");
  const confirmar = elemento(
    "button",
    "btn btn-danger",
    exigeConfirmacao ? "CONFIRMAR" : "OK",
  );
  confirmar.type = "button";
  let cancelar = null;
  if (exigeConfirmacao) {
    cancelar = elemento("button", "btn btn-secondary", "CANCELAR");
    cancelar.type = "button";
    rodape.append(cancelar);
  }
  rodape.append(confirmar);
  conteudo.append(cabecalho, corpo, rodape);
  caixa.append(conteudo);
  modal.append(caixa);
  document.body.append(modal);

  let encerrando = false;
  let confirmado = false;
  let valor = null;
  const instancia = new window.bootstrap.Modal(modal, {
    backdrop: true,
    keyboard: true,
    focus: true,
  });
  dialogoAtual = { modal, instancia };

  modal.addEventListener("shown.bs.modal", () => {
    document
      .querySelectorAll(".modal-backdrop")
      .forEach((fundo) => fundo.classList.add("ui-dialogo-fundo"));
    (entrada || cancelar || confirmar).focus();
  });
  modal.addEventListener("hide.bs.modal", () => {
    encerrando = true;
    valor = entrada ? entrada.value : null;
  });
  modal.addEventListener(
    "hidden.bs.modal",
    () => {
      if (entrada) entrada.value = "";
      instancia.dispose();
      modal.remove();
      sincronizarScrollDialogos();
      if (elementoVisivel(opcoes.retorno)) opcoes.retorno.focus();
      for (const proximo of fila) {
        if (!elementoVisivel(proximo.retorno)) proximo.retorno = opcoes.retorno;
      }
      try {
        const callback = confirmado ? aoConfirmar : aoCancelar;
        callback?.(valor);
      } finally {
        dialogoAtual = null;
        exibirProximo();
      }
    },
    { once: true },
  );
  confirmar.addEventListener("click", () => {
    if (encerrando) return;
    confirmado = true;
    instancia.hide();
  });
  cancelar?.addEventListener("click", () => {
    if (!encerrando) instancia.hide();
  });
  // Não permite que Escape também alcance listeners legados das páginas.
  modal.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape") evento.stopPropagation();
  });
  instancia.show();
}

export function fecharDialogo() {
  dialogoAtual?.instancia.hide();
}
