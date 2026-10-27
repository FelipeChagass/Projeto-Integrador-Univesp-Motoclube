import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { UIModal } from "../static/js/shared/modals.js";

// Bootstrap chega por CDN no navegador, não por npm. Este adaptador reproduz
// somente o contrato público usado pelo serviço: eventos canceláveis e hide/show.
class ModalBootstrap {
  constructor(elemento, opcoes) {
    this.elemento = elemento;
    this.opcoes = opcoes;
    this.teclado = (evento) => {
      if (evento.key === "Escape" && opcoes.keyboard) this.hide();
    };
    elemento.addEventListener("keydown", this.teclado);
  }
  show() {
    this.fundo = document.createElement("div");
    this.fundo.className = "modal-backdrop show";
    document.body.append(this.fundo);
    this.elemento.classList.add("show");
    this.elemento.setAttribute("role", "dialog");
    this.elemento.setAttribute("aria-modal", "true");
    document.body.classList.add("modal-open");
    this.elemento.dispatchEvent(new Event("shown.bs.modal"));
  }
  hide() {
    if (!this.elemento.classList.contains("show")) return;
    if (
      !this.elemento.dispatchEvent(
        new Event("hide.bs.modal", { cancelable: true }),
      )
    )
      return;
    this.elemento.classList.remove("show");
    this.fundo.remove();
    document.body.classList.remove("modal-open");
    this.elemento.dispatchEvent(new Event("hidden.bs.modal"));
  }
  dispose() {
    this.elemento.removeEventListener("keydown", this.teclado);
  }
}

const botao = (texto) =>
  [...document.querySelectorAll("button")].find(
    (item) => item.textContent === texto,
  );
beforeEach(() => {
  document.body.className = "";
  document.body.innerHTML = '<button id="origem">Abrir</button>';
  document.getElementById("origem").focus();
  window.bootstrap = { Modal: ModalBootstrap };
});
afterEach(() => {
  document.body.innerHTML = "";
  delete window.bootstrap;
});

test("alert cria Modal Bootstrap nomeado com texto seguro, foco e descarte", () => {
  const confirmar = jest.fn();
  UIModal.alert('<img src=x onerror="alert(1)">', confirmar);
  const modal = document.querySelector('.modal.show[role="dialog"]');
  expect(modal).not.toBeNull();
  expect(
    document.getElementById(modal.getAttribute("aria-labelledby")).textContent,
  ).toBe("ALERTA");
  expect(
    document.getElementById(modal.getAttribute("aria-describedby")).textContent,
  ).toBe('<img src=x onerror="alert(1)">');
  expect(modal.querySelector("img")).toBeNull();
  expect(document.activeElement).toBe(botao("OK"));
  botao("OK").click();
  expect(confirmar).toHaveBeenCalledWith(null);
  expect(document.querySelector(".modal, .modal-backdrop")).toBeNull();
  expect(document.activeElement.id).toBe("origem");
});

test("prompt preserva senha, espaços, cancelamento e foco inicial", () => {
  const cancelar = jest.fn();
  UIModal.prompt("Senha do administrador", jest.fn(), cancelar);
  const entrada = document.getElementById("ui-prompt-input");
  expect(entrada.type).toBe("password");
  expect(document.activeElement).toBe(entrada);
  entrada.value = "  segredo  ";
  botao("CANCELAR").click();
  expect(cancelar).toHaveBeenCalledWith("  segredo  ");
  expect(entrada.value).toBe("");
  expect(document.activeElement.id).toBe("origem");
});

test("Escape cancela confirmação uma única vez", () => {
  const confirmar = jest.fn();
  const cancelar = jest.fn();
  UIModal.confirm("Prosseguir?", confirmar, cancelar);
  document.activeElement.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  expect(cancelar).toHaveBeenCalledTimes(1);
  expect(cancelar).toHaveBeenCalledWith(null);
  expect(confirmar).not.toHaveBeenCalled();
  expect(document.querySelector(".modal-backdrop")).toBeNull();
});

test("confirmação duplicada não repete callback e mantém overlay de origem bloqueado", () => {
  document.body.insertAdjacentHTML(
    "beforeend",
    '<div class="modal-overlay"><button id="interior">Ação</button></div>',
  );
  document.getElementById("interior").focus();
  const confirmar = jest.fn();
  UIModal.confirm("Prosseguir?", confirmar);
  const confirmarBotao = botao("CONFIRMAR");
  confirmarBotao.click();
  confirmarBotao.click();
  expect(confirmar).toHaveBeenCalledTimes(1);
  expect(document.body.classList.contains("modal-open")).toBe(true);
  expect(document.activeElement.id).toBe("interior");
});

test("diálogos solicitados em sequência não empilham instâncias Bootstrap", () => {
  UIModal.alert("Primeiro");
  UIModal.prompt("Segundo", jest.fn());
  expect(document.querySelectorAll(".modal.show")).toHaveLength(1);
  expect(document.querySelectorAll(".modal-backdrop")).toHaveLength(1);
  expect(document.querySelector(".modal.show").textContent).toContain(
    "Primeiro",
  );
  botao("OK").click();
  expect(document.querySelectorAll(".modal.show")).toHaveLength(1);
  expect(document.querySelector(".modal.show").textContent).toContain(
    "Segundo",
  );
  botao("CANCELAR").click();
  expect(document.activeElement.id).toBe("origem");
  expect(document.body.classList.contains("modal-open")).toBe(false);
});
