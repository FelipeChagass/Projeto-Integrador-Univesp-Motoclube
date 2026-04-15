var LocalDB = {
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { console.warn("Storage Bloqueado"); } },
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    remove: function (k) { try { localStorage.removeItem(k); } catch (e) { } }
};

var logoUrl = "/static/img/motorhead.png";

var produtos = [], membros = [], carrinho = [], filaVendas = [];
var produtoPendente = null, produtoEdicao = null;
var config = { imprimir: true, largura: 'ticket-80mm', logo: logoUrl };
var dadosFechamentoAtual = null, dadosRelatorioAtual = null;
var contextoMembro = '';
var modoGerenciaEstoque = false;
var estoqueOriginalBar = 0;
var operadorAtual = "";
var usuarioAtual = null;
var inicioTurno = null;
var pagamentoPendente = { tipo: '', valorTotal: 0, dados: null };
var caixaAberto = false;
var caixaId = null;
var valorAbertura = 0;
var tipoRelatorioAtual = "";
var enviandoVenda = false;
var processandoFila = false;
var lastProcessTime = 0;

/* =============================================
   UTILITÁRIOS
   ============================================= */
function showToast(msg, type) {
    var toastEl = document.getElementById("toast");
    toastEl.innerText = msg;
    toastEl.className = "show" + (type === 'err' ? ' toast-error' : '');
    setTimeout(function () { toastEl.className = toastEl.className.replace("show", "").replace("toast-error", "").trim(); }, 3000);
}

// function resetarTravaFila removida

function fecharModal(id) { document.getElementById(id).style.display = 'none'; }

function converterLinkDrive(url) {
    if (!url || typeof url !== 'string') return "";
    var matchPath = url.match(new RegExp("\\/d\\/(.+?)\\/"));
    if (matchPath && matchPath[1]) return "https://drive.google.com/uc?export=view&id=" + matchPath[1];
    var matchId = url.match(new RegExp("id=([a-zA-Z0-9_-]+)"));
    if (matchId && matchId[1]) return "https://drive.google.com/uc?export=view&id=" + matchId[1];
    return url;
}

/* =============================================
   PERSISTÊNCIA LOCAL
   ============================================= */
function salvarEstadoLocal() { LocalDB.set('motoBarCarrinho', JSON.stringify(carrinho)); }

function salvarDadosLocais() {
    LocalDB.set('motoBarProdutos', JSON.stringify(produtos));
    LocalDB.set('motoBarMembros', JSON.stringify(membros));
    // LocalDB.set('motoBarLogo', logoUrl);
    LocalDB.set('motoBarOperador', operadorAtual);
    LocalDB.set('motoBarInicio', inicioTurno ? inicioTurno.toString() : "");
    LocalDB.set('motoBarCarrinho', JSON.stringify(carrinho));
    LocalDB.set('motoBarFila', JSON.stringify(filaVendas));
    LocalDB.set('motoBarConfig', JSON.stringify(config));
    LocalDB.set('motoBarCaixaAberto', caixaAberto);
    LocalDB.set('motoBarValorAbertura', valorAbertura);
    if (caixaId) LocalDB.set('motoBarCaixaId', caixaId);
}

function carregarDadosLocais() {
    try {
        var produtosJson = LocalDB.get('motoBarProdutos'); if (produtosJson) { produtos = JSON.parse(produtosJson); if (!Array.isArray(produtos)) produtos = []; }
        var membrosJson = LocalDB.get('motoBarMembros'); if (membrosJson) { membros = JSON.parse(membrosJson); if (!Array.isArray(membros)) membros = []; }
        // var l = LocalDB.get('motoBarLogo'); if (l) logoUrl = l;
        var operadorSalvo = LocalDB.get('motoBarOperador'); if (operadorSalvo) operadorAtual = operadorSalvo;
        var inicioSalvo = LocalDB.get('motoBarInicio'); if (inicioSalvo) inicioTurno = new Date(inicioSalvo);
        var carrinhoJson = LocalDB.get('motoBarCarrinho'); if (carrinhoJson) { carrinho = JSON.parse(carrinhoJson); if (!Array.isArray(carrinho)) carrinho = []; }
        var filaJson = LocalDB.get('motoBarFila'); if (filaJson) { filaVendas = JSON.parse(filaJson); if (!Array.isArray(filaVendas)) filaVendas = []; }
        var configJson = LocalDB.get('motoBarConfig'); if (configJson) config = JSON.parse(configJson);
        var caixaAbertoSalvo = LocalDB.get('motoBarCaixaAberto');
        if (caixaAbertoSalvo === 'true') caixaAberto = true; else caixaAberto = false;
        var valorAberturaSalvo = LocalDB.get('motoBarValorAbertura');
        if (valorAberturaSalvo) valorAbertura = Number(valorAberturaSalvo);
        var caixaIdSalvo = LocalDB.get('motoBarCaixaId');
        if (caixaIdSalvo) caixaId = caixaIdSalvo;
    } catch (e) { console.error("Erro cache", e); }
}

function carregarConfig() {
    var configJson = LocalDB.get('motoBarConfig');
    if (configJson) { try { config = JSON.parse(configJson); /* if (config.logo) logoUrl = config.logo; */ } catch (e) { } }
}

/* =============================================
   UI — CARRINHO / CATÁLOGO
   ============================================= */
function atualizarUI() {
    var listaCarrinho = document.getElementById('carrinho-lista'); listaCarrinho.innerHTML = '';
    var totalCarrinho = 0;
    if (Array.isArray(carrinho)) {
        carrinho.forEach(function (item, idx) {
            totalCarrinho += Number(item.preco) * Number(item.qtd);
            var obsHtml = item.obs ? '<div class="item-obs">' + item.obs + '<\/div>' : '';
            listaCarrinho.innerHTML += '<div class="item-carrinho"><div class="item-detalhes"><div class="item-nome">' + item.nome + '<\/div>' + obsHtml + '<\/div><div class="item-qty-controls"><button class="btn-qty" onclick="decrementarQtd(' + idx + ')">-<\/button><span>' + item.qtd + '<\/span><button class="btn-qty" onclick="incrementarQtd(' + idx + ')">+<\/button><\/div><\/div>';
        });
    }
    document.getElementById('total-display').innerText = 'R$ ' + (totalCarrinho || 0).toFixed(2);
    renderizarCatalogo(); salvarEstadoLocal();
}

