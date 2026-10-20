import { API } from '../../shared/api.js';
import { UIModal } from '../../shared/modals.js';
import { estadoPdv, salvarEstadoLocal, salvarDadosLocais } from './state.js';
import { esc, sanitizeUrl, formatCurrency, LocalDB } from '../../shared/utils.js';

function viewportIsMobile() {
    return typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(max-width: 768px)').matches;
}

export function showToast(mensagem, tipoMensagem) {
    const elementoNotificacao = document.getElementById('toast');
    elementoNotificacao.innerText = mensagem;
    elementoNotificacao.className = `show${tipoMensagem === 'err' ? ' toast-error' : ''}`;
    setTimeout(() => {
        elementoNotificacao.className = elementoNotificacao.className.replace('show', '').replace('toast-error', '').trim();
    }, 3000);
}

export function abrirModal(modalId) {
    const elementoModal = document.getElementById(modalId);
    if (elementoModal) {
        elementoModal.classList.remove('d-none');
        elementoModal.classList.remove('closing');
        elementoModal.style.display = 'flex';
        document.body.classList.add('modal-open');

        // On mobile, animate the sheet in via CSS transition
        const telaMovel = viewportIsMobile();
        if (telaMovel) {
            const conteudoModal = elementoModal.querySelector('.modal-content');
            if (conteudoModal) {
                conteudoModal.classList.remove('sheet-dismissing');
                // Force a reflow so transform: translateY(100%) is applied before transitioning
                void conteudoModal.offsetHeight;
                elementoModal.classList.add('sheet-open');
            }
        }
    }
}

export function fecharModal(modalId) {
    const elementoModal = document.getElementById(modalId);
    if (elementoModal) {
        const telaMovel = viewportIsMobile();
        const conteudoModal = elementoModal.querySelector('.modal-content');

        if (telaMovel && conteudoModal) {
            // Animate sheet down from current position
            elementoModal.classList.remove('sheet-open');
            conteudoModal.classList.add('sheet-dismissing');

            const aoConcluirTransicao = () => {
                conteudoModal.removeEventListener('transitionend', aoConcluirTransicao);
                elementoModal.style.display = 'none';
                conteudoModal.classList.remove('sheet-dismissing');
                conteudoModal.style.transform = '';
                conteudoModal.style.transition = '';

                const possuiModalAberto = document.querySelectorAll('.modal-overlay:not(.d-none):not([style*="display: none"])').length > 0;
                if (!possuiModalAberto) {
                    document.body.classList.remove('modal-open');
                }
            };
            conteudoModal.addEventListener('transitionend', aoConcluirTransicao, { once: true });
            // Safety timeout in case transitionend doesn't fire
            setTimeout(aoConcluirTransicao, 350);
        } else {
            // Desktop: use existing closing animation
            elementoModal.classList.add('closing');
            setTimeout(() => {
                elementoModal.style.display = 'none';
                elementoModal.classList.remove('closing');

                const possuiModalAberto = document.querySelectorAll('.modal-overlay:not(.d-none):not([style*="display: none"])').length > 0;
                if (!possuiModalAberto) {
                    document.body.classList.remove('modal-open');
                }
            }, 250);
        }
    }
}

export function atualizarEstadoBotoes() {
    const barraOperador = document.getElementById('barra-operador');
    const botaoAdministracao = document.getElementById('btn-admin');
    const botaoAdministracaoLateral = document.getElementById('sidebar-btn-admin');

    if (estadoPdv.operadorAtual) {
        barraOperador.innerText = `OPERADOR: ${estadoPdv.operadorAtual.toUpperCase()}`;
        if (estadoPdv.caixaAberto) {
            barraOperador.innerText += ' (CAIXA ABERTO)';
            barraOperador.classList.add('status-aberto');
            barraOperador.classList.remove('status-fechado');
        } else {
            barraOperador.innerText += ' (CAIXA FECHADO)';
            barraOperador.classList.add('status-fechado');
            barraOperador.classList.remove('status-aberto');
        }
        if (estadoPdv.usuarioAtual && estadoPdv.usuarioAtual.perfil === 'admin') {
            if (botaoAdministracao) botaoAdministracao.classList.remove('d-none');
            if (botaoAdministracaoLateral) botaoAdministracaoLateral.classList.remove('d-none');
        } else {
            if (botaoAdministracao) botaoAdministracao.classList.add('d-none');
            if (botaoAdministracaoLateral) botaoAdministracaoLateral.classList.add('d-none');
        }
    } else {
        if (botaoAdministracao) botaoAdministracao.classList.add('d-none');
        if (botaoAdministracaoLateral) botaoAdministracaoLateral.classList.add('d-none');
        barraOperador.innerText = 'SISTEMA BLOQUEADO - Clique para Entrar';
        barraOperador.style.color = '#ccc';
        barraOperador.style.backgroundColor = 'rgba(0,0,0,0.35)';
    }
}

