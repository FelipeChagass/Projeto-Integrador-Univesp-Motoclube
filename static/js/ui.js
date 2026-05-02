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
        el.classList.remove('closing');
        el.style.display = 'flex';
        document.body.classList.add('modal-open');

        // On mobile, animate the sheet in via CSS transition
        const isMobile = window.matchMedia('(max-width: 768px)').matches;
        if (isMobile) {
            const content = el.querySelector('.modal-content');
            if (content) {
                content.classList.remove('sheet-dismissing');
                // Force a reflow so transform: translateY(100%) is applied before transitioning
                void content.offsetHeight;
                el.classList.add('sheet-open');
            }
        }
    }
}

export function fecharModal(id) {
    const el = document.getElementById(id);
    if (el) {
        const isMobile = window.matchMedia('(max-width: 768px)').matches;
        const content = el.querySelector('.modal-content');

        if (isMobile && content) {
            // Animate sheet down from current position
            el.classList.remove('sheet-open');
            content.classList.add('sheet-dismissing');

            const onEnd = () => {
                content.removeEventListener('transitionend', onEnd);
                el.style.display = 'none';
                content.classList.remove('sheet-dismissing');
                content.style.transform = '';
                content.style.transition = '';

                const hasOpenModal = document.querySelectorAll('.modal-overlay:not(.d-none):not([style*="display: none"])').length > 0;
                if (!hasOpenModal) {
                    document.body.classList.remove('modal-open');
                }
            };
            content.addEventListener('transitionend', onEnd, { once: true });
            // Safety timeout in case transitionend doesn't fire
            setTimeout(onEnd, 350);
        } else {
            // Desktop: use existing closing animation
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

export function initBottomSheetGestures() {
    /* ─── Shared State ─── */
    let dragState = null;

    /* Spring curve constants */
    const SPRING_CURVE = 'cubic-bezier(0.32, 0.72, 0, 1)';
    const DISMISS_THRESHOLD_RATIO = 0.35; // 35% of element height
    const VELOCITY_DISMISS = 0.5;         // px/ms
    const DRAG_THRESHOLD = 10;            // px before we commit to a drag direction

    /* ─── Touch Start ─── */
    document.addEventListener('touchstart', (e) => {
        const touch = e.touches[0];

        // Priority 1: Modal drag-header (bottom-sheet drag)
        const header = e.target.closest('.modal-drag-header');
        if (header) {
            const content = header.closest('.modal-content');
            if (content) {
                dragState = {
                    type: 'modal',
                    el: content,
                    overlay: content.closest('.modal-overlay'),
                    startY: touch.clientY,
                    currentOffset: 0,
                    activated: false,
                    points: [{ y: touch.clientY, t: Date.now() }]
                };
                return;
            }
        }

        // Priority 2: Cart section
        const cart = e.target.closest('#carrinho-section');
        if (cart) {
            dragState = {
                type: 'cart',
                el: cart,
                startY: touch.clientY,
                startX: touch.clientX,
                currentOffset: 0,
                activated: false,
                points: [{ y: touch.clientY, t: Date.now() }]
            };
            return;
        }

        // Priority 3: Sidebar panel
        const sidebar = e.target.closest('.sidebar-panel');
        if (sidebar) {
            dragState = {
                type: 'sidebar',
                el: sidebar,
                startX: touch.clientX,
                currentOffsetX: 0,
                activated: false
            };
            return;
        }
    }, { passive: true });

    /* ─── Touch Move ─── */
    document.addEventListener('touchmove', (e) => {
        if (!dragState) return;
        const touch = e.touches[0];

        /* ── Sidebar ── */
        if (dragState.type === 'sidebar') {
            const dx = touch.clientX - dragState.startX;
            if (!dragState.activated) {
                if (Math.abs(dx) < DRAG_THRESHOLD) return;
                dragState.activated = true;
                dragState.el.style.transition = 'none';
            }
            if (dx > 0) {
                e.preventDefault();
                dragState.el.style.transform = `translateX(${dx}px)`;
                dragState.currentOffsetX = dx;
            }
            return;
        }

        /* ── Modal (header-only drag) ── */
        if (dragState.type === 'modal') {
            const dy = touch.clientY - dragState.startY;
            if (!dragState.activated) {
                if (Math.abs(dy) < DRAG_THRESHOLD) return;
                dragState.activated = true;
                dragState.el.style.transition = 'none';
            }
            // Only allow dragging downward (dy > 0)
            const offset = Math.max(0, dy);
            dragState.el.style.transform = `translateY(${offset}px)`;
            dragState.currentOffset = offset;
            // Track points for velocity calculation
            dragState.points.push({ y: touch.clientY, t: Date.now() });
            if (dragState.points.length > 6) dragState.points.shift();
            if (dy > 0) e.preventDefault();
            return;
        }

        /* ── Cart ── */
        if (dragState.type === 'cart') {
            const dy = touch.clientY - dragState.startY;
            const dx = touch.clientX - dragState.startX;
            if (!dragState.activated) {
                if (Math.abs(dy) < DRAG_THRESHOLD && Math.abs(dx) < DRAG_THRESHOLD) return;
                dragState.activated = true;
                dragState.el.style.transition = 'none';
            }
            const isCartClosed = !dragState.el.classList.contains('mobile-aberto');

            // Swipe up — only for closed cart
            if (dy < 0) {
                if (isCartClosed) {
                    e.preventDefault();
                    dragState.el.style.transform = `translateY(max(0px, calc(100% - 64px + ${dy}px)))`;
                    dragState.currentOffset = dy;
                }
                return;
            }

            // Swipe down — only when scrolled to top
            if (dy > 0 && dragState.el.scrollTop <= 0) {
                if (isCartClosed) return;
                e.preventDefault();
                dragState.el.style.transform = `translateY(${dy}px)`;
                dragState.currentOffset = dy;
            }
            // Track velocity
            dragState.points.push({ y: touch.clientY, t: Date.now() });
            if (dragState.points.length > 6) dragState.points.shift();
        }
    }, { passive: false });

    /* ─── Touch End ─── */
    document.addEventListener('touchend', () => {
        if (!dragState) return;

        /* ── Sidebar ── */
        if (dragState.type === 'sidebar') {
            dragState.el.style.transition = '';
            if (dragState.currentOffsetX > 80) {
                const mobileMenu = dragState.el.closest('.sidebar-mobile');
                if (mobileMenu) mobileMenu.classList.remove('open');
            }
            dragState.el.style.transform = '';
            dragState = null;
            return;
        }

        /* ── Not activated = a tap, do nothing ── */
        if (!dragState.activated) {
            dragState = null;
            return;
        }

        /* Calculate velocity from tracked points */
        function calcVelocity(points) {
            if (points.length < 2) return 0;
            const first = points[0];
            const last = points[points.length - 1];
            const dt = last.t - first.t;
            if (dt <= 0) return 0;
            return (last.y - first.y) / dt; // px/ms, positive = downward
        }

        /* ── Modal ── */
        if (dragState.type === 'modal') {
            const { el, overlay, currentOffset, points } = dragState;
            const velocity = calcVelocity(points);
            const elHeight = el.offsetHeight || 400;
            const dismissThreshold = elHeight * DISMISS_THRESHOLD_RATIO;

            if (currentOffset > dismissThreshold || velocity > VELOCITY_DISMISS) {
                // Dismiss — continue from current position to offscreen
                const remainingDistance = elHeight - currentOffset;
                const speed = Math.max(velocity, 0.8); // minimum speed
                const duration = Math.min(Math.max(remainingDistance / speed, 150), 350);

                el.style.transition = `transform ${duration}ms ${SPRING_CURVE}`;
                el.style.transform = 'translateY(100%)';

                const elRef = el;
                const overlayRef = overlay;
                setTimeout(() => {
                    if (overlayRef) {
                        overlayRef.style.display = 'none';
                        overlayRef.classList.remove('sheet-open');
                    }
                    elRef.style.transform = '';
                    elRef.style.transition = '';
                    const hasOpenModal = document.querySelectorAll('.modal-overlay:not(.d-none):not([style*="display: none"])').length > 0;
                    if (!hasOpenModal) document.body.classList.remove('modal-open');
                }, duration + 10);
            } else {
                // Spring back to open position
                el.style.transition = `transform 0.4s ${SPRING_CURVE}`;
                el.style.transform = 'translateY(0)';
                setTimeout(() => {
                    el.style.transition = '';
                }, 420);
            }
            dragState = null;
            return;
        }

        /* ── Cart ── */
        if (dragState.type === 'cart') {
            const { el, currentOffset, points } = dragState;
            const velocity = calcVelocity(points);

            if (currentOffset > 100 || velocity > VELOCITY_DISMISS) {
                // Dismiss cart
                el.style.transition = '';
                el.classList.remove('mobile-aberto');
                el.style.transform = '';
            } else if (currentOffset < -50 && !el.classList.contains('mobile-aberto')) {
                // Open cart
                el.style.transition = '';
                el.classList.add('mobile-aberto');
                el.style.transform = '';
            } else {
                // Snap back
                el.style.transition = '';
                el.style.transform = '';
            }
            dragState = null;
            return;
        }

        dragState = null;
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
