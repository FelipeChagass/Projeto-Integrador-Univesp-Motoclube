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
    document.addEventListener('keydown', (eventoTeclado) => {
        if (eventoTeclado.key !== 'Escape') return;
        const modalAberto = document.querySelector('.modal-overlay:not(.d-none)');
        if (modalAberto) {
            modalAberto.classList.add('closing');
            setTimeout(() => { modalAberto.classList.add('d-none'); modalAberto.classList.remove('closing'); }, 250);
        }
    });

    // ── Clique no overlay (fora do conteúdo) fecha o modal ──
    let cliqueIniciadoNaSobreposicao = false;
    document.addEventListener('mousedown', (eventoMouse) => {
        cliqueIniciadoNaSobreposicao = eventoMouse.target.classList.contains('modal-overlay');
    });

    document.addEventListener('click', (eventoClique) => {
        if (eventoClique.target.classList.contains('modal-overlay') && !eventoClique.target.classList.contains('d-none') && cliqueIniciadoNaSobreposicao) {
            eventoClique.target.classList.add('closing');
            setTimeout(() => { eventoClique.target.classList.add('d-none'); eventoClique.target.classList.remove('closing'); }, 250);
        }
    });
});
