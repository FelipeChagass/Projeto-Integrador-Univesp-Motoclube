import { API, UIModal } from './api.js';
import { S, salvarDadosLocais } from './state.js';
import { esc, formatCurrency } from './utils.js';
import { showToast, fecharModal, atualizarUI, renderizarCatalogo, atualizarEstadoBotoes } from './ui.js';

/* ─── Reports ─── */

export function abrirMenuRelatorios() {
    if (!S.operadorAtual) return showToast('Faça login primeiro.');
    document.getElementById('modal-relatorios').style.display = 'flex';
    document.getElementById('resultado-relatorio').classList.add('d-none');
    document.getElementById('nome-operador-atual').innerText = S.operadorAtual;
    const hoje = new Date();
    const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    document.getElementById('data-inicio').value = primeiroDia.toISOString().split('T')[0];
    document.getElementById('data-fim').value = hoje.toISOString().split('T')[0];
}

export function gerarRelatorio(tipo) {
    document.getElementById('loading').style.display = 'flex';
    let filtro = {};
    if (tipo === 'TURNO') {
        filtro = {
            operador: S.operadorAtual,
            inicio: S.inicioTurno ? S.inicioTurno.toString() : new Date().toString()
        };
    }
    S.tipoRelatorioAtual = tipo;
    executarRelatorio(tipo, filtro);
}

export function gerarRelatorioPeriodo() {
    const ini = document.getElementById('data-inicio').value;
    const fim = document.getElementById('data-fim').value;
    if (!ini || !fim) return showToast('Selecione as datas.');
    document.getElementById('loading').style.display = 'flex';
    S.tipoRelatorioAtual = 'PERIODO';
    executarRelatorio('PERIODO', { inicio: ini, fim: fim });
}