function getEstoqueBar(id) { var produtoEncontrado = produtos.find(function (x) { return x.id == id; }); return produtoEncontrado ? Number(produtoEncontrado.estoque_bar) : 0; }
function getQtdCarrinho(id) { var total = 0; if (Array.isArray(carrinho)) { carrinho.forEach(function (item) { if (item.id == id) total += item.qtd; }); } return total; }

function renderizarCatalogo() {
    var gridContainer = document.getElementById('grid-produtos'); gridContainer.innerHTML = '';

    if (!produtos || !Array.isArray(produtos) || produtos.length === 0) {
        gridContainer.innerHTML = '<div style="grid-column: 1 / -1; text-align:center; padding: 40px; color:#aaa;"><h3>Nenhum produto encontrado.<\/h3><p>Cadastre itens no banco de dados ou verifique a conexão.<\/p><\/div>';
        return;
    }

    produtos.forEach(function (produto) {
        var estoqueBarTotal = Number(produto.estoque_bar) || 0;
        var qtdNoCarrinho = getQtdCarrinho(produto.id);
        var estoqueBarDisponivel = estoqueBarTotal - qtdNoCarrinho;
        var estoqueDep = Number(produto.estoque_deposito) || 0;
        var minBar = Number(produto.estoque_min_bar) || 0; var minDep = Number(produto.estoque_min_deposito) || 0;
        var barZerado = estoqueBarDisponivel <= 0; var geralZerado = estoqueDep <= 0;
        var isLow = !barZerado && ((estoqueBarDisponivel <= minBar) || (estoqueDep <= minDep));
        var cardElement = document.createElement('div');
        cardElement.className = 'card' + (isLow ? ' card-alerta' : '');
        cardElement.onclick = function () { cliqueProduto(produto, barZerado); };
        var urlImagem = produto.url_imagem || 'https://placehold.co/150x150/333/FFF?text=Foto';
        var alertaHtml = isLow ? '<div class="badge-alerta">ESTOQUE BAIXO<\/div>' : '';
        var editHtml = modoGerenciaEstoque ? '<div class="badge-edit" style="display:block">EDITAR<\/div>' : '';
        var geralZeradoHtml = geralZerado ? '<div class="faixa-sem-geral">SEM ESTOQUE GERAL<\/div>' : '';
        var barZeradoHtml = (barZerado && !modoGerenciaEstoque) ? '<div class="overlay-esgotado-bar"><span class="icon-lock"><\/span>ACABOU<br>NO BAR<\/div>' : '';
        var precoFmt = Number(produto.preco_atual) || 0;
        cardElement.innerHTML = '<div class="img-container">' + alertaHtml + editHtml + '<img src="' + urlImagem + '" onerror="this.src=\'https://placehold.co/150x150/333/FFF?text=Erro\'">' + geralZeradoHtml + barZeradoHtml + '<\/div><div class="card-info"><div class="card-name">' + produto.nome + '<\/div><div class="card-price">R$ ' + precoFmt.toFixed(2) + '<\/div><div class="card-stock"><span>Bar: ' + estoqueBarDisponivel + '<\/span><span>Dep: ' + estoqueDep + '<\/span><\/div><\/div>';
        gridContainer.appendChild(cardElement);
    });
}



function atualizarEstadoBotoes() {
    var barra = document.getElementById('barra-operador');
    var containerLogin = document.getElementById('container-btn-login');
    var containerAbrir = document.getElementById('container-abrir-caixa');

    var btnAdmin = document.getElementById('btn-admin');

    if (operadorAtual) {
        if (containerLogin) containerLogin.style.display = 'none';
        barra.innerText = "OPERADOR: " + operadorAtual.toUpperCase();

        if (caixaAberto) {
            barra.innerText += " (CAIXA ABERTO)";
            barra.classList.add('status-aberto');
            barra.classList.remove('status-fechado');
            if (containerAbrir) containerAbrir.classList.add('d-none');
        } else {
            barra.innerText += " (CAIXA FECHADO)";
            barra.classList.add('status-fechado');
            barra.classList.remove('status-aberto');
            if (containerAbrir) containerAbrir.classList.remove('d-none');
        }

        if (usuarioAtual && usuarioAtual.perfil === 'admin') {
            if (btnAdmin) btnAdmin.classList.remove('d-none');
        } else {
            if (btnAdmin) btnAdmin.classList.add('d-none');
        }
    } else {
        if (containerLogin) containerLogin.style.display = 'inline-flex';
        if (containerAbrir) containerAbrir.classList.add('d-none');
        if (btnAdmin) btnAdmin.classList.add('d-none');
        barra.innerText = "SISTEMA BLOQUEADO - Clique para Entrar";
        barra.style.color = "#ccc";
        barra.style.backgroundColor = "rgba(0,0,0,0.35)";
    }
}

/* =============================================
   ATUALIZAR DADOS DO SERVIDOR
   ============================================= */
function atualizarDados(showLoader) {
    document.getElementById('resultado-relatorio').innerHTML = '';
    document.getElementById('resultado-relatorio').classList.add('d-none');
    if (showLoader) document.getElementById('loading').style.display = 'flex';
    LocalDB.remove('motoBarProdutos'); LocalDB.remove('motoBarMembros');
    API.invalidateCache(); // Força busca fresca

    API.getDadosIniciais()
        .then(function (d) {
            produtos = (d && d.produtos) ? d.produtos : [];
            membros = (d && d.membros) ? d.membros : [];
            // se quiser usar o default logo, ignora: if (d && d.logoUrl && typeof d.logoUrl === 'string' && d.logoUrl.length > 0) logoUrl = d.logoUrl;

            if (produtos.length === 0 && membros.length === 0) {
                showToast("ALERTA: Banco vazio ou não conectado.");
            }

            salvarDadosLocais(); renderizarCatalogo(); atualizarEstadoBotoes();
            if (logoUrl) { var imgPreload = document.getElementById('logo-preload'); if (imgPreload) imgPreload.src = logoUrl; }
            if (showLoader) document.getElementById('loading').style.display = 'none';
            showToast("Dados atualizados com sucesso!");
        })
        .catch(function (e) {
            if (showLoader) document.getElementById('loading').style.display = 'none';
            showToast("Erro ao atualizar: " + (e.message || e));
        });
}

/* =============================================
   ESTOQUE
   ============================================= */