export function sincronizarTextoModoEstoque() {
    const botaoEstoque = document.getElementById('btn-estoque');
    const textoBotaoEstoque = document.getElementById('btn-estoque-text');
    const textoBotaoEstoqueLateral = document.getElementById('sidebar-btn-estoque-text');
    const modoEstoqueAtivo = estadoPdv.modoGerenciaEstoque;

    if (textoBotaoEstoque) {
        textoBotaoEstoque.innerText = modoEstoqueAtivo ? 'Sair do modo estoque' : 'Estoque';
    }

    if (botaoEstoque) {
        botaoEstoque.title = modoEstoqueAtivo ? 'Sair do modo estoque' : 'Gerenciar Estoque';
    }

    if (textoBotaoEstoqueLateral) {
        textoBotaoEstoqueLateral.innerText = modoEstoqueAtivo ? 'Sair do modo estoque' : 'Gerenciar Estoque';
    }
}

export function getEstoqueBar(produtoId) {
    const produtoEncontrado = estadoPdv.produtos.find(produto => produto.id == produtoId);
    return produtoEncontrado ? Number(produtoEncontrado.estoque_bar) : 0;
}

export function getQtdCarrinho(produtoId) {
    let quantidadeTotal = 0;
    if (Array.isArray(estadoPdv.carrinho)) {
        estadoPdv.carrinho.forEach(itemCarrinho => {
            if (itemCarrinho.id == produtoId) quantidadeTotal += itemCarrinho.qtd;
        });
    }
    return quantidadeTotal;
}

export function selecionarCategoria(categoria) {
    if (!['todos', 'bebida', 'comida', 'outro'].includes(categoria)) return;
    estadoPdv.categoriaCatalogo = categoria;
    renderizarCatalogo();
}

