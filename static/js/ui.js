import { API, UIModal } from './api.js';
import { S, salvarEstadoLocal, salvarDadosLocais } from './state.js';
import { esc, sanitizeUrl, formatCurrency, LocalDB } from './utils.js';

export function showToast(msg, type) {
    const toastEl = document.getElementById('toast');
    toastEl.innerText = msg;
    toastEl.className = `show${type === 'err' ? ' toast-error' : ''}`;
    setTimeout(() => {
        toastEl.className = toastEl.className.replace('show', '').replace('toast-error', '').trim();
    }, 3000);
}

export function abrirModal(id) {
    const el = document.getElementById(id);
    if (el) {
        el.classList.remove('d-none');
        el.style.display = 'flex';
        document.body.classList.add('modal-open');
    }
}

export function fecharModal(id) {
    const el = document.getElementById(id);
    if (el) {
        el.classList.add('closing');
        setTimeout(() => {
            el.style.display = 'none';
            el.classList.remove('closing');
            
            const hasOpenModal = document.querySelectorAll('.modal-overlay:not(.d-none):not([style*="display: none"])').length > 0;
            if (!hasOpenModal) {
                document.body.classList.remove('modal-open');
            }
        }, 250);
    }
}

export function atualizarEstadoBotoes() {
    const barra = document.getElementById('barra-operador');
    const containerAbrir = document.getElementById('container-abrir-caixa');
    const btnAdmin = document.getElementById('btn-admin');
    const sidebarAdmin = document.getElementById('sidebar-btn-admin');
    const sidebarAbrir = document.getElementById('sidebar-abrir-caixa');

    if (S.operadorAtual) {
        barra.innerText = `OPERADOR: ${S.operadorAtual.toUpperCase()}`;
        if (S.caixaAberto) {
            barra.innerText += ' (CAIXA ABERTO)';
            barra.classList.add('status-aberto');
            barra.classList.remove('status-fechado');
            if (containerAbrir) containerAbrir.classList.add('d-none');
            if (sidebarAbrir) sidebarAbrir.classList.add('d-none');
        } else {
            barra.innerText += ' (CAIXA FECHADO)';
            barra.classList.add('status-fechado');
            barra.classList.remove('status-aberto');
            if (containerAbrir) containerAbrir.classList.remove('d-none');
            if (sidebarAbrir) sidebarAbrir.classList.remove('d-none');
        }
        if (S.usuarioAtual && S.usuarioAtual.perfil === 'admin') {
            if (btnAdmin) btnAdmin.classList.remove('d-none');
            if (sidebarAdmin) sidebarAdmin.classList.remove('d-none');
        } else {
            if (btnAdmin) btnAdmin.classList.add('d-none');
            if (sidebarAdmin) sidebarAdmin.classList.add('d-none');
        }
    } else {
        if (containerAbrir) containerAbrir.classList.add('d-none');
        if (sidebarAbrir) sidebarAbrir.classList.add('d-none');
        if (btnAdmin) btnAdmin.classList.add('d-none');
        if (sidebarAdmin) sidebarAdmin.classList.add('d-none');
        barra.innerText = 'SISTEMA BLOQUEADO - Clique para Entrar';
        barra.style.color = '#ccc';
        barra.style.backgroundColor = 'rgba(0,0,0,0.35)';
    }
}

export function getEstoqueBar(id) {
    const p = S.produtos.find(x => x.id == id);
    return p ? Number(p.estoque_bar) : 0;
}

export function getQtdCarrinho(id) {
    let total = 0;
    if (Array.isArray(S.carrinho)) {
        S.carrinho.forEach(item => {
            if (item.id == id) total += item.qtd;
        });
    }
    return total;
}