export function executarRelatorio(tipo, filtro) {
    document.getElementById('resultado-relatorio').innerHTML = '';
    document.getElementById('resultado-relatorio').classList.add('d-none');
    API.gerarRelatorioCaixa(tipo, filtro)
        .then(res => {
            S.dadosRelatorioAtual = res;
            document.getElementById('loading').style.display = 'none';
            if (!res) return showToast('Erro: O relatório retornou vazio.');
            document.getElementById('resultado-relatorio').classList.remove('d-none');

            let saldoIni = 0;
            if (S.tipoRelatorioAtual === 'PERIODO') {
                saldoIni = Number(res.abertura) || 0;
            } else if ((tipo === 'TURNO' || tipo === 'DIA') && S.caixaAberto) {
                saldoIni = Number(S.valorAbertura) || 0;
            }
            const dinheiro = Number(res.dinheiro) || 0;
            const pix = Number(res.pix) || 0;
            const cartao = Number(res.cartao) || 0;
            const recebimentoDivida = Number(res.recebimentoDivida) || 0;
            const vendasFiado = Number(res.vendasFiado) || 0;
            const totalEntradas = dinheiro + pix + cartao + recebimentoDivida;
            const totalGeralCaixa = totalEntradas + saldoIni;

            let htmlCupom = `
                <div class="cupom-visual">
                    <div style="text-align:center; font-weight:bold; margin-bottom:10px; border-bottom:1px dashed #000; padding-bottom:5px;">
                        RELATÓRIO DE CAIXA<br>${esc(res.periodo)}
                    </div>
                    <div style="border-bottom:1px dashed #555; padding:5px 0; font-weight:bold; color:var(--accent);">RESUMO FINANCEIRO</div>
                    <div class="relatorio-linha"><span>(+) Fundo de Caixa:</span><span>${formatCurrency(saldoIni)}</span></div>
                    <div class="relatorio-linha"><span>(+) Vendas Dinheiro:</span><span>${formatCurrency(dinheiro)}</span></div>
                    <div class="relatorio-linha"><span>(+) Vendas Pix:</span><span>${formatCurrency(pix)}</span></div>
                    <div class="relatorio-linha"><span>(+) Vendas Cartão:</span><span>${formatCurrency(cartao)}</span></div>
                    <div class="relatorio-linha"><span>(+) Receb. Dívidas:</span><span>${formatCurrency(recebimentoDivida)}</span></div>
                    <div class="relatorio-linha" style="border-top:1px solid #777; margin-top:5px; padding-top:5px; font-weight:bold; font-size:1.1em; color:var(--success);">
                        <span>(=) TOTAL EM CAIXA:</span><span>${formatCurrency(totalGeralCaixa)}</span>
                    </div>
                    <div style="border-bottom:1px dashed #555; padding:5px 0; margin-top:15px; font-weight:bold; color:var(--danger);">MOVIMENTAÇÃO FIADO</div>
                    <div class="relatorio-linha"><span>(>) Total Vendido Fiado:</span><span>${formatCurrency(vendasFiado)}</span></div>`;

            if (res.produtosVendidos && typeof res.produtosVendidos === 'object') {
                const keys = Object.keys(res.produtosVendidos);
                if (keys.length > 0) {
                    htmlCupom += `<br><div style="text-align:center; font-weight:bold; border-bottom:1px dashed #000;">ITENS VENDIDOS</div>
                        <table style="width:100%; font-size:0.9em; margin-top:5px;">`;
                    for (const prod in res.produtosVendidos) {
                        htmlCupom += `<tr><td>${esc(prod)}</td><td style="text-align:right">${res.produtosVendidos[prod]}</td></tr>`;
                    }
                    htmlCupom += '</table>';
                }
            }
            if (res.historico && Array.isArray(res.historico) && res.historico.length > 0) {
                htmlCupom += `<br><div style="text-align:center; font-weight:bold; border-bottom:1px dashed #000; margin-top:10px;">HISTÓRICO COMPLETO</div>
                    <table style="width:100%; font-size:0.8em; margin-top:5px; border-collapse: collapse;">
                    <tr style="background:#ddd; font-weight:bold;"><td style="padding:2px;">Hora</td><td style="padding:2px;">Desc.</td><td style="padding:2px;">Valor</td></tr>`;
                res.historico.forEach(h => {
                    const metodoStr = h.metodo || '';
                    const cor = metodoStr.includes('FIADO') ? 'red' : (h.tipo === 'RECEBIMENTO' ? 'green' : 'inherit');
                    htmlCupom += `<tr style="border-bottom:1px solid #eee; color:${cor}">
                        <td style="padding:2px;">${esc(h.hora || '')}</td>
                        <td style="padding:2px;">${esc(h.descricao || '')}</td>
                        <td style="padding:2px; text-align:right">${Number(h.valor).toFixed(2)}</td></tr>`;
                });
                htmlCupom += '</table>';
            }
            htmlCupom += '</div>';

            const resultadoEl = document.getElementById('resultado-relatorio');
            resultadoEl.innerHTML = `${htmlCupom}<br><button id="btn-imprimir-rel" class="btn-action btn-dinheiro w-100">IMPRIMIR RELATORIO</button>`;
            document.getElementById('btn-imprimir-rel').addEventListener('click', imprimirRelatorioAtual);

            if (tipo === 'TURNO' || tipo === 'DIA') {
                const btnFechamento = document.createElement('button');
                btnFechamento.id = 'btn-confirmar-fechamento';
                btnFechamento.className = 'btn-action w-100 mt-2';
                btnFechamento.textContent = 'CONFIRMAR FECHAMENTO E SAIR';
                btnFechamento.addEventListener('click', confirmarFechamentoCaixa);
                resultadoEl.appendChild(btnFechamento);
            }
        })
        .catch(e => {
            document.getElementById('loading').style.display = 'none';
            showToast(`Erro ao gerar relatório: ${e.message || e}`);
        });
}

/* ─── Cash Register Closing ─── */

export function confirmarFechamentoCaixa() {
    if (!S.caixaId) return showToast('Nenhum caixa aberto identificado.');
    document.getElementById('input-valor-fechamento').value = '';
    document.getElementById('input-obs-fechamento').value = '';
    document.getElementById('modal-fechar-caixa').style.display = 'flex';
    document.getElementById('input-valor-fechamento').focus();
}