function alternarModoEstoque() {
    // If currently in modoGerenciaEstoque, allow disabling without password prompt
    if (modoGerenciaEstoque) {
        modoGerenciaEstoque = false;
        var btn = document.getElementById('btn-estoque');
        var carrinhoSec = document.getElementById('secao-carrinho');
        var header = document.getElementById('app-header');
        if (btn) btn.classList.remove('active');
        if (carrinhoSec) carrinhoSec.classList.remove('minimizado');
        document.body.style.border = "none";
        if (header) header.style.borderBottom = "1px solid rgba(255, 152, 0, 0.25)";
        showToast("MODO ESTOQUE DESATIVADO");
        renderizarCatalogo();
        return;
    }

    // Otherwise (currently disabled) request password to enable
    UIModal.prompt("Digite a senha do estoque:", function (senha) {
        if (!senha) return;
        API.verificarSenhaEstoque(senha)
            .then(function (res) {
                if (!res || res.status !== 'ok') {
                    showToast(res && res.mensagem ? res.mensagem : "Senha incorreta.", 'err');
                    return;
                }
                modoGerenciaEstoque = true;
                var btn = document.getElementById('btn-estoque');
                var carrinhoSec = document.getElementById('secao-carrinho');
                var header = document.getElementById('app-header');
                if (btn) btn.classList.add('active');
                if (carrinhoSec) carrinhoSec.classList.add('minimizado');
                document.body.style.border = "3px solid #b30000";
                if (header) header.style.borderBottom = "3px solid #b30000";
                showToast("MODO ESTOQUE ATIVADO");
                renderizarCatalogo();
            })
            .catch(function (err) {
                showToast("Erro ao verificar senha: " + (err.message || err), 'err');
            });
    });
}

function salvarEdicaoEstoque() {
    var novoEstBar = Number(document.getElementById('edit-est-bar').value);
    var novoEstDep = Number(document.getElementById('edit-est-dep').value);
    var novoMinBar = document.getElementById('edit-min-bar').value;
    var novoMinDep = document.getElementById('edit-min-dep').value;

    if (novoEstBar < 0 || novoEstDep < 0) return showToast("Erro: Não é permitido valores negativos.");

    var diferenca = novoEstBar - estoqueOriginalBar;
    if (diferenca > 0) {
        if (novoEstDep - diferenca < 0) return showToast("OPERAÇÃO NEGADA: Depósito insuficiente.");
        novoEstDep = novoEstDep - diferenca;
        document.getElementById('edit-est-dep').value = novoEstDep;
    }
    produtoEdicao.estoque_bar = novoEstBar; produtoEdicao.estoque_deposito = novoEstDep;
    salvarDadosLocais(); renderizarCatalogo(); fecharModal('modal-estoque');
    API.salvarDadosProduto(produtoEdicao.id, novoEstBar, novoEstDep, novoMinBar, novoMinDep)
        .catch(function (err) { console.error("Erro ao salvar estoque:", err); });
}

/* =============================================
   CLIQUE NO PRODUTO / CARRINHO
   ============================================= */
function cliqueProduto(p, isBarZerado) {
    if (!modoGerenciaEstoque && !caixaAberto && operadorAtual) return showToast("O caixa está fechado! Abra o caixa para realizar vendas.");
    var cat = String(p.categoria || "").trim().toUpperCase();
    var isComida = cat === 'COMIDA';

    if (modoGerenciaEstoque) {
        produtoEdicao = p; estoqueOriginalBar = Number(p.estoque_bar);
        document.getElementById('nome-prod-estoque').innerText = p.nome;
        document.getElementById('edit-est-bar').value = p.estoque_bar;
        document.getElementById('edit-est-dep').value = p.estoque_deposito;
        document.getElementById('edit-min-bar').value = p.estoque_min_bar || 0;
        document.getElementById('edit-min-dep').value = p.estoque_min_deposito || 0;
        document.getElementById('modal-estoque').style.display = 'flex';
    }
    else {
        if (!operadorAtual) return showToast("Faça login primeiro.");
        if (isBarZerado) return showToast("Produto esgotado no Bar!");
        if (isComida) { produtoPendente = p; abrirModalObs(p.nome); } else { adicionarAoCarrinho(p.id, p.nome, p.preco_atual, ""); }
    }
}

function adicionarAoCarrinho(id, nome, preco, obs) {
    var produtoEncontrado = produtos.find(function (x) { return x.id == id && x.nome == nome; });
    if (!produtoEncontrado) return;
    var limite = Number(produtoEncontrado.estoque_bar); var noCarrinho = getQtdCarrinho(id);
    if (noCarrinho + 1 > limite) return showToast("Estoque do Bar insuficiente!");
    var itemExistente = carrinho.find(function (i) { return i.id == id && i.nome == nome && i.obs === obs; });
    if (itemExistente) itemExistente.qtd++; else carrinho.push({ id: id, nome: nome, preco: preco, obs: obs, qtd: 1 });
    atualizarUI();
}

function incrementarQtd(idx) {
    var itemCarrinho = carrinho[idx]; var produtoEncontrado = produtos.find(function (x) { return x.id == itemCarrinho.id && x.nome == itemCarrinho.nome; });
    var limiteEstoqueBar = produtoEncontrado ? Number(produtoEncontrado.estoque_bar) : 0; var noCarrinho = getQtdCarrinho(itemCarrinho.id);
    if (noCarrinho + 1 > limiteEstoqueBar) return showToast("Limite do Bar atingido!");
    itemCarrinho.qtd++; atualizarUI();
}

function decrementarQtd(idx) { if (carrinho[idx].qtd > 1) carrinho[idx].qtd--; else carrinho.splice(idx, 1); atualizarUI(); }

/* =============================================
   MODAL OBSERVAÇÃO
   ============================================= */
function abrirModalObs(nome) { document.getElementById('modal-prod-nome').innerText = nome; document.getElementById('custom-obs').value = ''; document.getElementById('modal-obs').style.display = 'flex'; document.getElementById('custom-obs').focus(); }
function confirmarObs() { var custom = document.getElementById('custom-obs').value; if (produtoPendente) { adicionarAoCarrinho(produtoPendente.id, produtoPendente.nome, produtoPendente.preco_atual, custom); } fecharModal('modal-obs'); }

/* =============================================
   OPERADOR / LOGIN
   ============================================= */
function processarTrocaOperador(nomeInput) {
    if (!nomeInput) return;
    if (operadorAtual === nomeInput) return;
    if (carrinho.length > 0) { showToast("Conclua a venda em andamento antes de trocar o operador", "err"); return; }
    UIModal.confirm("Confirma a troca de operador?", function () {
        operadorAtual = nomeInput;
        LocalDB.set('motoBarOperador', operadorAtual);
        atualizarUI();
    });
}

