import { API } from '../../shared/api.js';
import { UIModal } from '../../shared/modals.js';
import { S, salvarEstadoLocal, salvarDadosLocais } from './state.js';
import { esc, sanitizeUrl, formatCurrency, LocalDB } from '../../shared/utils.js';

function viewportIsMobile() {
    return typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(max-width: 768px)').matches;
}

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
        const isMobile = viewportIsMobile();
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
        const isMobile = viewportIsMobile();
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
    const btnAdmin = document.getElementById('btn-admin');
    const sidebarAdmin = document.getElementById('sidebar-btn-admin');

    if (S.operadorAtual) {
        barra.innerText = `OPERADOR: ${S.operadorAtual.toUpperCase()}`;
        if (S.caixaAberto) {
            barra.innerText += ' (CAIXA ABERTO)';
            barra.classList.add('status-aberto');
            barra.classList.remove('status-fechado');
        } else {
            barra.innerText += ' (CAIXA FECHADO)';
            barra.classList.add('status-fechado');
            barra.classList.remove('status-aberto');
        }
        if (S.usuarioAtual && S.usuarioAtual.perfil === 'admin') {
            if (btnAdmin) btnAdmin.classList.remove('d-none');
            if (sidebarAdmin) sidebarAdmin.classList.remove('d-none');
        } else {
            if (btnAdmin) btnAdmin.classList.add('d-none');
            if (sidebarAdmin) sidebarAdmin.classList.add('d-none');
        }
    } else {
        if (btnAdmin) btnAdmin.classList.add('d-none');
        if (sidebarAdmin) sidebarAdmin.classList.add('d-none');
        barra.innerText = 'SISTEMA BLOQUEADO - Clique para Entrar';
        barra.style.color = '#ccc';
        barra.style.backgroundColor = 'rgba(0,0,0,0.35)';
    }
}

export function sincronizarTextoModoEstoque() {
    const btnEstoque = document.getElementById('btn-estoque');
    const btnEstoqueText = document.getElementById('btn-estoque-text');
    const sidebarEstoqueText = document.getElementById('sidebar-btn-estoque-text');
    const modoAtivo = S.modoGerenciaEstoque;

    if (btnEstoqueText) {
        btnEstoqueText.innerText = modoAtivo ? 'Sair do modo estoque' : 'Estoque';
    }

    if (btnEstoque) {
        btnEstoque.title = modoAtivo ? 'Sair do modo estoque' : 'Gerenciar Estoque';
    }

    if (sidebarEstoqueText) {
        sidebarEstoqueText.innerText = modoAtivo ? 'Sair do modo estoque' : 'Gerenciar Estoque';
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

export function selecionarCategoria(categoria) {
    if (!['todos', 'bebida', 'comida', 'outro'].includes(categoria)) return;
    S.categoriaCatalogo = categoria;
    renderizarCatalogo();
}

export function renderizarCatalogo() {
    const gridContainer = document.getElementById('grid-produtos');
    gridContainer.innerHTML = '';
    document.querySelectorAll('#filtro-catalogo [data-categoria]').forEach(btn => {
        const ativo = btn.dataset.categoria === S.categoriaCatalogo;
        btn.classList.toggle('active', ativo);
        btn.setAttribute('aria-pressed', String(ativo));
    });
    if (!S.produtos || !Array.isArray(S.produtos) || S.produtos.length === 0) {
        gridContainer.innerHTML = `
            <div style="grid-column: 1 / -1; text-align:center; padding: 40px; color:#aaa;">
                <h3>Nenhum produto encontrado.</h3>
                <p>Cadastre itens no banco de dados ou verifique a conexão.</p>
            </div>`;
        return;
    }
    const produtos = S.produtos.filter(produto => {
        const categoria = String(produto.categoria || '').trim().toLowerCase();
        if (S.categoriaCatalogo === 'todos') return true;
        if (S.categoriaCatalogo === 'outro') return !['bebida', 'comida'].includes(categoria);
        return categoria === S.categoriaCatalogo;
    });
    if (!produtos.length) {
        gridContainer.innerHTML = '<p class="catalogo-vazio">Nenhum produto nesta categoria.</p>';
        return;
    }
    const fragment = document.createDocumentFragment();
    produtos.forEach(produto => {
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
            <div class="card-info d-flex flex-column justify-content-between text-center">
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
    sincronizarTextoModoEstoque();
    renderizarCatalogo();
    salvarEstadoLocal();
}

export { initBottomSheetGestures } from '../../shared/gestures.js';


