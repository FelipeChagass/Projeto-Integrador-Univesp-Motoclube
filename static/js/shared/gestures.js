import { elementoVisivel } from "./dialogs.js";

export function fechamentoLegadoBloqueado(modal) {
  return (
    !modal ||
    !elementoVisivel(modal) ||
    modal.classList.contains("closing") ||
    modal.matches('[aria-busy="true"]') ||
    !!modal.querySelector('[aria-busy="true"]') ||
    [...document.querySelectorAll(".ui-dialogo, .modal.show")].some(
      elementoVisivel,
    )
  );
}

export function pedirFechamentoModal(modal) {
  if (fechamentoLegadoBloqueado(modal)) return;
  const pedido = new CustomEvent("pedido-fechar-modal", {
    bubbles: true,
    cancelable: true,
  });
  if (!modal.dispatchEvent(pedido)) return;
  // Admin ainda sem consumidor do evento: o X existente chama o ciclo e suas
  // travas (podeFechar), nunca ocultar diretamente nem simular confirmação.
  modal
    .querySelector(
      ".modal-cabecalho-fechar, .modal-drag-header button, [data-fechar-edicao]",
    )
    ?.click();
}

export function initBottomSheetGestures() {
  /* ─── Shared State ─── */
  let dragState = null;

  /* Spring curve constants */
  const SPRING_CURVE = "cubic-bezier(0.32, 0.72, 0, 1)";
  const DISMISS_THRESHOLD_RATIO = 0.35;
  const VELOCITY_DISMISS = 0.5;
  const DRAG_THRESHOLD = 10;

  /* ─── Touch Start ─── */
  document.addEventListener(
    "touchstart",
    (touchEvent) => {
      const activeTouch = touchEvent.touches[0];

      // Tocar no X (ou em outro controle) do cabeçalho não inicia o arrasto.
      const modalHeader = touchEvent.target.closest("button, a, input, select")
        ? null
        : touchEvent.target.closest(".modal-drag-header");
      if (modalHeader) {
        const modalContent = modalHeader.closest(".modal-content");
        const overlay = modalContent?.closest(".modal-overlay");
        if (overlay && !fechamentoLegadoBloqueado(overlay)) {
          dragState = {
            type: "modal",
            el: modalContent,
            overlay,
            startY: activeTouch.clientY,
            currentOffset: 0,
            activated: false,
            points: [{ y: activeTouch.clientY, t: Date.now() }],
          };
          return;
        }
      }

      // Priority 2: Cart section
      const cartSection = touchEvent.target.closest("#carrinho-section");
      if (cartSection) {
        dragState = {
          type: "cart",
          el: cartSection,
          startY: activeTouch.clientY,
          startX: activeTouch.clientX,
          currentOffset: 0,
          activated: false,
          points: [{ y: activeTouch.clientY, t: Date.now() }],
        };
        return;
      }

      // Priority 3: Sidebar panel (PDV) ou menu lateral em Offcanvas do Bootstrap (admin)
      const sidebarPanel = touchEvent.target.closest(
        ".sidebar-panel, .offcanvas.offcanvas-end.show",
      );
      if (sidebarPanel) {
        dragState = {
          type: "sidebar",
          el: sidebarPanel,
          startX: activeTouch.clientX,
          currentOffsetX: 0,
          activated: false,
        };
        return;
      }
    },
    { passive: true },
  );

  /* ─── Touch Move ─── */
  document.addEventListener(
    "touchmove",
    (touchEvent) => {
      if (!dragState) return;
      const activeTouch = touchEvent.touches[0];

      /* ── Sidebar ── */
      if (dragState.type === "sidebar") {
        const horizontalDisplacement = activeTouch.clientX - dragState.startX;
        if (!dragState.activated) {
          if (Math.abs(horizontalDisplacement) < DRAG_THRESHOLD) return;
          dragState.activated = true;
          dragState.el.style.transition = "none";
        }
        if (horizontalDisplacement > 0) {
          touchEvent.preventDefault();
          dragState.el.style.transform = `translateX(${horizontalDisplacement}px)`;
          dragState.currentOffsetX = horizontalDisplacement;
        }
        return;
      }

      /* ── Modal (header-only drag) ── */
      if (dragState.type === "modal") {
        if (fechamentoLegadoBloqueado(dragState.overlay)) {
          dragState.el.style.transform = "";
          dragState.el.style.transition = "";
          dragState = null;
          return;
        }
        const verticalDisplacement = activeTouch.clientY - dragState.startY;
        if (!dragState.activated) {
          if (Math.abs(verticalDisplacement) < DRAG_THRESHOLD) return;
          dragState.activated = true;
          dragState.el.style.transition = "none";
        }
        const verticalOffset = Math.max(0, verticalDisplacement);
        dragState.el.style.transform = `translateY(${verticalOffset}px)`;
        dragState.currentOffset = verticalOffset;
        dragState.points.push({ y: activeTouch.clientY, t: Date.now() });
        if (dragState.points.length > 6) dragState.points.shift();
        if (verticalDisplacement > 0) touchEvent.preventDefault();
        return;
      }

      /* ── Cart ── */
      if (dragState.type === "cart") {
        const verticalDisplacement = activeTouch.clientY - dragState.startY;
        const horizontalDisplacement = activeTouch.clientX - dragState.startX;
        if (!dragState.activated) {
          if (
            Math.abs(verticalDisplacement) < DRAG_THRESHOLD &&
            Math.abs(horizontalDisplacement) < DRAG_THRESHOLD
          )
            return;
          dragState.activated = true;
          dragState.el.style.transition = "none";
        }
        const isCartClosed = !dragState.el.classList.contains("mobile-aberto");

        // Swipe up — only for closed cart
        if (verticalDisplacement < 0) {
          if (isCartClosed) {
            touchEvent.preventDefault();
            dragState.el.style.transform = `translateY(max(0px, calc(100% - 64px + ${verticalDisplacement}px)))`;
            dragState.currentOffset = verticalDisplacement;
          }
          return;
        }

        // Swipe down — only when scrolled to top
        if (verticalDisplacement > 0 && dragState.el.scrollTop <= 0) {
          if (isCartClosed) return;
          touchEvent.preventDefault();
          dragState.el.style.transform = `translateY(${verticalDisplacement}px)`;
          dragState.currentOffset = verticalDisplacement;
        }
        // Track velocity
        dragState.points.push({ y: activeTouch.clientY, t: Date.now() });
        if (dragState.points.length > 6) dragState.points.shift();
      }
    },
    { passive: false },
  );

  /* ─── Touch End ─── */
  document.addEventListener("touchend", () => {
    if (!dragState) return;

    /* ── Sidebar ── */
    if (dragState.type === "sidebar") {
      dragState.el.style.transition = "";
      const fechar = dragState.currentOffsetX > 80;
      dragState.el.style.transform = "";
      if (fechar && dragState.el.classList.contains("offcanvas")) {
        // O Bootstrap anima a partir da posição do dedo, tira o backdrop e devolve o foco.
        window.bootstrap?.Offcanvas.getOrCreateInstance(dragState.el).hide();
      } else if (fechar) {
        const mobileMenu = dragState.el.closest(".sidebar-mobile");
        if (mobileMenu) mobileMenu.classList.remove("open");
        document.body.style.overflow = "";
      }
      dragState = null;
      return;
    }

    /* ── Not activated = a tap, do nothing ── */
    if (!dragState.activated) {
      dragState = null;
      return;
    }

    /* Calculate velocity from tracked points */
    function calcVelocity(trackedPoints) {
      if (trackedPoints.length < 2) return 0;
      const firstTrackedPoint = trackedPoints[0];
      const lastTrackedPoint = trackedPoints[trackedPoints.length - 1];
      const elapsedMilliseconds = lastTrackedPoint.t - firstTrackedPoint.t;
      if (elapsedMilliseconds <= 0) return 0;
      return (lastTrackedPoint.y - firstTrackedPoint.y) / elapsedMilliseconds;
    }

    /* ── Modal ── */
    if (dragState.type === "modal") {
      const {
        el: modalElement,
        overlay: modalOverlay,
        currentOffset: verticalOffset,
        points: trackedPoints,
      } = dragState;
      const velocity = calcVelocity(trackedPoints);
      const modalHeight = modalElement.offsetHeight || 400;
      const dismissThreshold = modalHeight * DISMISS_THRESHOLD_RATIO;
      modalElement.style.transform = "";
      modalElement.style.transition = "";
      if (verticalOffset > dismissThreshold || velocity > VELOCITY_DISMISS) {
        pedirFechamentoModal(modalOverlay);
      }
      dragState = null;
      return;
    }

    /* ── Cart ── */
    if (dragState.type === "cart") {
      const {
        el: cartElement,
        currentOffset: verticalOffset,
        points: trackedPoints,
      } = dragState;
      const velocity = calcVelocity(trackedPoints);

      if (verticalOffset > 100 || velocity > VELOCITY_DISMISS) {
        // Dismiss cart
        cartElement.style.transition = "";
        cartElement.classList.remove("mobile-aberto");
        cartElement.style.transform = "";
      } else if (
        verticalOffset < -50 &&
        !cartElement.classList.contains("mobile-aberto")
      ) {
        // Open cart
        cartElement.style.transition = "";
        cartElement.classList.add("mobile-aberto");
        cartElement.style.transform = "";
      } else {
        // Snap back
        cartElement.style.transition = "";
        cartElement.style.transform = "";
      }
      dragState = null;
      return;
    }

    dragState = null;
  });
}