function trocarMembro() {
    UIModal.confirm("Deseja sair do operador atual e voltar ao login?", function () {
        fecharModal('modal-relatorios');
        API.logout().then(function () {
            operadorAtual = ""; usuarioAtual = null; inicioTurno = null;
            atualizarUI(); atualizarEstadoBotoes();
            window.location.replace('/login');
        }).catch(function () {
            window.location.replace('/login');
        });
    });
}

/* =============================================
   CONFIGURAÇÃO
   ============================================= */
function salvarConfig() { config.imprimir = document.getElementById('cfg-imprimir').checked; config.largura = document.getElementById('cfg-largura').value; LocalDB.set('motoBarConfig', JSON.stringify(config)); fecharModal('modal-config'); }
function abrirConfig() { document.getElementById('modal-config').style.display = 'flex'; document.getElementById('cfg-imprimir').checked = config.imprimir; document.getElementById('cfg-largura').value = config.largura; }
function imprimirArea() { window.focus(); setTimeout(function () { window.print(); }, 1500); }

/* =============================================
   PAGAMENTO
   ============================================= */
function iniciarPagamento(metodo) {
    if (!operadorAtual) return showToast("Faça login primeiro.");
    if (!caixaAberto) return showToast("Necessário realizar a Abertura de Caixa!");
    if (!carrinho || !carrinho.length) return showToast('Carrinho Vazio!');
    var visitante = document.getElementById('input-cliente').value;
    var total = carrinho.reduce(function (acc, i) { return acc + (Number(i.preco) * Number(i.qtd)); }, 0);
    var cliente = visitante || "BALCÃO";
    prepararPagamentoGlobal('VENDA', total, metodo, cliente);
}

function iniciarLiquidacao(metodo) {
    if (!operadorAtual) return showToast("Faça login primeiro.");
    if (!caixaAberto) return showToast("Necessário realizar a Abertura de Caixa!");
    if (!dadosFechamentoAtual || dadosFechamentoAtual.total === 0) return showToast("Nada a pagar.");
    fecharModal('modal-fechar-conta');
    prepararPagamentoGlobal('DIVIDA', dadosFechamentoAtual.total, metodo, dadosFechamentoAtual.nome);
}

function prepararPagamentoGlobal(tipo, total, metodo, dadosExtra) {
    pagamentoPendente = { tipo: tipo, valorTotal: total, dados: dadosExtra };
    if (metodo === 'DINHEIRO') {
        document.getElementById('valor-total-dinheiro').innerText = 'Total: R$ ' + total.toFixed(2);
        document.getElementById('valor-recebido').value = '';
        document.getElementById('display-troco').innerText = 'Troco: R$ 0,00';
        document.getElementById('btn-confirmar-dinheiro').style.opacity = '0.5';
        document.getElementById('btn-confirmar-dinheiro').style.pointerEvents = 'none';
        document.getElementById('modal-dinheiro').style.display = 'flex';
        document.getElementById('valor-recebido').focus();
    } else if (metodo === 'CARTAO') {
        document.getElementById('modal-cartao').style.display = 'flex';
    } else {
        executarPagamentoFinal(metodo);
    }
}

function calcularTroco() {
    var recebido = parseFloat(document.getElementById('valor-recebido').value.replace(',', '.')) || 0;
    var total = pagamentoPendente.valorTotal;
    var troco = recebido - total;
    var trocoDisplay = document.getElementById('display-troco');
    var btnConfirmar = document.getElementById('btn-confirmar-dinheiro');
    if (troco >= 0) {
        trocoDisplay.innerText = "Troco: R$ " + troco.toFixed(2); trocoDisplay.style.color = "var(--success)";
        btnConfirmar.style.opacity = '1'; btnConfirmar.style.pointerEvents = 'auto';
    } else {
        trocoDisplay.innerText = "Faltam: R$ " + Math.abs(troco).toFixed(2); trocoDisplay.style.color = "var(--danger)";
        btnConfirmar.style.opacity = '0.5'; btnConfirmar.style.pointerEvents = 'none';
    }
}

function finalizarPagamentoDinheiro() { fecharModal('modal-dinheiro'); executarPagamentoFinal('DINHEIRO'); }
function finalizarPagamentoCartao(tipoCartao) { fecharModal('modal-cartao'); executarPagamentoFinal("CARTÃO - " + tipoCartao); }

function registrarVendaOtimista(metodo, cliente) {
    try {
        if (enviandoVenda) return; enviandoVenda = true;
        cliente = cliente || "CLIENTE";
        var total = carrinho.reduce(function (acc, i) { return acc + (Number(i.preco) * Number(i.qtd)); }, 0);
        var vendaId = Date.now().toString() + Math.floor(Math.random() * 1000);
        var novaVenda = { id: vendaId, itens: JSON.parse(JSON.stringify(carrinho)), total: total, metodo: metodo, cliente: cliente, caixa_id: caixaId, dataHora: new Date().toISOString() };
        if (!filaVendas) filaVendas = [];
        var jaExiste = filaVendas.some(function (v) { return v.id === vendaId; });
        if (!jaExiste) { filaVendas.push(novaVenda); }
        if (produtos) { novaVenda.itens.forEach(function (item) { var prod = produtos.find(function (p) { return p.id == item.id && p.nome == item.nome; }); if (prod) prod.estoque_bar = Number(prod.estoque_bar) - item.qtd; }); }
        try { if (config.imprimir) { montarImpressao(novaVenda.itens, metodo, cliente); setTimeout(function () { window.print(); }, 1000); } } catch (e) { console.error("Erro Impressão", e); }
        carrinho = []; if (document.getElementById('input-cliente')) document.getElementById('input-cliente').value = '';
        salvarDadosLocais(); renderizarCatalogo(); atualizarUI(); processarFilaVendas(); showToast("Venda Registrada!"); setTimeout(function () { enviandoVenda = false; }, 2000);
    } catch (e) { enviandoVenda = false; showToast("Erro ao registrar venda: " + e.message); console.error(e); }
}