export function executarFechamentoCaixa() {
    const valorInput = document.getElementById('input-valor-fechamento').value;
    const obsInput = document.getElementById('input-obs-fechamento').value.trim();
    const valorFechamento = valorInput !== '' ? parseFloat(valorInput) : null;
    if (valorFechamento !== null && (isNaN(valorFechamento) || valorFechamento < 0)) {
        return showToast('Informe um valor em caixa válido.');
    }
    fecharModal('modal-fechar-caixa');
    API.fecharCaixa(S.caixaId, valorFechamento, obsInput || null)
        .catch(e => console.error('Erro ao fechar caixa no servidor:', e));

    S.caixaAberto = false;
    S.valorAbertura = 0;
    S.caixaId = null;
    S.operadorAtual = '';
    S.usuarioAtual = null;
    S.inicioTurno = null;
    S.carrinho = [];
    atualizarUI();
    fecharModal('modal-relatorios');
    atualizarEstadoBotoes();
    API.logout().then(() => window.location.replace('/login'))
        .catch(() => window.location.replace('/login'));
}

/* ─── Printing ─── */

export function imprimirArea() {
    window.focus();
    setTimeout(() => window.print(), 1500);
}

export function montarImpressao(itens, metodo, cliente) {
    const area = document.getElementById('area-impressao');
    let html = '';
    const data = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const imgTag = '<div style="text-align:center; margin-bottom:10px"><img src="/static/img/motorhead.png" style="width:70px; height:70px; filter: grayscale(100%);"></div>';
    const clienteEsc = esc(cliente.toUpperCase());

    itens.forEach(item => {
        const prod = S.produtos.find(p => p.id == item.id);
        const categoria = prod ? prod.categoria : '';
        const isComida = (categoria && categoria.toUpperCase() === 'COMIDA');
        const obsHtml = item.obs ? `<span class="ticket-obs">${esc(item.obs.toUpperCase())}</span>` : '';
        for (let i = 0; i < item.qtd; i++) {
            html += `<div class="ticket ${S.config.largura}">${imgTag}
                <div class="ticket-content">
                    <div class="ticket-header">MOTORHEAD • ${esc(data)}</div>
                    <span class="ticket-item">${esc(item.nome)}</span>
                    ${obsHtml}
                    <div class="ticket-info">CLI: <b>${clienteEsc}</b> | ${esc(metodo)}</div>
                    ${isComida ? '<div style="font-size:0.8em; margin-top:5px">VIA CLIENTE</div>' : ''}
                </div></div>`;
            if (isComida) {
                html += `<div class="ticket ${S.config.largura}">${imgTag}
                    <div class="ticket-content">
                        <div class="ticket-header">COZINHA • ${esc(data)}</div>
                        <span class="ticket-item">${esc(item.nome)}</span>
                        ${obsHtml}
                        <div class="ticket-info">CLI: <b>${clienteEsc}</b></div>
                        <div style="font-size:0.9em; margin-top:5px; font-weight:bold">VIA COZINHA</div>
                    </div></div>`;
            }
        }
    });
    area.innerHTML = html;
}

