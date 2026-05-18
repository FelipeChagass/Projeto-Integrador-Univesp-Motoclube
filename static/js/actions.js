import { API, UIModal } from './api.js';
import { S, salvarDadosLocais } from './state.js';
import { esc, formatCurrency, LocalDB } from './utils.js';
import { showToast, fecharModal, abrirModal, atualizarUI, renderizarCatalogo, getQtdCarrinho, atualizarEstadoBotoes, sincronizarTextoModoEstoque } from './ui.js';
import { montarImpressao } from './reports.js';

/* ─── Cart ─── */

export function adicionarAoCarrinho(id, nome, preco, obs) {
    const produtoEncontrado = S.produtos.find(x => x.id == id && x.nome == nome);
    if (!produtoEncontrado) return;
    const limite = Number(produtoEncontrado.estoque_bar);
    const noCarrinho = getQtdCarrinho(id);
    if (noCarrinho + 1 > limite) return showToast('Estoque do Bar insuficiente!');
    const itemExistente = S.carrinho.find(i => i.id == id && i.nome == nome && i.obs === obs);
    if (itemExistente) {
        itemExistente.qtd++;
    } else {
        S.carrinho.push({ id, nome, preco, obs, qtd: 1 });
    }
    atualizarUI();
}

export function incrementarQtd(idx) {
    const item = S.carrinho[idx];
    const prod = S.produtos.find(x => x.id == item.id && x.nome == item.nome);
    const limite = prod ? Number(prod.estoque_bar) : 0;
    if (getQtdCarrinho(item.id) + 1 > limite) return showToast('Limite do Bar atingido!');
    item.qtd++;
    atualizarUI();
}

export function decrementarQtd(idx) {
    if (S.carrinho[idx].qtd > 1) {
        S.carrinho[idx].qtd--;
    } else {
        S.carrinho.splice(idx, 1);
    }
    atualizarUI();
}

export function abrirModalObs(nome) {
    document.getElementById('modal-prod-nome').innerText = nome;
    document.getElementById('custom-obs').value = '';
    abrirModal('modal-obs');
    document.getElementById('custom-obs').focus();
}

export function confirmarObs() {
    const custom = document.getElementById('custom-obs').value;
    if (S.produtoPendente) {
        adicionarAoCarrinho(S.produtoPendente.id, S.produtoPendente.nome, S.produtoPendente.preco_atual, custom);
    }
    fecharModal('modal-obs');
}

/* ─── Product Interaction ─── */

export function cliqueProduto(p, isBarZerado) {
    if (!S.modoGerenciaEstoque && !S.caixaAberto && S.operadorAtual) {
        return showToast('O caixa está fechado! Abra o caixa para realizar vendas.');
    }
    const cat = String(p.categoria || '').trim().toUpperCase();
    const isComida = cat === 'COMIDA';

    if (S.modoGerenciaEstoque) {
        S.produtoEdicao = p;
        S.estoqueOriginalBar = Number(p.estoque_bar);
        document.getElementById('nome-prod-estoque').innerText = p.nome;
        document.getElementById('edit-est-bar').value = p.estoque_bar;
        document.getElementById('edit-est-dep').value = p.estoque_deposito;
        document.getElementById('edit-min-bar').value = p.estoque_min_bar || 0;
        document.getElementById('edit-min-dep').value = p.estoque_min_deposito || 0;
        abrirModal('modal-estoque');
    } else {
        if (!S.operadorAtual) return showToast('Faça login primeiro.');
        if (isBarZerado) return showToast('Produto esgotado no Bar!');
        if (isComida) {
            S.produtoPendente = p;
            abrirModalObs(p.nome);
        } else {
            adicionarAoCarrinho(p.id, p.nome, p.preco_atual, '');
        }
    }
}

/* ─── Stock Management ─── */

export function alternarModoEstoque() {
    if (S.modoGerenciaEstoque) {
        S.modoGerenciaEstoque = false;
        const btn = document.getElementById('btn-estoque');
        const carrinhoSec = document.getElementById('carrinho-section');
        const header = document.getElementById('app-header');
        if (btn) btn.classList.remove('active');
        if (carrinhoSec) carrinhoSec.classList.remove('minimizado');
        document.body.style.border = 'none';
        if (header) header.style.borderBottom = '1px solid rgba(255, 152, 0, 0.25)';
        sincronizarTextoModoEstoque();
        showToast('MODO ESTOQUE DESATIVADO');
        renderizarCatalogo();
        return;
    }
    document.getElementById('input-senha-estoque').value = '';
    document.getElementById('erro-senha-estoque').textContent = '';
    abrirModal('modal-senha-estoque');
    document.getElementById('input-senha-estoque').focus();
}