export function renderizarCatalogo() {
    const gridContainer = document.getElementById('grid-produtos');
    gridContainer.innerHTML = '';
    if (!S.produtos || !Array.isArray(S.produtos) || S.produtos.length === 0) {
        gridContainer.innerHTML = `
            <div style="grid-column: 1 / -1; text-align:center; padding: 40px; color:#aaa;">
                <h3>Nenhum produto encontrado.</h3>
                <p>Cadastre itens no banco de dados ou verifique a conexão.</p>
            </div>`;
        return;
    }
    const fragment = document.createDocumentFragment();
    S.produtos.forEach(produto => {
        const estoqueBarTotal = Number(produto.estoque_bar) || 0;
        const qtdNoCarrinho = getQtdCarrinho(produto.id);
        const estoqueBarDisponivel = estoqueBarTotal - qtdNoCarrinho;
        const estoqueDep = Number(produto.estoque_deposito) || 0;
        const minBar = Number(produto.estoque_min_bar) || 0;
        const minDep = Number(produto.estoque_min_deposito) || 0;
        const barZerado = estoqueBarDisponivel <= 0;
        const geralZerado = estoqueDep <= 0;
        const isLow = !barZerado && ((estoqueBarDisponivel <= minBar) || (estoqueDep <= minDep));
        const cardElement = document.createElement('div');
        cardElement.className = `card${isLow ? ' card-alerta' : ''}`;
        cardElement.dataset.produtoId = produto.id;
        cardElement.dataset.barZerado = barZerado;
        const urlImagem = sanitizeUrl(produto.url_imagem);
        const alertaHtml = isLow ? '<div class="badge-alerta">ESTOQUE BAIXO</div>' : '';
        const editHtml = S.modoGerenciaEstoque ? '<div class="badge-edit" style="display:block">EDITAR</div>' : '';
        const geralZeradoHtml = geralZerado ? '<div class="faixa-sem-geral">SEM ESTOQUE GERAL</div>' : '';
        const barZeradoHtml = (barZerado && !S.modoGerenciaEstoque)
            ? '<div class="overlay-esgotado-bar"><span class="icon-lock"></span>ACABOU<br>NO BAR</div>'
            : '';
        const precoFmt = Number(produto.preco_atual) || 0;
        cardElement.innerHTML = `
            <div class="img-container">
                ${alertaHtml}${editHtml}
                <img src="${esc(urlImagem)}" onerror="this.src='https://placehold.co/150x150/333/FFF?text=Erro'">
                ${geralZeradoHtml}${barZeradoHtml}
            </div>
            <div class="card-info">
                <div class="card-name">${esc(produto.nome)}</div>
                <div class="card-price">${formatCurrency(precoFmt)}</div>
                <div class="card-stock">
                    <span>Bar: <b>${estoqueBarDisponivel}</b></span>
                    <span>Dep: <b>${estoqueDep}</b></span>
                </div>
            </div>`;
        fragment.appendChild(cardElement);
    });
    gridContainer.appendChild(fragment);
}

export function atualizarUI() {
    const listaCarrinho = document.getElementById('carrinho-lista');
    listaCarrinho.innerHTML = '';
    let totalCarrinho = 0;
    if (Array.isArray(S.carrinho)) {
        const fragment = document.createDocumentFragment();
        S.carrinho.forEach((item, idx) => {
            totalCarrinho += Number(item.preco) * Number(item.qtd);
            const obsHtml = item.obs ? `<div class="item-obs">${esc(item.obs)}</div>` : '';
            const div = document.createElement('div');
            div.className = 'item-carrinho';
            div.innerHTML = `
                <div class="item-detalhes">
                    <div class="item-nome">${esc(item.nome)}</div>
                    ${obsHtml}
                </div>
                <div class="item-qty-controls">
                    <button class="btn-qty" data-action="decrement" data-idx="${idx}">-</button>
                    <span>${item.qtd}</span>
                    <button class="btn-qty" data-action="increment" data-idx="${idx}">+</button>
                </div>`;
            fragment.appendChild(div);
        });
        listaCarrinho.appendChild(fragment);
    }
    document.getElementById('total-display').innerText = formatCurrency(totalCarrinho);
    renderizarCatalogo();
    salvarEstadoLocal();
}

export function atualizarDados(showLoader) {
    document.getElementById('resultado-relatorio').innerHTML = '';
    if (!document.getElementById('modal-fechar-caixa').classList.contains('d-none')) fecharModal('modal-fechar-caixa');
}