export function imprimirRelatorioAtual() {
    if (!S.dadosRelatorioAtual) return;
    const area = document.getElementById('area-impressao');
    let saldoIni = 0;
    if (S.tipoRelatorioAtual === 'PERIODO') saldoIni = Number(S.dadosRelatorioAtual.abertura) || 0;
    else if (S.caixaAberto) saldoIni = Number(S.valorAbertura) || 0;

    const dinheiro = Number(S.dadosRelatorioAtual.dinheiro) || 0;
    const pix = Number(S.dadosRelatorioAtual.pix) || 0;
    const cartao = Number(S.dadosRelatorioAtual.cartao) || 0;
    const recebimentoDivida = Number(S.dadosRelatorioAtual.recebimentoDivida) || 0;
    const totalGeral = dinheiro + pix + cartao + recebimentoDivida + saldoIni;

    let htmlHistorico = '';
    if (S.dadosRelatorioAtual.historico && S.dadosRelatorioAtual.historico.length > 0) {
        htmlHistorico = '<br><div style="border-bottom:1px dashed black; font-weight:bold; text-align:center">EXTRATO DETALHADO</div>';
        S.dadosRelatorioAtual.historico.forEach(h => {
            const symbol = h.metodo.includes('FIADO') ? '(!)' : '';
            let horaShow = '';
            if (h.data) horaShow = h.data.split(' ')[1] || h.data;
            else if (h.hora) horaShow = h.hora.split(' ')[1] || h.hora;
            else if (h.dataHora) horaShow = h.dataHora.split(' ')[1] || h.dataHora;
            htmlHistorico += `<div style="font-size:0.8em; border-bottom:1px dotted #ccc; margin-bottom:2px;">
                ${esc(horaShow)} ${esc(h.descricao.substring(0, 15))}... ${symbol}
                <br><div style="text-align:right">${Number(h.valor).toFixed(2)} (${esc(h.metodo.substring(0, 3))})</div></div>`;
        });
    }
    area.innerHTML = `<div class="sheet-a4">
        <div class="ticket-header">RELATÓRIO DE CAIXA</div>
        <div class="ticket-header" style="font-size:1em">${esc(S.dadosRelatorioAtual.periodo)}</div>
        <div style="border-bottom:1px solid black; margin:10px 0"></div>
        <div style="text-align:left; font-weight:bold; margin-top:5px;">RESUMO FINANCEIRO</div>
        <div class="relatorio-linha"><span>(+) Saldo Inicial:</span><span>${formatCurrency(saldoIni)}</span></div>
        <div class="relatorio-linha"><span>(+) Dinheiro:</span><span>${formatCurrency(dinheiro)}</span></div>
        <div class="relatorio-linha"><span>(+) Pix:</span><span>${formatCurrency(pix)}</span></div>
        <div class="relatorio-linha"><span>(+) Cartão:</span><span>${formatCurrency(cartao)}</span></div>
        <div class="relatorio-linha"><span>(+) Receb. Dívidas:</span><span>${formatCurrency(recebimentoDivida)}</span></div>
        <div style="border-top:1px solid black; margin:5px 0"></div>
        <div class="relatorio-linha" style="font-weight:bold; font-size:1.3em"><span>(=) TOTAL CAIXA:</span><span>${formatCurrency(totalGeral)}</span></div>
        <div style="border-bottom:1px dashed black; margin:10px 0"></div>
        <div style="text-align:left; font-weight:bold;">MOVIMENTAÇÃO FIADO</div>
        <div class="relatorio-linha"><span>(>) Total Vendido Fiado:</span><span>${formatCurrency(S.dadosRelatorioAtual.vendasFiado)}</span></div>
        ${htmlHistorico}
        <br><br><br>
        <div style="border-top:1px solid black; width:60%; margin:0 auto"></div>
        <div style="text-align:center; font-size:0.8em; margin-top:5px">Assinatura Responsável</div>
    </div>`;
    imprimirArea();
}

export function montarImpressaoFechamento(dados) {
    const area = document.getElementById('area-impressao');
    const data = new Date().toLocaleTimeString('pt-BR');
    const imgTag = '<div style="text-align:center; margin-bottom:10px"><img src="/static/img/motorhead.png" style="width:70px; height:70px; filter: grayscale(100%);"></div>';
    let itensHtml = '';
    dados.itens.forEach(i => {
        itensHtml += `<div class="extrato-print-item"><span>${i.qtd}x ${esc(i.produto)}</span><span>${i.valor.toFixed(2)}</span></div>`;
    });
    area.innerHTML = `<div class="ticket ${S.config.largura}">${imgTag}
        <div class="ticket-content">
            <div class="ticket-header">RECIBO PAGAMENTO</div>
            <div class="ticket-header">MOTORHEAD</div>
            <div style="border-bottom:1px solid black; margin:5px 0"></div>
            <div>Membro: <b>${esc(dados.nome.toUpperCase())}</b></div>
            <div>Data: ${esc(data)}</div>
            <div style="margin-top:10px">${itensHtml}</div>
            <div class="extrato-print-total">TOTAL PAGO: ${formatCurrency(dados.total)}</div>
            <div style="text-align:right; font-size:0.9em; margin-top:5px">Forma: ${esc(dados.metodo || 'DINHEIRO')}</div>
            <div style="text-align:center; margin-top:10px; font-size:0.8em">Conta Quitada</div>
        </div></div>`;
}