export function confirmarSenhaEstoque() {
    const senha = document.getElementById('input-senha-estoque').value;
    const erroEl = document.getElementById('erro-senha-estoque');
    if (!senha) {
        erroEl.textContent = 'Por favor, digite a senha.';
        erroEl.classList.remove('d-none');
        return;
    }
    erroEl.textContent = '';
    erroEl.classList.add('d-none');
    API.verificarSenhaEstoque(senha)
        .then(res => {
            if (!res || res.status !== 'ok') {
                erroEl.textContent = (res && res.mensagem) ? res.mensagem : 'Senha incorreta.';
                erroEl.classList.remove('d-none');
                document.getElementById('input-senha-estoque').value = '';
                document.getElementById('input-senha-estoque').focus();
                return;
            }
            fecharModal('modal-senha-estoque');
            S.modoGerenciaEstoque = true;
            const btn = document.getElementById('btn-estoque');
            const carrinhoSec = document.getElementById('carrinho-section');
            const header = document.getElementById('app-header');
            if (btn) btn.classList.add('active');
            if (carrinhoSec) carrinhoSec.classList.add('minimizado');
            document.body.style.border = '3px solid #b30000';
            if (header) header.style.borderBottom = '3px solid #b30000';
            sincronizarTextoModoEstoque();
            showToast('MODO ESTOQUE ATIVADO');
            renderizarCatalogo();
        })
        .catch(err => {
            erroEl.textContent = 'Erro ao verificar senha. Tente novamente.';
            erroEl.classList.remove('d-none');
            console.error('Erro ao verificar senha:', err);
        });
}

export function salvarEdicaoEstoque() {
    const novoEstBar = Number(document.getElementById('edit-est-bar').value);
    let novoEstDep = Number(document.getElementById('edit-est-dep').value);
    const novoMinBar = document.getElementById('edit-min-bar').value;
    const novoMinDep = document.getElementById('edit-min-dep').value;
    if (novoEstBar < 0 || novoEstDep < 0) return showToast('Erro: Não é permitido valores negativos.');
    const diferenca = novoEstBar - S.estoqueOriginalBar;
    if (diferenca > 0) {
        if (novoEstDep - diferenca < 0) return showToast('OPERAÇÃO NEGADA: Depósito insuficiente.');
        novoEstDep -= diferenca;
        document.getElementById('edit-est-dep').value = novoEstDep;
    }
    S.produtoEdicao.estoque_bar = novoEstBar;
    S.produtoEdicao.estoque_deposito = novoEstDep;
    salvarDadosLocais();
    renderizarCatalogo();
    fecharModal('modal-estoque');
    API.salvarDadosProduto(S.produtoEdicao.id, novoEstBar, novoEstDep, novoMinBar, novoMinDep)
        .catch(err => console.error('Erro ao salvar estoque:', err));
}

/* ─── Payment ─── */

export function iniciarPagamento(metodo) {
    if (!S.operadorAtual) return showToast('Faça login primeiro.');
    if (!S.caixaAberto) return showToast('Necessário realizar a Abertura de Caixa!');
    if (!S.carrinho || !S.carrinho.length) return showToast('Carrinho Vazio!');
    const visitante = document.getElementById('input-cliente').value;
    const total = S.carrinho.reduce((acc, i) => acc + (Number(i.preco) * Number(i.qtd)), 0);
    prepararPagamentoGlobal('VENDA', total, metodo, visitante || 'BALCÃO');
}

export function iniciarLiquidacao(metodo) {
    if (!S.operadorAtual) return showToast('Faça login primeiro.');
    if (!S.caixaAberto) return showToast('Necessário realizar a Abertura de Caixa!');
    if (!S.dadosFechamentoAtual || S.dadosFechamentoAtual.total === 0) return showToast('Nada a pagar.');
    fecharModal('modal-fechar-conta');
    prepararPagamentoGlobal('DIVIDA', S.dadosFechamentoAtual.total, metodo, S.dadosFechamentoAtual.nome);
}

