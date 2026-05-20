import { API, UIModal } from './api.js';
import { S, carregarDadosLocais, salvarDadosLocais } from './state.js';
import { showToast, fecharModal, atualizarUI, renderizarCatalogo, atualizarEstadoBotoes, initBottomSheetGestures } from './ui.js';
import {
    adicionarAoCarrinho, incrementarQtd, decrementarQtd, confirmarObs, cliqueProduto,
    alternarModoEstoque, confirmarSenhaEstoque, salvarEdicaoEstoque,
    iniciarPagamento, iniciarLiquidacao, calcularTroco, finalizarPagamentoDinheiro, finalizarPagamentoCartao,
    verificarDividaSelecionada, abrirModalMembros, confirmarSelecaoMembro, fecharModalSelecaoMembro,
    trocarMembro, abrirModalAberturaCaixa, confirmarAberturaValor, abrirConfig, salvarConfig,
    processarFilaVendas, sincronizarProdutosBackground
} from './actions.js';
import {
    abrirMenuRelatorios, gerarRelatorio, gerarRelatorioPeriodo,
    confirmarFechamentoCaixa, executarFechamentoCaixa
} from './reports.js';

/* ─── Helpers ─── */

function closeSidebar() {
    document.getElementById('sidebar-mobile').classList.remove('open');
}

function realizarLogout() {
    UIModal.confirm('Tem certeza que deseja sair?', () => {
        document.getElementById('loading').style.display = 'flex';
        API.logout()
            .then(() => window.location.replace('/login'))
            .catch(() => window.location.replace('/login'));
    });
}

/* ─── Global Listeners ─── */

document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const abertos = document.querySelectorAll('.modal-overlay');
    for (let i = 0; i < abertos.length; i++) {
        const d = abertos[i].style.display;
        if (d && d !== 'none') {
            fecharModal(abertos[i].id);
            break;
        }
    }
});

let _modalMouseDownOnOverlay = false;
document.addEventListener('mousedown', (e) => {
    _modalMouseDownOnOverlay = e.target.classList.contains('modal-overlay');
});

document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay') && _modalMouseDownOnOverlay) {
        fecharModal(e.target.id);
    }
});

/* ─── Header ─── */

document.getElementById('btn-estoque').addEventListener('click', alternarModoEstoque);
document.getElementById('btn-gestao').addEventListener('click', abrirMenuRelatorios);
document.getElementById('btn-admin').addEventListener('click', () => { window.location.href = '/admin'; });
document.getElementById('btn-config').addEventListener('click', abrirConfig);
document.getElementById('btn-logout').addEventListener('click', realizarLogout);

/* ─── Mobile Sidebar ─── */

document.getElementById('btn-hamburger').addEventListener('click', () => {
    document.getElementById('sidebar-mobile').classList.add('open');
});
document.querySelector('.sidebar-backdrop').addEventListener('click', closeSidebar);
document.getElementById('sidebar-close-btn').addEventListener('click', closeSidebar);

document.getElementById('sidebar-btn-estoque').addEventListener('click', () => { closeSidebar(); alternarModoEstoque(); });
document.getElementById('sidebar-gestao').addEventListener('click', () => { closeSidebar(); abrirMenuRelatorios(); });
document.getElementById('sidebar-btn-admin').addEventListener('click', () => { window.location.href = '/admin'; });
document.getElementById('sidebar-config').addEventListener('click', () => { closeSidebar(); abrirConfig(); });

document.getElementById('sidebar-logout').addEventListener('click', () => { closeSidebar(); realizarLogout(); });

/* ─── Payment Buttons ─── */

document.getElementById('btn-pag-dinheiro').addEventListener('click', () => iniciarPagamento('DINHEIRO'));
document.getElementById('btn-pag-pix').addEventListener('click', () => iniciarPagamento('PIX'));
document.getElementById('btn-pag-cartao').addEventListener('click', () => iniciarPagamento('CARTAO'));
document.getElementById('btn-pag-fiado').addEventListener('click', () => abrirModalMembros('FIADO'));
document.getElementById('btn-fechar-conta').addEventListener('click', () => abrirModalMembros('FECHAR_CONTA'));

