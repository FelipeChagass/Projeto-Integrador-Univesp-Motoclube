export function initBottomSheetGestures() {
    /* ─── Shared State ─── */
    let dragState = null;

    /* Spring curve constants */
    const SPRING_CURVE = 'cubic-bezier(0.32, 0.72, 0, 1)';
    const DISMISS_THRESHOLD_RATIO = 0.35;
    const VELOCITY_DISMISS = 0.5;
    const DRAG_THRESHOLD = 10;

    /* ─── Touch Start ─── */
    document.addEventListener('touchstart', (e) => {
        const touch = e.touches[0];


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
            const offset = Math.max(0, dy);
            dragState.el.style.transform = `translateY(${offset}px)`;
            dragState.currentOffset = offset;
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
                document.body.style.overflow = '';
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
            return (last.y - first.y) / dt;
        }

        /* ── Modal ── */
        if (dragState.type === 'modal') {
            const { el, overlay, currentOffset, points } = dragState;
            const velocity = calcVelocity(points);
            const elHeight = el.offsetHeight || 400;
            const dismissThreshold = elHeight * DISMISS_THRESHOLD_RATIO;

            if (currentOffset > dismissThreshold || velocity > VELOCITY_DISMISS) {
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