export function prepararPagamentoGlobal(tipo, total, metodo, dadosExtra) {
    S.pagamentoPendente = { tipo, valorTotal: total, dados: dadosExtra };
    if (metodo === 'DINHEIRO') {
        document.getElementById('valor-total-dinheiro').innerText = `Total: ${formatCurrency(total)}`;
        document.getElementById('valor-recebido').value = '';
        document.getElementById('display-troco').innerText = 'Troco: R$ 0,00';
        document.getElementById('btn-confirmar-dinheiro').style.opacity = '0.5';
        document.getElementById('btn-confirmar-dinheiro').style.pointerEvents = 'none';
        abrirModal('modal-dinheiro');
        document.getElementById('valor-recebido').focus();
    } else if (metodo === 'CARTAO') {
        abrirModal('modal-cartao');
    } else {
        executarPagamentoFinal(metodo);
    }
}

export function calcularTroco() {
    const recebido = parseFloat(document.getElementById('valor-recebido').value.replace(',', '.')) || 0;
    const troco = recebido - S.pagamentoPendente.valorTotal;
    const trocoDisplay = document.getElementById('display-troco');
    const btnConfirmar = document.getElementById('btn-confirmar-dinheiro');
    if (troco >= 0) {
        trocoDisplay.innerText = `Troco: ${formatCurrency(troco)}`;
        trocoDisplay.style.color = 'var(--success)';
        btnConfirmar.style.opacity = '1';
        btnConfirmar.style.pointerEvents = 'auto';
    } else {
        trocoDisplay.innerText = `Faltam: ${formatCurrency(Math.abs(troco))}`;
        trocoDisplay.style.color = 'var(--danger)';
        btnConfirmar.style.opacity = '0.5';
        btnConfirmar.style.pointerEvents = 'none';
    }
}

export function finalizarPagamentoDinheiro() {
    fecharModal('modal-dinheiro');
    executarPagamentoFinal('DINHEIRO');
}

export function finalizarPagamentoCartao(tipoCartao) {
    fecharModal('modal-cartao');
    executarPagamentoFinal(`CARTÃO - ${tipoCartao}`);
}

/* ─── Sales ─── */

export function registrarVendaOtimista(metodo, cliente) {
    try {
        if (S.enviandoVenda) return;
        S.enviandoVenda = true;
        cliente = cliente || 'CLIENTE';
        const total = S.carrinho.reduce((acc, i) => acc + (Number(i.preco) * Number(i.qtd)), 0);
        const vendaId = Date.now().toString() + Math.floor(Math.random() * 1000);
        const novaVenda = {
            id: vendaId,
            itens: JSON.parse(JSON.stringify(S.carrinho)),
            total, metodo, cliente,
            caixa_id: S.caixaId,
            dataHora: new Date().toISOString()
        };
        if (!S.filaVendas) S.filaVendas = [];
        if (!S.filaVendas.some(v => v.id === vendaId)) S.filaVendas.push(novaVenda);
        if (S.produtos) {
            novaVenda.itens.forEach(item => {
                const prod = S.produtos.find(p => p.id == item.id && p.nome == item.nome);
                if (prod) prod.estoque_bar = Number(prod.estoque_bar) - item.qtd;
            });
        }
        try {
            if (S.config.imprimir) {
                montarImpressao(novaVenda.itens, metodo, cliente);
                setTimeout(() => window.print(), 1000);
            }
        } catch (e) { console.error('Erro Impressão', e); }

        S.carrinho = [];
        const inputCliente = document.getElementById('input-cliente');
        if (inputCliente) inputCliente.value = '';
        salvarDadosLocais();
        renderizarCatalogo();
        atualizarUI();
        processarFilaVendas();
        showToast('Venda Registrada!');
        setTimeout(() => { S.enviandoVenda = false; }, 2000);
    } catch (e) {
        S.enviandoVenda = false;
        showToast(`Erro ao registrar venda: ${e.message}`);
        console.error(e);
    }
}

export function executarPagamentoFinal(metodoFinal) {
    const loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.style.display = 'none';
    if (S.enviandoVenda) return;
    S.enviandoVenda = true;

    if (S.pagamentoPendente.tipo === 'VENDA') {
        S.enviandoVenda = false;
        registrarVendaOtimista(metodoFinal, S.pagamentoPendente.dados);
    } else if (S.pagamentoPendente.tipo === 'DIVIDA') {
        loadingEl.style.display = 'flex';
        API.quitarContaMembro(S.pagamentoPendente.dados.trim(), metodoFinal, S.operadorAtual)
            .then(res => {
                S.enviandoVenda = false;
                loadingEl.style.display = 'none';
                fecharModal('modal-fechar-conta');
                showToast(res);
                setTimeout(() => window.location.reload(), 1500);
            })
            .catch(err => {
                S.enviandoVenda = false;
                loadingEl.style.display = 'none';
                showToast(`Erro de conexão: ${err}`);
            });
    }
}

