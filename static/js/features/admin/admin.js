/**
 * Entrada do painel: compõe gestos, eventos e carga inicial após DOMContentLoaded.
 * Regras por recurso ficam nos módulos irmãos; não adicionar CRUD nesta entrada.
 */
import { initBottomSheetGestures } from '../../shared/gestures.js';
import { mostrarSkeleton } from './ui.js';
import { carregarProdutos } from './produtos.js';
import { setupEventListeners } from './events.js';

document.addEventListener('DOMContentLoaded', () => {
    initBottomSheetGestures();
    setupEventListeners();
    mostrarSkeleton('tabelaProdutos', 8);
    carregarProdutos();

    // ── ESC fecha modal aberto ──
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const aberto = document.querySelector('.modal-overlay:not(.d-none)');
        if (aberto) {
            aberto.classList.add('closing');
            setTimeout(() => { aberto.classList.add('d-none'); aberto.classList.remove('closing'); }, 250);
        }
    });

    // ── Clique no overlay (fora do conteúdo) fecha o modal ──
    let _adminModalMouseDownOnOverlay = false;
    document.addEventListener('mousedown', (e) => {
        _adminModalMouseDownOnOverlay = e.target.classList.contains('modal-overlay');
    });

    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-overlay') && !e.target.classList.contains('d-none') && _adminModalMouseDownOnOverlay) {
            e.target.classList.add('closing');
            setTimeout(() => { e.target.classList.add('d-none'); e.target.classList.remove('closing'); }, 250);
        }
    });
});