export function initSwipeToClose() {
    // pendingEl: element we MIGHT drag (set on touchstart)
    // activeEl: element we ARE dragging (set only after threshold is crossed in touchmove)
    let startY = 0, currentY = 0, startX = 0, currentX = 0;
    let pendingEl = null, activeEl = null;

    document.addEventListener('touchstart', (e) => {
        const el = e.target.closest('.modal-content') || e.target.closest('#carrinho-section') || e.target.closest('.sidebar-panel');
        if (!el) return;
        // Record starting point and candidate element — do NOT modify the element yet
        pendingEl = el;
        activeEl = null;
        currentY = 0;
        currentX = 0;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        if (!pendingEl) return;

        const x = e.touches[0].clientX;
        const y = e.touches[0].clientY;
        const dx = x - startX;
        const dy = y - startY;

        // Only activate dragging once finger has moved past a minimum threshold
        const DRAG_THRESHOLD = 10;
        if (!activeEl) {
            if (Math.abs(dy) < DRAG_THRESHOLD && Math.abs(dx) < DRAG_THRESHOLD) return;
            // Threshold crossed — now officially start dragging
            activeEl = pendingEl;
            activeEl.style.transition = 'none';
            activeEl.style.animation = 'none'; // Release CSS animation lock only when actually dragging
        }

        const isSidebar = activeEl.classList.contains('sidebar-panel');
        if (isSidebar) {
            if (dx > 0) {
                e.preventDefault();
                activeEl.style.transform = `translateX(${dx}px)`;
                currentX = dx;
            }
            return;
        }

        const isCart = activeEl.id === 'carrinho-section';
        const isCartClosed = isCart && !activeEl.classList.contains('mobile-aberto');

        // Swipe up — only for closed cart
        if (dy < 0) {
            if (isCartClosed) {
                e.preventDefault();
                activeEl.style.transform = `translateY(max(0px, calc(100% - 64px + ${dy}px)))`;
                currentY = dy;
            }
            return;
        }

        // Swipe down — only when scrolled to the top of the element
        if (dy > 0 && activeEl.scrollTop <= 0) {
            if (isCartClosed) return;
            e.preventDefault();
            activeEl.style.transform = `translateY(${dy}px)`;
            currentY = dy;
        }
    }, { passive: false });

    document.addEventListener('touchend', () => {
        // If drag never activated (it was a tap), do nothing
        if (!activeEl) {
            pendingEl = null;
            return;
        }

        const isSidebar = activeEl.classList.contains('sidebar-panel');
        if (isSidebar) {
            activeEl.style.transition = '';
            activeEl.style.animation = '';
            if (currentX > 80) {
                const mobileMenu = activeEl.closest('.sidebar-mobile');
                if (mobileMenu) mobileMenu.classList.remove('open');
            }
            activeEl.style.transform = '';
            activeEl = null;
            pendingEl = null;
            currentX = 0;
            return;
        }

        if (currentY > 100) {
            // Dismiss triggered
            if (activeEl.id === 'carrinho-section') {
                activeEl.style.transition = '';
                activeEl.style.animation = '';
                activeEl.classList.remove('mobile-aberto');
                activeEl.style.transform = '';
            } else {
                const overlay = activeEl.closest('.modal-overlay');
                if (overlay) {
                    // Continue sliding off-screen from current drag position
                    activeEl.style.transition = 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)';
                    activeEl.style.transform = 'translateY(110%)';
                    const elToReset = activeEl;
                    setTimeout(() => {
                        overlay.style.display = 'none';
                        elToReset.style.transform = '';
                        elToReset.style.transition = '';
                        elToReset.style.animation = '';
                        const hasOpenModal = document.querySelectorAll('.modal-overlay:not(.d-none):not([style*="display: none"])').length > 0;
                        if (!hasOpenModal) document.body.classList.remove('modal-open');
                    }, 260);
                }
            }
        } else if (currentY < -50 && activeEl.id === 'carrinho-section' && !activeEl.classList.contains('mobile-aberto')) {
            // Open cart
            activeEl.style.transition = '';
            activeEl.style.animation = '';
            activeEl.classList.add('mobile-aberto');
            activeEl.style.transform = '';
        } else {
            // Snap back
            activeEl.style.transition = '';
            activeEl.style.animation = '';
            activeEl.style.transform = '';
        }

        activeEl = null;
        pendingEl = null;
        currentY = 0;
    });
}

export function atualizarDadosCompleto(showLoader) {
    document.getElementById('resultado-relatorio').innerHTML = '';
    document.getElementById('resultado-relatorio').classList.add('d-none');
    if (showLoader) document.getElementById('loading').style.display = 'flex';
    LocalDB.remove('motoBarProdutos');
    LocalDB.remove('motoBarMembros');
    API.invalidateCache();
    API.getDadosIniciais()
        .then(d => {
            S.produtos = (d && d.produtos) ? d.produtos : [];
            S.membros = (d && d.membros) ? d.membros : [];
            if (S.produtos.length === 0 && S.membros.length === 0) {
                showToast('ALERTA: Banco vazio ou não conectado.');
            }
            salvarDadosLocais();
            renderizarCatalogo();
            atualizarEstadoBotoes();
            if (S.logoUrl) {
                const imgPreload = document.getElementById('logo-preload');
                if (imgPreload) imgPreload.src = S.logoUrl;
            }
            if (showLoader) document.getElementById('loading').style.display = 'none';
            showToast('Dados atualizados com sucesso!');
        })
        .catch(e => {
            if (showLoader) document.getElementById('loading').style.display = 'none';
            showToast(`Erro ao atualizar: ${e.message || e}`);
        });
}