function executarPagamentoFinal(metodoFinal) {
    if (document.getElementById('loading')) document.getElementById('loading').style.display = 'none';
    if (enviandoVenda) return; enviandoVenda = true;
    if (pagamentoPendente.tipo === 'VENDA') { enviandoVenda = false; registrarVendaOtimista(metodoFinal, pagamentoPendente.dados); }
    else if (pagamentoPendente.tipo === 'DIVIDA') {
        document.getElementById('loading').style.display = 'flex';
        var nomeLimpo = pagamentoPendente.dados.trim();
        API.quitarContaMembro(nomeLimpo, metodoFinal, operadorAtual)
            .then(function (res) {
                enviandoVenda = false;
                document.getElementById('loading').style.display = 'none';
                fecharModal('modal-fechar-conta');
                showToast(res);
                atualizarDados(false);
            })
            .catch(function (err) {
                enviandoVenda = false;
                document.getElementById('loading').style.display = 'none';
                showToast("Erro de conexão: " + err);
            });
    }
}

/* =============================================
   MEMBROS
   ============================================= */
function verificarDividaSelecionada() {
    var select = document.getElementById('select-membro'); var nome = select.value; var preview = document.getElementById('preview-divida');
    if (!nome) { preview.innerText = ""; return; }
    preview.innerText = "Verificando saldo..."; preview.style.color = "#aaa";
    API.buscarExtratoMembro(nome)
        .then(function (res) {
            var total = res.total || 0;
            if (total > 0) { preview.innerText = "Dívida Atual: R$ " + total.toFixed(2); preview.style.color = "#f44336"; }
            else { preview.innerText = "Nada consta (R$ 0,00)"; preview.style.color = "#4caf50"; }
        })
        .catch(function () { preview.innerText = "Erro ao verificar saldo."; preview.style.color = "orange"; });
}

function abrirModalMembros(tipoContexto) {
    if (!operadorAtual) return showToast("Faça login primeiro.");
    if (tipoContexto === 'FIADO' && (!carrinho || carrinho.length === 0)) return showToast('Carrinho vazio!');
    contextoMembro = tipoContexto;
    var preview = document.getElementById('preview-divida'); if (preview) { preview.innerText = ''; preview.style.color = '#aaa'; }
    document.getElementById('modal-selecionar-membro').style.display = 'flex'; buscarMembrosFrescos('select-membro');
}

function buscarMembrosFrescos(idSelect) {
    var select = document.getElementById(idSelect);
    select.innerHTML = '<option value="" disabled selected>Carregando...<\/option>';
    API.getListaMembros()
        .then(function (lista) {
            membros = Array.isArray(lista) ? lista : [];
            popularSelectMembros(idSelect);
        })
        .catch(function (err) {
            console.error("Erro ao buscar membros:", err);
            membros = [];
            popularSelectMembros(idSelect);
        });
}

function popularSelectMembros(idSelect) {
    var select = document.getElementById(idSelect);
    select.innerHTML = '';
    var defaultOpt = document.createElement('option');
    defaultOpt.value = ""; defaultOpt.text = "Toque para selecionar...";
    defaultOpt.disabled = true; defaultOpt.selected = true;
    select.appendChild(defaultOpt);

    var listaValida = (Array.isArray(membros) && membros.length > 0) ? membros : [{ nome: "Operador Principal" }];
    var membrosOrdenados = [].concat(listaValida).sort(function (a, b) {
        var nomeA = (a && a.nome) ? a.nome.toString() : "";
        var nomeB = (b && b.nome) ? b.nome.toString() : "";
        return nomeA.localeCompare(nomeB);
    });

    membrosOrdenados.forEach(function (membro) {
        if (membro && membro.nome) {
            var option = document.createElement('option');
            option.value = membro.nome; option.innerText = membro.nome;
            select.appendChild(option);
        }
    });
}

function confirmarSelecaoMembro() {
    try {
        var select = document.getElementById('select-membro'); var nomeSelecionado = select.value;
        if (!nomeSelecionado) { showToast("Por favor, selecione um membro na lista."); return; }
        fecharModal('modal-selecionar-membro');
        var preview = document.getElementById('preview-divida'); if (preview) preview.innerText = '';
        if (contextoMembro === 'FIADO') { registrarVendaOtimista('FIADO', nomeSelecionado); }
        else if (contextoMembro === 'FECHAR_CONTA') { carregarDadosFechamento(nomeSelecionado); }
        else { showToast("Ação indefinida."); }
    } catch (e) { showToast("Erro na seleção: " + e.message); }
}

function fecharModalSelecaoMembro() { fecharModal('modal-selecionar-membro'); var preview = document.getElementById('preview-divida'); if (preview) { preview.innerText = ''; } }

/* =============================================
   CAIXA
   ============================================= */
function abrirModalAberturaCaixa() {
    if (caixaAberto) { showToast("O caixa já está aberto!"); return; }
    fecharModal('modal-relatorios'); document.getElementById('modal-abertura-caixa').style.display = 'flex'; document.getElementById('input-valor-abertura').focus();
}

function confirmarAberturaValor() {
    var val = parseFloat(document.getElementById('input-valor-abertura').value); if (isNaN(val)) val = 0;
    valorAbertura = val; caixaAberto = true;

    API.abrirCaixa(val)
        .then(function (res) {
            if (res.caixa_id) { caixaId = res.caixa_id; }
            salvarDadosLocais();
        })
        .catch(function (err) { console.error("Erro ao abrir caixa no servidor:", err); });

    salvarDadosLocais();
    fecharModal('modal-abertura-caixa'); showToast("Caixa Aberto: R$ " + val.toFixed(2));
    atualizarEstadoBotoes();
}

function carregarDadosFechamento(nome) {
    document.getElementById('modal-fechar-conta').style.display = 'flex';
    document.getElementById('nome-fechar-conta').innerText = nome;
    document.getElementById('lista-fechamento').innerHTML = 'Buscando...';
    API.buscarExtratoMembro(nome)
        .then(function (res) {
            dadosFechamentoAtual = { nome: nome, itens: res.itens, total: res.total };
            var html = '';
            if (!res.itens.length) html = '<p style="text-align:center">Sem pendências.<\/p>';
            else res.itens.forEach(function (i) {
                html += '<div class="extrato-item"><span>' + (i.qtd || 1) + 'x ' + (i.produto || i.descricao || 'Item') + '<\/span><span>R$ ' + (i.valor || 0).toFixed(2) + '<\/span><\/div>';
            });
            document.getElementById('lista-fechamento').innerHTML = html;
            document.getElementById('total-fechamento').innerText = 'R$ ' + (res.total || 0).toFixed(2);
        })
        .catch(function () { showToast("Erro ao buscar dados."); fecharModal('modal-fechar-conta'); });
}

/* =============================================
   RELATÓRIOS
   ============================================= */
