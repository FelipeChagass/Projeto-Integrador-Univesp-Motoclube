/**
 * Entrada do painel: compõe gestos, eventos e carga inicial após DOMContentLoaded.
 * Regras por recurso ficam nos módulos irmãos; não adicionar CRUD nesta entrada.
 */
import { initBottomSheetGestures } from "../../shared/gestures.js";
import { mostrarEsqueleto } from "./ui.js";
import { carregarProdutos } from "./produtos.js";
import { setupEventListeners } from "./events.js";

document.addEventListener("DOMContentLoaded", () => {
  initBottomSheetGestures();
  setupEventListeners();
  mostrarEsqueleto("tabelaProdutos");
  carregarProdutos();
});