/* ─── Modal: Abertura Caixa ─── */

document.getElementById('btn-confirmar-abertura').addEventListener('click', confirmarAberturaValor);
document.getElementById('btn-cancelar-abertura').addEventListener('click', () => fecharModal('modal-abertura-caixa'));

/* ─── Modal: Senha Estoque ─── */

document.getElementById('input-senha-estoque').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmarSenhaEstoque();
});
document.getElementById('btn-confirmar-senha-estoque').addEventListener('click', confirmarSenhaEstoque);
document.getElementById('btn-cancelar-senha-estoque').addEventListener('click', () => fecharModal('modal-senha-estoque'));

/* ─── Modal: Observação ─── */

document.getElementById('btn-confirmar-obs').addEventListener('click', confirmarObs);
document.getElementById('btn-cancelar-obs').addEventListener('click', () => fecharModal('modal-obs'));

/* ─── Modal: Dinheiro ─── */

document.getElementById('valor-recebido').addEventListener('input', calcularTroco);
document.getElementById('btn-confirmar-dinheiro').addEventListener('click', finalizarPagamentoDinheiro);
document.getElementById('btn-cancelar-dinheiro').addEventListener('click', () => fecharModal('modal-dinheiro'));

/* ─── Modal: Cartão ─── */

document.getElementById('btn-cartao-debito').addEventListener('click', () => finalizarPagamentoCartao('DÉBITO'));
document.getElementById('btn-cartao-credito').addEventListener('click', () => finalizarPagamentoCartao('CRÉDITO'));
document.getElementById('btn-cancelar-cartao').addEventListener('click', () => fecharModal('modal-cartao'));

/* ─── Modal: Estoque ─── */

document.getElementById('btn-salvar-estoque').addEventListener('click', salvarEdicaoEstoque);
document.getElementById('btn-cancelar-estoque').addEventListener('click', () => fecharModal('modal-estoque'));

/* ─── Modal: Selecionar Membro ─── */

document.getElementById('select-membro').addEventListener('change', verificarDividaSelecionada);
document.getElementById('btn-confirmar-membro').addEventListener('click', confirmarSelecaoMembro);
document.getElementById('btn-cancelar-membro').addEventListener('click', fecharModalSelecaoMembro);

/* ─── Modal: Fechar Conta ─── */

document.getElementById('btn-liq-dinheiro').addEventListener('click', () => iniciarLiquidacao('DINHEIRO'));
document.getElementById('btn-liq-pix').addEventListener('click', () => iniciarLiquidacao('PIX'));
document.getElementById('btn-liq-cartao').addEventListener('click', () => iniciarLiquidacao('CARTAO'));
document.getElementById('btn-cancelar-fechar-conta').addEventListener('click', () => fecharModal('modal-fechar-conta'));

/* ─── Modal: Relatórios ─── */

document.getElementById('btn-trocar-membro').addEventListener('click', trocarMembro);
document.getElementById('btn-abrir-caixa-rel').addEventListener('click', abrirModalAberturaCaixa);
document.getElementById('btn-fechar-dia').addEventListener('click', () => gerarRelatorio('DIA'));
document.getElementById('btn-gerar-periodo').addEventListener('click', gerarRelatorioPeriodo);
document.getElementById('btn-fechar-relatorios').addEventListener('click', () => fecharModal('modal-relatorios'));

/* ─── Modal: Fechar Caixa ─── */

document.getElementById('btn-confirmar-fechamento-caixa').addEventListener('click', executarFechamentoCaixa);
document.getElementById('btn-cancelar-fechamento-caixa').addEventListener('click', () => fecharModal('modal-fechar-caixa'));

/* ─── Modal: Config ─── */

document.getElementById('btn-salvar-config').addEventListener('click', salvarConfig);
document.getElementById('btn-cancelar-config').addEventListener('click', () => fecharModal('modal-config'));

/* ─── Event Delegation ─── */