function abrirMenuRelatorios() {
    if (!operadorAtual) return showToast("Faça login primeiro.");
    document.getElementById('modal-relatorios').style.display = 'flex';
    document.getElementById('resultado-relatorio').classList.add('d-none');
    document.getElementById('nome-operador-atual').innerText = operadorAtual;
    var hoje = new Date(); var primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    document.getElementById('data-inicio').value = primeiroDia.toISOString().split('T')[0];
    document.getElementById('data-fim').value = hoje.toISOString().split('T')[0];
}

function gerarRelatorio(tipo) {
    document.getElementById('loading').style.display = 'flex'; var filtro = {};
    if (tipo === 'TURNO') { filtro = { operador: operadorAtual, inicio: inicioTurno ? inicioTurno.toString() : new Date().toString() }; }
    tipoRelatorioAtual = tipo; executarRelatorio(tipo, filtro);
}

function gerarRelatorioPeriodo() {
    var ini = document.getElementById('data-inicio').value; var fim = document.getElementById('data-fim').value;
    if (!ini || !fim) return showToast("Selecione as datas.");
    document.getElementById('loading').style.display = 'flex'; tipoRelatorioAtual = 'PERIODO'; executarRelatorio('PERIODO', { inicio: ini, fim: fim });
}

function executarRelatorio(tipo, filtro) {
    document.getElementById('resultado-relatorio').innerHTML = ''; document.getElementById('resultado-relatorio').classList.add('d-none');
    API.gerarRelatorioCaixa(tipo, filtro)
        .then(function (res) {
            dadosRelatorioAtual = res; document.getElementById('loading').style.display = 'none';
            if (!res) { return showToast("Erro: O relatório retornou vazio."); }
            document.getElementById('resultado-relatorio').classList.remove('d-none');
            var saldoIni = 0;
            if (tipoRelatorioAtual === 'PERIODO') { saldoIni = Number(res.abertura) || 0; } else if ((tipo === 'TURNO' || tipo === 'DIA') && caixaAberto) { saldoIni = Number(valorAbertura) || 0; }
            var dinheiro = Number(res.dinheiro) || 0; var pix = Number(res.pix) || 0; var cartao = Number(res.cartao) || 0; var recebimentoDivida = Number(res.recebimentoDivida) || 0; var vendasFiado = Number(res.vendasFiado) || 0;
            var totalEntradas = dinheiro + pix + cartao + recebimentoDivida; var totalGeralCaixa = totalEntradas + saldoIni;
            var htmlCupom = '<div class="cupom-visual"><div style="text-align:center; font-weight:bold; margin-bottom:10px; border-bottom:1px dashed #000; padding-bottom:5px;">RELATÓRIO DE CAIXA<br>' + res.periodo + '<\/div><div style="border-bottom:1px dashed #555; padding:5px 0; font-weight:bold; color:var(--accent);">RESUMO FINANCEIRO<\/div><div class="relatorio-linha"><span>(+) Fundo de Caixa:<\/span><span>R$ ' + saldoIni.toFixed(2) + '<\/span><\/div><div class="relatorio-linha"><span>(+) Vendas Dinheiro:<\/span><span>R$ ' + dinheiro.toFixed(2) + '<\/span><\/div><div class="relatorio-linha"><span>(+) Vendas Pix:<\/span><span>R$ ' + pix.toFixed(2) + '<\/span><\/div><div class="relatorio-linha"><span>(+) Vendas Cartão:<\/span><span>R$ ' + cartao.toFixed(2) + '<\/span><\/div><div class="relatorio-linha"><span>(+) Receb. Dívidas:<\/span><span>R$ ' + recebimentoDivida.toFixed(2) + '<\/span><\/div><div class="relatorio-linha" style="border-top:1px solid #777; margin-top:5px; padding-top:5px; font-weight:bold; font-size:1.1em; color:var(--success);"><span>(=) TOTAL EM CAIXA:<\/span><span>R$ ' + totalGeralCaixa.toFixed(2) + '<\/span><\/div><div style="border-bottom:1px dashed #555; padding:5px 0; margin-top:15px; font-weight:bold; color:var(--danger);">MOVIMENTAÇÃO FIADO<\/div><div class="relatorio-linha"><span>(>) Total Vendido Fiado:<\/span><span>R$ ' + Number(res.vendasFiado).toFixed(2) + '<\/span><\/div>';
            var htmlProds = "";
            if (res.produtosVendidos && typeof res.produtosVendidos === 'object') {
                var keys = Object.keys(res.produtosVendidos);
                if (keys.length > 0) {
                    htmlProds = '<br><div style="text-align:center; font-weight:bold; border-bottom:1px dashed #000;">ITENS VENDIDOS<\/div><table style="width:100%; font-size:0.9em; margin-top:5px;">';
                    for (var prod in res.produtosVendidos) { htmlProds += '<tr><td>' + prod + '<\/td><td style="text-align:right">' + res.produtosVendidos[prod] + '<\/td><\/tr>'; }
                    htmlProds += '<\/table>';
                }
            }
            htmlCupom += htmlProds;
            if (res.historico && Array.isArray(res.historico) && res.historico.length > 0) {
                htmlCupom += '<br><div style="text-align:center; font-weight:bold; border-bottom:1px dashed #000; margin-top:10px;">HISTÓRICO COMPLETO<\/div><table style="width:100%; font-size:0.8em; margin-top:5px; border-collapse: collapse;"><tr style="background:#ddd; font-weight:bold;"><td style="padding:2px;">Hora<\/td><td style="padding:2px;">Desc.<\/td><td style="padding:2px;">Valor<\/td><\/tr>';
                res.historico.forEach(function (h) {
                    var metodoStr = h.metodo || ""; var cor = metodoStr.includes("FIADO") ? "red" : (h.tipo === 'RECEBIMENTO' ? "green" : "inherit");
                    var horaShow = h.hora || "";
                    htmlCupom += '<tr style="border-bottom:1px solid #eee; color:' + cor + '"><td style="padding:2px;">' + horaShow + '<\/td><td style="padding:2px;">' + (h.descricao || '') + '<\/td><td style="padding:2px; text-align:right">' + Number(h.valor).toFixed(2) + '<\/td><\/tr>';
                });
                htmlCupom += '<\/table>';
            }
            htmlCupom += '<\/div>';
            document.getElementById('resultado-relatorio').innerHTML = htmlCupom + '<br><button id="btn-imprimir-rel" class="btn-action btn-dinheiro w-100" onclick="imprimirRelatorioAtual()">IMPRIMIR RELATORIO<\/button>';
            if (tipo === 'TURNO' || tipo === 'DIA') { document.getElementById('resultado-relatorio').innerHTML += '<button id="btn-confirmar-fechamento" class="btn-action w-100 mt-2" onclick="confirmarFechamentoCaixa()">CONFIRMAR FECHAMENTO E SAIR<\/button>'; }
        }).catch(function (e) { document.getElementById('loading').style.display = 'none'; showToast("Erro ao gerar relatório: " + (e.message || e)); });
}