/* ─── Members ─── */

export function verificarDividaSelecionada() {
    const nome = document.getElementById('select-membro').value;
    const preview = document.getElementById('preview-divida');
    if (!nome) { preview.innerText = ''; return; }
    preview.innerText = 'Verificando saldo...';
    preview.style.color = '#aaa';
    API.buscarExtratoMembro(nome)
        .then(res => {
            const total = res.total || 0;
            if (total > 0) {
                preview.innerText = `Dívida Atual: ${formatCurrency(total)}`;
                preview.style.color = '#f44336';
            } else {
                preview.innerText = 'Nada consta (R$ 0,00)';
                preview.style.color = '#4caf50';
            }
        })
        .catch(() => {
            preview.innerText = 'Erro ao verificar saldo.';
            preview.style.color = 'orange';
        });
}

export function abrirModalMembros(tipoContexto) {
    if (!S.operadorAtual) return showToast('Faça login primeiro.');
    if (tipoContexto === 'FIADO' && (!S.carrinho || S.carrinho.length === 0)) return showToast('Carrinho vazio!');
    S.contextoMembro = tipoContexto;
    const preview = document.getElementById('preview-divida');
    if (preview) { preview.innerText = ''; preview.style.color = '#aaa'; }
    abrirModal('modal-selecionar-membro');
    buscarMembrosFrescos('select-membro');
}

export function buscarMembrosFrescos(idSelect) {
    const select = document.getElementById(idSelect);
    select.innerHTML = '<option value="" disabled selected>Carregando...</option>';
    API.getListaMembros()
        .then(lista => {
            S.membros = Array.isArray(lista) ? lista : [];
            popularSelectMembros(idSelect);
        })
        .catch(err => {
            console.error('Erro ao buscar membros:', err);
            S.membros = [];
            popularSelectMembros(idSelect);
        });
}

export function popularSelectMembros(idSelect) {
    const select = document.getElementById(idSelect);
    select.innerHTML = '';
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.text = 'Toque para selecionar...';
    defaultOpt.disabled = true;
    defaultOpt.selected = true;
    select.appendChild(defaultOpt);
    const listaValida = (Array.isArray(S.membros) && S.membros.length > 0) ? S.membros : [{ nome: 'Operador Principal' }];
    [...listaValida].sort((a, b) => (a.nome || '').localeCompare(b.nome || '')).forEach(membro => {
        if (membro && membro.nome) {
            const opt = document.createElement('option');
            opt.value = membro.nome;
            opt.innerText = membro.nome;
            select.appendChild(opt);
        }
    });
}

export function confirmarSelecaoMembro() {
    try {
        const nomeSelecionado = document.getElementById('select-membro').value;
        if (!nomeSelecionado) return showToast('Por favor, selecione um membro na lista.');
        fecharModal('modal-selecionar-membro');
        const preview = document.getElementById('preview-divida');
        if (preview) preview.innerText = '';
        if (S.contextoMembro === 'FIADO') registrarVendaOtimista('FIADO', nomeSelecionado);
        else if (S.contextoMembro === 'FECHAR_CONTA') carregarDadosFechamento(nomeSelecionado);
        else showToast('Ação indefinida.');
    } catch (e) { showToast(`Erro na seleção: ${e.message}`); }
}

export function fecharModalSelecaoMembro() {
    fecharModal('modal-selecionar-membro');
    const preview = document.getElementById('preview-divida');
    if (preview) preview.innerText = '';
}

export function carregarDadosFechamento(nome) {
    abrirModal('modal-fechar-conta');
    document.getElementById('nome-fechar-conta').innerText = nome;
    document.getElementById('lista-fechamento').innerHTML = 'Buscando...';
    API.buscarExtratoMembro(nome)
        .then(res => {
            S.dadosFechamentoAtual = { nome, itens: res.itens, total: res.total };
            let html = '';
            if (!res.itens.length) {
                html = '<p style="text-align:center">Sem pendências.</p>';
            } else {
                res.itens.forEach(i => {
                    html += `<div class="extrato-item">
                        <span>${i.qtd || 1}x ${esc(i.produto || i.descricao || 'Item')}</span>
                        <span>${formatCurrency(i.valor)}</span></div>`;
                });
            }
            document.getElementById('lista-fechamento').innerHTML = html;
            document.getElementById('total-fechamento').innerText = formatCurrency(res.total);
        })
        .catch(() => { showToast('Erro ao buscar dados.'); fecharModal('modal-fechar-conta'); });
}

