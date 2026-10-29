/**
 * Painel de cadastro do admin (templates/shared/painel.html) sobre o Offcanvas do Bootstrap.
 * A posição é só CSS (painel-lateral.css): sobe de baixo no celular e entra pela direita do
 * md em diante. Abre com título e complemento ("Editar produto - Água"), foca o primeiro
 * campo, chama o handler de envio e pede confirmação antes de descartar alterações (Esc,
 * fundo, X, Cancelar ou arrasto da alça, em shared/gestures.js).
 * Não conhece produtos, membros nem usuários.
 */
import { UIModal } from "../../shared/modals.js";

/** Estado do painel aberto: foto dos campos ao abrir, fechamento autorizado e foco de retorno. */
const estados = new WeakMap();

const offcanvas = (painel) =>
  window.bootstrap.Offcanvas.getOrCreateInstance(painel);

function fotografarCampos(painel) {
  return JSON.stringify(
    [...painel.querySelectorAll("input, select, textarea")].map((campo) =>
      campo.type === "file" ? campo.files?.length || 0 : campo.value,
    ),
  );
}

function focarPrimeiroCampo(painel) {
  const campo = [
    ...painel.querySelectorAll(
      ".offcanvas-body input:not([type=file]), .offcanvas-body select",
    ),
  ].find((elemento) => !elemento.disabled && !elemento.closest(".d-none"));
  (campo || painel).focus();
}

function configurar(painel) {
  if (painel.dataset.painelConfigurado) return;
  painel.dataset.painelConfigurado = "true";
  painel.addEventListener("shown.bs.offcanvas", () =>
    focarPrimeiroCampo(painel),
  );
  painel.addEventListener("hide.bs.offcanvas", (evento) => {
    const estado = estados.get(painel);
    if (!estado || estado.concluido) return;
    if (fotografarCampos(painel) === estado.inicial) return;
    evento.preventDefault();
    UIModal.confirm("Descartar as alterações deste formulário?", () =>
      fecharPainel(painel.id),
    );
  });
  painel.addEventListener("hidden.bs.offcanvas", () => {
    const retorno = estados.get(painel)?.retorno;
    estados.delete(painel);
    if (retorno?.isConnected) retorno.focus();
  });
  painel.querySelector("form")?.addEventListener("submit", (evento) => {
    evento.preventDefault();
    estados.get(painel)?.aoSalvar?.();
  });
}

/**
 * Abre o painel `id` já preenchido pelo chamador.
 * @param {object} opcoes titulo (texto fixo), complemento (nome do registro) e aoSalvar.
 */
export function abrirPainel(id, { titulo, complemento = "", aoSalvar } = {}) {
  const painel = document.getElementById(id);
  if (!painel) return;
  configurar(painel);
  const textoTitulo = painel.querySelector("[data-titulo-texto]");
  if (textoTitulo && titulo) textoTitulo.textContent = titulo;
  const textoComplemento = document.getElementById(`${id}-complemento`);
  if (textoComplemento) textoComplemento.textContent = complemento;
  estados.set(painel, {
    inicial: fotografarCampos(painel),
    concluido: false,
    aoSalvar,
    retorno: estados.get(painel)?.retorno || document.activeElement,
  });
  offcanvas(painel).show();
}

/** Fecha sem pedir confirmação: depois de salvar, ou quando o usuário aceitou descartar. */
export function fecharPainel(id) {
  const painel = document.getElementById(id);
  if (!painel) return;
  const estado = estados.get(painel);
  if (estado) estado.concluido = true;
  offcanvas(painel).hide();
}