export function renderizarCatalogo() {
    const gradeProdutos = document.getElementById('grid-produtos');
    gradeProdutos.innerHTML = '';
    document.querySelectorAll('#filtro-catalogo [data-categoria]').forEach(botaoCategoria => {
        const categoriaSelecionada = botaoCategoria.dataset.categoria === estadoPdv.categoriaCatalogo;
        botaoCategoria.classList.toggle('active', categoriaSelecionada);
        botaoCategoria.setAttribute('aria-pressed', String(categoriaSelecionada));
    });
    if (!estadoPdv.produtos || !Array.isArray(estadoPdv.produtos) || estadoPdv.produtos.length === 0) {
        gradeProdutos.innerHTML = `
            <div style="grid-column: 1 / -1; text-align:center; padding: 40px; color:var(--text-secondary);">
                <h3>Nenhum produto encontrado.</h3>
                <p>Cadastre itens no banco de dados ou verifique a conexão.</p>
            </div>`;
        return;
    }
    const produtosFiltrados = estadoPdv.produtos.filter(produto => {
        const categoria = String(produto.categoria || '').trim().toLowerCase();
        if (estadoPdv.categoriaCatalogo === 'todos') return true;
        if (estadoPdv.categoriaCatalogo === 'outro') return !['bebida', 'comida'].includes(categoria);
        return categoria === estadoPdv.categoriaCatalogo;
    });
    if (!produtosFiltrados.length) {
        gradeProdutos.innerHTML = '<p class="catalogo-vazio">Nenhum produto nesta categoria.</p>';
        return;
    }
    const fragmentoProdutos = document.createDocumentFragment();
    produtosFiltrados.forEach(produto => {
        const estoqueBarTotal = Number(produto.estoque_bar) || 0;
        const quantidadeNoCarrinho = getQtdCarrinho(produto.id);
        const estoqueBarDisponivel = estoqueBarTotal - quantidadeNoCarrinho;
        const estoqueDeposito = Number(produto.estoque_deposito) || 0;
        const estoqueMinimoBar = Number(produto.estoque_min_bar) || 0;
        const estoqueMinimoDeposito = Number(produto.estoque_min_deposito) || 0;
        const estoqueBarZerado = estoqueBarDisponivel <= 0;
        const estoqueDepositoZerado = estoqueDeposito <= 0;
        const estoqueBaixo = !estoqueBarZerado && ((estoqueBarDisponivel <= estoqueMinimoBar) || (estoqueDeposito <= estoqueMinimoDeposito));
        const cartaoProduto = document.createElement('div');
        cartaoProduto.className = `card${estoqueBaixo ? ' card-alerta' : ''}`;
        cartaoProduto.dataset.produtoId = produto.id;
        cartaoProduto.dataset.barZerado = estoqueBarZerado;
        const urlImagem = sanitizeUrl(produto.url_imagem);
        const alertaHtml = estoqueBaixo ? '<div class="badge-alerta">ESTOQUE BAIXO</div>' : '';
        const edicaoHtml = estadoPdv.modoGerenciaEstoque ? '<div class="badge-edit" style="display:block">EDITAR</div>' : '';
        const depositoZeradoHtml = estoqueDepositoZerado ? '<div class="faixa-sem-geral">SEM ESTOQUE GERAL</div>' : '';
        const barZeradoHtml = (estoqueBarZerado && !estadoPdv.modoGerenciaEstoque)
            ? '<div class="overlay-esgotado-bar"><span class="icon-lock"></span>ACABOU<br>NO BAR</div>'
            : '';
        const precoAtual = Number(produto.preco_atual) || 0;
        cartaoProduto.innerHTML = `
            <div class="img-container">
                ${alertaHtml}${edicaoHtml}
                <img src="${esc(urlImagem)}" onerror="this.src='https://placehold.co/150x150/333/FFF?text=Erro'">
                ${depositoZeradoHtml}${barZeradoHtml}
            </div>
            <div class="card-info d-flex flex-column justify-content-between text-center">
                <div class="card-name">${esc(produto.nome)}</div>
                <div class="card-price">${formatCurrency(precoAtual)}</div>
                <div class="card-stock">
                    <span>Bar: <b>${estoqueBarDisponivel}</b></span>
                    <span>Dep: <b>${estoqueDeposito}</b></span>
                </div>
            </div>`;
        fragmentoProdutos.appendChild(cartaoProduto);
    });
    gradeProdutos.appendChild(fragmentoProdutos);
}

export function atualizarUI() {
    const listaCarrinho = document.getElementById('carrinho-lista');
    listaCarrinho.innerHTML = '';
    let totalCarrinho = 0;
    if (Array.isArray(estadoPdv.carrinho)) {
        const fragmentoCarrinho = document.createDocumentFragment();
        estadoPdv.carrinho.forEach((itemCarrinho, indiceItem) => {
            totalCarrinho += Number(itemCarrinho.preco) * Number(itemCarrinho.qtd);
            const observacaoHtml = itemCarrinho.obs ? `<div class="item-obs">${esc(itemCarrinho.obs)}</div>` : '';
            const elementoItemCarrinho = document.createElement('div');
            elementoItemCarrinho.className = 'item-carrinho';
            elementoItemCarrinho.innerHTML = `
                <div class="item-detalhes">
                    <div class="item-nome">${esc(itemCarrinho.nome)}</div>
                    ${observacaoHtml}
                </div>
                <div class="item-qty-controls">
                    <button class="btn-qty" data-action="decrement" data-idx="${indiceItem}">-</button>
                    <span>${itemCarrinho.qtd}</span>
                    <button class="btn-qty" data-action="increment" data-idx="${indiceItem}">+</button>
                </div>`;
            fragmentoCarrinho.appendChild(elementoItemCarrinho);
        });
        listaCarrinho.appendChild(fragmentoCarrinho);
    }
    document.getElementById('total-display').innerText = formatCurrency(totalCarrinho);
    sincronizarTextoModoEstoque();
    renderizarCatalogo();
    salvarEstadoLocal();
}

export { initBottomSheetGestures } from '../../shared/gestures.js';