function confirmarFechamentoCaixa() {
    UIModal.confirm("Confirma o fechamento definitivo do caixa?", function () {
        if (caixaId) {
            API.fecharCaixa(caixaId, null).catch(function (e) { console.error("Erro ao fechar caixa:", e); });
        }
        caixaAberto = false; valorAbertura = 0; caixaId = null;
        operadorAtual = ""; usuarioAtual = null; inicioTurno = null; carrinho = [];
        atualizarUI(); fecharModal('modal-relatorios'); atualizarEstadoBotoes();
        API.logout().then(function () {
            window.location.replace('/login');
        }).catch(function () {
            window.location.replace('/login');
        });
    });
}

/* =============================================
   IMPRESSÃO
   ============================================= */
function montarImpressao(itens, metodo, cliente) {
    var area = document.getElementById('area-impressao');
    var html = '';
    var data = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    var imgTag = '<div style="text-align:center; margin-bottom:10px"><img src="/static/img/motorhead.png" style="width:70px; height:70px; filter: grayscale(100%);"></div>';

    itens.forEach(function (item) {
        var prod = produtos.find(function (p) { return p.id == item.id; });
        var categoria = prod ? prod.categoria : "";
        var isComida = (categoria && categoria.toUpperCase() === 'COMIDA');

        for (var i = 0; i < item.qtd; i++) {
            var obsHtml = item.obs ? '<span class="ticket-obs">' + item.obs.toUpperCase() + '<\/span>' : '';
            html += '<div class="ticket ' + config.largura + '">' + imgTag + '<div class="ticket-content"><div class="ticket-header">MOTORHEAD • ' + data + '<\/div><span class="ticket-item">' + item.nome + '<\/span>' + obsHtml + '<div class="ticket-info">CLI: <b>' + cliente.toUpperCase() + '<\/b> | ' + metodo + '<\/div>' + (isComida ? '<div style="font-size:0.8em; margin-top:5px">VIA CLIENTE<\/div>' : '') + '<\/div><\/div>';
            if (isComida) {
                html += '<div class="ticket ' + config.largura + '">' + imgTag + '<div class="ticket-content"><div class="ticket-header">COZINHA • ' + data + '<\/div><span class="ticket-item">' + item.nome + '<\/span>' + obsHtml + '<div class="ticket-info">CLI: <b>' + cliente.toUpperCase() + '<\/b><\/div><div style="font-size:0.9em; margin-top:5px; font-weight:bold">VIA COZINHA<\/div><\/div><\/div>';
            }
        }
    });
    area.innerHTML = html;
}

function imprimirRelatorioAtual() {
    if (!dadosRelatorioAtual) return;
    var area = document.getElementById('area-impressao');
    var saldoIni = 0;
    if (tipoRelatorioAtual === 'PERIODO') { saldoIni = Number(dadosRelatorioAtual.abertura) || 0; } else if (caixaAberto) { saldoIni = Number(valorAbertura) || 0; }
    var dinheiro = Number(dadosRelatorioAtual.dinheiro) || 0; var pix = Number(dadosRelatorioAtual.pix) || 0; var cartao = Number(dadosRelatorioAtual.cartao) || 0; var recebimentoDivida = Number(dadosRelatorioAtual.recebimentoDivida) || 0;
    var totalEntradas = dinheiro + pix + cartao + recebimentoDivida; var totalGeral = totalEntradas + saldoIni;
    var htmlHistorico = '';
    if (dadosRelatorioAtual.historico && dadosRelatorioAtual.historico.length > 0) {
        htmlHistorico = '<br><div style="border-bottom:1px dashed black; font-weight:bold; text-align:center">EXTRATO DETALHADO<\/div>';
        dadosRelatorioAtual.historico.forEach(function (h) {
            var symbol = h.metodo.includes("FIADO") ? "(!)" : "";
            var horaShow = ""; if (h.data) horaShow = h.data.split(' ')[1] || h.data; else if (h.hora) horaShow = h.hora.split(' ')[1] || h.hora; else if (h.dataHora) horaShow = h.dataHora.split(' ')[1] || h.dataHora;
            htmlHistorico += '<div style="font-size:0.8em; border-bottom:1px dotted #ccc; margin-bottom:2px;">' + horaShow + ' ' + h.descricao.substring(0, 15) + '... ' + symbol + '<br><div style="text-align:right">' + Number(h.valor).toFixed(2) + ' (' + h.metodo.substring(0, 3) + ')<\/div><\/div>';
        });
    }
    var html = '<div class="sheet-a4"><div class="ticket-header">RELATÓRIO DE CAIXA<\/div><div class="ticket-header" style="font-size:1em">' + dadosRelatorioAtual.periodo + '<\/div><div style="border-bottom:1px solid black; margin:10px 0"><\/div><div style="text-align:left; font-weight:bold; margin-top:5px;">RESUMO FINANCEIRO<\/div><div class="relatorio-linha"><span>(+) Saldo Inicial:<\/span><span>R$ ' + saldoIni.toFixed(2) + '<\/span><\/div><div class="relatorio-linha"><span>(+) Dinheiro:<\/span><span>R$ ' + dinheiro.toFixed(2) + '<\/span><\/div><div class="relatorio-linha"><span>(+) Pix:<\/span><span>R$ ' + pix.toFixed(2) + '<\/span><\/div><div class="relatorio-linha"><span>(+) Cartão:<\/span><span>R$ ' + cartao.toFixed(2) + '<\/span><\/div><div class="relatorio-linha"><span>(+) Receb. Dívidas:<\/span><span>R$ ' + recebimentoDivida.toFixed(2) + '<\/span><\/div><div style="border-top:1px solid black; margin:5px 0"><\/div><div class="relatorio-linha" style="font-weight:bold; font-size:1.3em"><span>(=) TOTAL CAIXA:<\/span><span>R$ ' + totalGeral.toFixed(2) + '<\/span><\/div><div style="border-bottom:1px dashed black; margin:10px 0"><\/div><div style="text-align:left; font-weight:bold;">MOVIMENTAÇÃO FIADO<\/div><div class="relatorio-linha"><span>(>) Total Vendido Fiado:<\/span><span>R$ ' + Number(dadosRelatorioAtual.vendasFiado).toFixed(2) + '<\/span><\/div>' + htmlHistorico + '<br><br><br><div style="border-top:1px solid black; width:60%; margin:0 auto"><\/div><div style="text-align:center; font-size:0.8em; margin-top:5px">Assinatura Responsável<\/div><\/div>';
    area.innerHTML = html; imprimirArea();
}