document.getElementById('carrinho-lista').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const idx = parseInt(btn.dataset.idx, 10);
    if (btn.dataset.action === 'increment') incrementarQtd(idx);
    else if (btn.dataset.action === 'decrement') decrementarQtd(idx);
});

document.getElementById('grid-produtos').addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;
    const produtoId = card.dataset.produtoId;
    const barZerado = card.dataset.barZerado === 'true';
    const produto = S.produtos.find(p => p.id == produtoId);
    if (produto) cliqueProduto(produto, barZerado);
});

/* ─── Mobile Cart Badge ─── */

(function initMobileCart() {
    const lista = document.getElementById('carrinho-lista');
    const badge = document.getElementById('carrinho-badge-mobile');
    const section = document.getElementById('carrinho-section');
    const toggleBtn = document.querySelector('.carrinho-header');
    if (!lista || !badge || !section || !toggleBtn) return;

    function atualizarBadge() {
        let qtd = 0;
        try {
            if (Array.isArray(S.carrinho)) {
                for (let i = 0; i < S.carrinho.length; i++) {
                    qtd += Number(S.carrinho[i].qtd) || 0;
                }
            } else {
                qtd = lista.querySelectorAll('.item-carrinho').length;
            }
        } catch (e) { qtd = 0; }
        badge.textContent = qtd;
        if (qtd > 0) {
            badge.classList.add('show');
            badge.style.display = '';
        } else {
            badge.classList.remove('show');
            badge.style.display = '';
        }
    }

    const observer = new MutationObserver(atualizarBadge);
    observer.observe(lista, { childList: true, subtree: true });
    atualizarBadge();

    toggleBtn.addEventListener('click', () => {
        section.classList.toggle('mobile-aberto');
    });
})();

/* ─── Initialization ─── */

function iniciarSistema() {
    try {
        carregarDadosLocais();
        atualizarUI();
        if (S.operadorAtual) atualizarEstadoBotoes();
        if (S.logoUrl) { const imgP = new Image(); imgP.src = S.logoUrl; }
    } catch (e) { console.error('Erro init local', e); }

    const loadingEl = document.getElementById('loading');
    API._initSupabase()
        .then(client => {
            if (!client) { window.location.href = '/login'; return null; }
            return Promise.all([API.getMe(), API.getDadosIniciais(), API.getCaixaAberto(S.caixaId)]);
        })
        .then(results => {
            if (!results) return;
            const [resMe, dados, caixaRes] = results;
            if (!resMe || resMe.status !== 'ok' || !resMe.usuario) {
                window.location.href = '/login';
                return;
            }
            S.usuarioAtual = resMe.usuario;
            S.operadorAtual = resMe.usuario.nome;
            S.produtos = (dados && Array.isArray(dados.produtos)) ? dados.produtos : [];
            S.membros = (dados && Array.isArray(dados.membros)) ? dados.membros : [];
            if (dados && dados.logoUrl) S.logoUrl = dados.logoUrl;

            if (caixaRes && caixaRes.status === 'ok' && caixaRes.caixa) {
                S.caixaAberto = true;
                S.caixaId = caixaRes.caixa.id || null;
                S.valorAbertura = Number(caixaRes.caixa.valor_abertura) || 0;
            } else {
                S.caixaAberto = false;
                S.caixaId = null;
                S.valorAbertura = 0;
            }

            salvarDadosLocais();
            renderizarCatalogo();
            atualizarEstadoBotoes();
            processarFilaVendas();
            if (loadingEl) loadingEl.style.display = 'none';
        })
        .catch(err => {
            console.error('Falha na inicialização:', err);
            if (loadingEl) loadingEl.style.display = 'none';
            if (S.operadorAtual) {
                renderizarCatalogo();
                atualizarEstadoBotoes();
                processarFilaVendas();
                showToast('Servidor offline. Usando dados locais.');
            } else {
                window.location.href = '/login';
            }
        });

    setInterval(processarFilaVendas, 10000);
    setInterval(sincronizarProdutosBackground, 60000);
}

iniciarSistema();
initBottomSheetGestures();