/* ─── Operator ─── */

export function processarTrocaOperador(nomeInput) {
    if (!nomeInput || S.operadorAtual === nomeInput) return;
    if (S.carrinho.length > 0) return showToast('Conclua a venda em andamento antes de trocar o operador', 'err');
    UIModal.confirm('Confirma a troca de operador?', () => {
        S.operadorAtual = nomeInput;
        LocalDB.set('motoBarOperador', S.operadorAtual);
        atualizarUI();
    });
}

export function trocarMembro() {
    UIModal.confirm('Deseja sair do operador atual e voltar ao login?', () => {
        fecharModal('modal-relatorios');
        API.logout({
            preserveKeys: ['motoBarCaixaAberto', 'motoBarCaixaId', 'motoBarValorAbertura']
        }).then(() => {
            S.operadorAtual = '';
            S.usuarioAtual = null;
            S.inicioTurno = null;
            atualizarUI();
            atualizarEstadoBotoes();
            window.location.replace('/login');
        }).catch(() => window.location.replace('/login'));
    });
}

/* ─── Cash Register ─── */

export function abrirModalAberturaCaixa() {
    if (S.caixaAberto) return showToast('O caixa já está aberto!');
    fecharModal('modal-relatorios');
    abrirModal('modal-abertura-caixa');
    document.getElementById('input-valor-abertura').focus();
}

export function confirmarAberturaValor() {
    let val = parseFloat(document.getElementById('input-valor-abertura').value);
    if (isNaN(val)) val = 0;
    S.valorAbertura = val;
    S.caixaAberto = true;
    API.abrirCaixa(val)
        .then(res => { if (res.caixa_id) S.caixaId = res.caixa_id; salvarDadosLocais(); })
        .catch(err => console.error('Erro ao abrir caixa no servidor:', err));
    salvarDadosLocais();
    fecharModal('modal-abertura-caixa');
    showToast(`Caixa Aberto: ${formatCurrency(val)}`);
    atualizarEstadoBotoes();
}

/* ─── Config ─── */

export function abrirConfig() {
    abrirModal('modal-config');
    document.getElementById('cfg-imprimir').checked = S.config.imprimir;
    document.getElementById('cfg-largura').value = S.config.largura;
}

export function salvarConfig() {
    S.config.imprimir = document.getElementById('cfg-imprimir').checked;
    S.config.largura = document.getElementById('cfg-largura').value;
    LocalDB.set('motoBarConfig', JSON.stringify(S.config));
    fecharModal('modal-config');
}

/* ─── Queue ─── */

export function processarFilaVendas() {
    if (!Array.isArray(S.filaVendas) || S.filaVendas.length === 0) return;
    if (S.processandoFila) {
        if (Date.now() - S.lastProcessTime > 45000) S.processandoFila = false;
        else return;
    }
    S.processandoFila = true;
    S.lastProcessTime = Date.now();
    API.processarVenda(S.filaVendas[0])
        .then(res => {
            try {
                if (res && typeof res === 'string' && res.indexOf('Erro') === 0) {
                    showToast(`ALERTA: ${res} A venda foi descartada.`);
                }
                S.filaVendas.shift();
                salvarDadosLocais();
                setTimeout(processarFilaVendas, 100);
            } catch (e) { console.error('Erro no handler:', e); }
            finally { S.processandoFila = false; }
        })
        .catch(err => { console.error('Erro envio', err); S.processandoFila = false; });
}

export function sincronizarProdutosBackground() {
    if (S.filaVendas.length > 0) return;
    API.getProdutos()
        .then(dados => {
            if (dados && dados.produtos) {
                dados.produtos.forEach(pa => {
                    const pl = S.produtos.find(p => p.id === pa.id);
                    if (pl) { pl.estoque_bar = pa.estoque_bar; pl.estoque_deposito = pa.estoque_deposito; }
                });
                renderizarCatalogo();
            }
        })
        .catch(e => console.warn('Erro na sincronização silenciosa:', e));
}