function montarImpressaoFechamento(dados) {
    var area = document.getElementById('area-impressao');
    var data = new Date().toLocaleTimeString('pt-BR');
    var imgTag = '<div style="text-align:center; margin-bottom:10px"><img src="/static/img/motorhead.png" style="width:70px; height:70px; filter: grayscale(100%);"></div>';
    var html = '<div class="ticket ' + config.largura + '">' + imgTag + '<div class="ticket-content"><div class="ticket-header">RECIBO PAGAMENTO<\/div><div class="ticket-header">MOTORHEAD<\/div><div style="border-bottom:1px solid black; margin:5px 0"><\/div><div>Membro: <b>' + dados.nome.toUpperCase() + '<\/b><\/div><div>Data: ' + data + '<\/div><div style="margin-top:10px">';
    dados.itens.forEach(function (i) { html += '<div class="extrato-print-item"><span>' + i.qtd + 'x ' + i.produto + '<\/span><span>' + i.valor.toFixed(2) + '<\/span><\/div>'; });
    html += '<\/div><div class="extrato-print-total">TOTAL PAGO: R$ ' + dados.total.toFixed(2) + '<\/div><div style="text-align:right; font-size:0.9em; margin-top:5px">Forma: ' + (dados.metodo || 'DINHEIRO') + '<\/div><div style="text-align:center; margin-top:10px; font-size:0.8em">Conta Quitada<\/div><\/div><\/div>';
    area.innerHTML = html;
}

/* =============================================
   FILA DE VENDAS (SINCRONIZAÇÃO)
   ============================================= */
function processarFilaVendas() {
    if (!Array.isArray(filaVendas) || filaVendas.length === 0) { return; }

    if (processandoFila) {
        if (Date.now() - lastProcessTime > 45000) {
            processandoFila = false;
        } else {
            return;
        }
    }
    processandoFila = true;
    lastProcessTime = Date.now();
    // document.getElementById('status-conexao').className = 'status-sync';
    var vendaParaEnviar = filaVendas[0];

    API.processarVenda(vendaParaEnviar)
        .then(function (res) {
            try {
                if (res && typeof res === 'string' && res.indexOf("Erro") === 0) {
                    showToast("ALERTA: " + res + " A venda foi descartada.");
                    filaVendas.shift(); salvarDadosLocais();
                    setTimeout(processarFilaVendas, 100);
                } else {
                    filaVendas.shift(); salvarDadosLocais();
                    setTimeout(processarFilaVendas, 100);
                }
            } catch (e) { console.error("Erro no handler:", e); } finally { processandoFila = false; }
        })
        .catch(function (err) {
            console.error("Erro envio", err);
            // document.getElementById('status-conexao').className = 'status-offline';
            processandoFila = false;
        });
}

/**
 * Re-sincroniza silenciosamente os produtos para atualizar estoque.
 */
function sincronizarProdutosBackground() {
    if (filaVendas.length > 0) return; // Não sincroniza enquanto envia vendas

    API.getProdutos()
        .then(function (dados) {
            if (dados && dados.produtos) {
                // Atualiza o estoque no array local sem perder referências
                dados.produtos.forEach(function (produtoAtualizado) {
                    var produtoLocal = produtos.find(function (p) { return p.id === produtoAtualizado.id; });
                    if (produtoLocal) {
                        produtoLocal.estoque_bar = produtoAtualizado.estoque_bar;
                        produtoLocal.estoque_deposito = produtoAtualizado.estoque_deposito;
                    }
                });
                renderizarCatalogo();
                console.log('Estoque sincronizado em background.');
            }
        })
        .catch(function (e) { console.warn('Erro na sincronização silenciosa:', e); });
}

/* =============================================
   INICIALIZAÇÃO DO SISTEMA
   ============================================= */
function iniciarSistema() {
    try {
        carregarDadosLocais();
        atualizarUI();
        if (operadorAtual) atualizarEstadoBotoes();
        if (logoUrl) { var imgP = new Image(); imgP.src = logoUrl; }
    } catch (e) { console.error('Erro init local', e); }

    var loadingEl = document.getElementById('loading');

    API._initSupabase()
        .then(function (client) {
            if (!client) {
                window.location.href = '/login';
                return null;
            }
            return Promise.all([API.getMe(), API.getDadosIniciais()]);
        })
        .then(function (results) {
            if (!results) return; // redirecionou

            var resMe = results[0];
            var dados = results[1];

            if (!resMe || resMe.status !== 'ok' || !resMe.usuario) {
                window.location.href = '/login';
                return;
            }

            usuarioAtual = resMe.usuario;
            operadorAtual = resMe.usuario.nome;

            produtos = (dados && Array.isArray(dados.produtos)) ? dados.produtos : [];
            membros = (dados && Array.isArray(dados.membros)) ? dados.membros : [];
            if (dados && dados.logoUrl) logoUrl = dados.logoUrl;

            salvarDadosLocais();
            renderizarCatalogo();
            atualizarEstadoBotoes();
            processarFilaVendas();

            if (loadingEl) loadingEl.style.display = 'none';
        })
        .catch(function (err) {
            console.error('Falha na inicialização:', err);
            if (loadingEl) loadingEl.style.display = 'none';
            // document.getElementById('status-conexao').className = 'status-offline';

            // Se tiver dados locais e operador, mantém funcionando offline
            if (operadorAtual) {
                renderizarCatalogo();
                atualizarEstadoBotoes();
                processarFilaVendas();
                showToast('Servidor offline. Usando dados locais.');
            } else {
                window.location.href = '/login';
            }
        });

    // Sincroniza fila de vendas periodicamente
    setInterval(processarFilaVendas, 10000);

    // Sincroniza estoque em background a cada 60s
    setInterval(sincronizarProdutosBackground, 60000);
}

// Inicia quando o DOM carregar
iniciarSistema();
