/** Consulta somente leitura compartilhada: filtros, resumo e paginação.
 * Recebe o adaptador HTTP de cada tela. Valores financeiros vêm do backend.
 * A geração da consulta descarta respostas antigas sem bloquear vendas.
 */
import { esc, formatCurrency } from './utils.js';

function dataValida(valor) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
    const data = new Date(`${valor}T12:00:00Z`);
    return Number.isFinite(data.getTime()) && data.toISOString().slice(0, 10) === valor && valor >= '0001-01-01';
}

function limiteMes(valor, fim = false) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(valor) || valor.startsWith('0000')) throw new Error('Informe um mês válido.');
    const [ano, mes] = valor.split('-').map(Number);
    const bissexto = ano % 4 === 0 && (ano % 100 !== 0 || ano % 400 === 0);
    const dias = [31, bissexto ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return `${valor}-${fim ? dias[mes - 1] : '01'}`;
}

export function periodoExtrato({ modo, mes, inicio, fim }) {
    if (modo === 'todos') return {};
    if (modo === 'mes') { inicio = limiteMes(mes); fim = limiteMes(mes, true); }
    else if (modo === 'meses') { inicio = limiteMes(inicio); fim = limiteMes(fim, true); }
    else if (modo !== 'datas') throw new Error('Selecione um período válido.');
    if (!dataValida(inicio) || !dataValida(fim) || fim === '9999-12-31') throw new Error('Informe início e fim válidos.');
    if (inicio > fim) throw new Error('O início do período deve ser anterior ou igual ao fim.');
    return { data_inicio: inicio, data_fim: fim };
}

const situacoes = { quitado: 'Quitado (FIFO)', parcial: 'Parcialmente quitado (FIFO)', em_aberto: 'Em aberto (FIFO)',
    pagamento: 'Pagamento recebido', credito: 'Crédito de ajuste', nao_identificado: 'Quitação não identificada' };
const origens = { venda_fiado: 'Venda pendurada', pagamento: 'Pagamento', ajuste_manual: 'Ajuste manual' };

export function criarConsultaExtrato(root, { buscar, notificar, administrar, aoCarregar } = {}) {
    const el = seletor => root.querySelector(seletor);
    const form = el('[data-filtros]');
    const campo = nome => form.elements.namedItem(nome);
    let membroId = null, geracao = 0, periodo = {}, offset = 0, resposta = null, emCurso = null, ultimaChave = null;
    const limite = 20;

    function controles() {
        const modo = campo('modo').value;
        const intervalo = ['meses', 'datas'].includes(modo);
        el('[data-campo="mes"]').classList.toggle('d-none', modo !== 'mes');
        for (const nome of ['inicio', 'fim']) {
            el(`[data-campo="${nome}"]`).classList.toggle('d-none', !intervalo);
            campo(nome).type = modo === 'meses' ? 'month' : 'date';
        }
    }

    function paginar(carregando = false) {
        el('[data-anterior]').disabled = carregando || !resposta || offset === 0;
        el('[data-proxima]').disabled = carregando || !resposta?.paginacao?.tem_mais;
        el('[data-aplicar]').disabled = !membroId;
        el('[data-limpar]').disabled = !membroId;
    }

    function renderizar(data) {
        el('[data-total-atual]').textContent = formatCurrency(data.total);
        const r = data.resumo;
        const cards = r ? [
            ['Total do período (débitos)', r.total_periodo, ''],
            ['Pago no período', r.total_pago_periodo, 'extrato-pago'],
            ['Em aberto no período (hoje)', r.total_aberto_periodo, ''],
        ] : [];
        el('[data-resumo]').innerHTML = cards.map(([titulo, valor, classe]) => `<div class="col-12 col-sm-4"><div class="extrato-resumo-card rounded p-3 h-100"><span class="small d-block">${titulo}</span><strong class="d-block mt-1 ${classe}">${valor == null ? 'Não identificado' : formatCurrency(valor)}</strong></div></div>`).join('');
        if (r?.total_creditos_ajuste_periodo) el('[data-resumo]').insertAdjacentHTML('beforeend', `<p class="small mb-0">Créditos de ajuste no período: ${formatCurrency(r.total_creditos_ajuste_periodo)} (não são pagamentos).</p>`);
        el('[data-aviso]').textContent = data.aviso || '';
        el('[data-aviso]').classList.toggle('d-none', !data.aviso);
        const formatarData = valor => valor.split('-').reverse().join('/');
        el('[data-periodo]').textContent = periodo.data_inicio ? `Período: ${formatarData(periodo.data_inicio)} a ${formatarData(periodo.data_fim)}` : 'Todo o histórico';
        el('[data-estado]').textContent = data.itens.length ? '' : 'Nenhum lançamento encontrado para o período selecionado.';
        el('[data-itens]').innerHTML = data.itens.map(i => `<article class="extrato-movimento rounded p-3 mb-2">
            <div class="d-flex flex-wrap justify-content-between gap-2"><strong>${esc(i.descricao || 'Movimentação')}</strong><strong>${formatCurrency(i.valor)}</strong></div>
            <div class="d-flex flex-wrap justify-content-between gap-2 small mt-2"><span>${esc(i.data)} · ${i.tipo === 'debito' ? 'Débito' : i.tipo === 'credito' ? 'Crédito' : 'Ajuste'} · ${esc(origens[i.origem] || i.origem || '')}</span><span class="${['quitado', 'pagamento', 'credito'].includes(i.situacao) ? 'extrato-pago' : ''}">${esc(situacoes[i.situacao] || 'Quitação não identificada')}</span></div>
            ${i.valor_aberto != null ? `<p class="small mb-0 mt-2">Abatido: ${formatCurrency(i.valor_abatido)} · Em aberto: ${formatCurrency(i.valor_aberto)}</p>` : ''}
            ${administrar ? `<div class="d-flex flex-wrap gap-2 mt-2"><button type="button" class="btn btn-sm btn-outline-light" data-movimento="${esc(i.id)}" data-acao="editar">Editar</button><button type="button" class="btn btn-sm btn-del" data-movimento="${esc(i.id)}" data-acao="excluir">Excluir</button></div>` : ''}
        </article>`).join('');
        el('[data-pagina]').textContent = data.itens.length ? `${offset + 1}–${offset + data.itens.length} de ${data.paginacao?.total ?? data.itens.length}` : '';
        paginar();
    }

    async function carregar(forcar = false) {
        if (!membroId) return;
        const id = membroId, parametros = { ...periodo, limite, offset };
        const chave = JSON.stringify([id, parametros]);
        if (!forcar && (emCurso === chave || (resposta && ultimaChave === chave))) return;
        const atual = ++geracao;
        emCurso = chave;
        resposta = null;
        el('[data-itens]').replaceChildren();
        el('[data-resumo]').replaceChildren();
        el('[data-pagina]').textContent = '';
        el('[data-aviso]').classList.add('d-none');
        el('[data-estado]').textContent = 'Carregando lançamentos...';
        root.setAttribute('aria-busy', 'true');
        paginar(true);
        try {
            const data = await buscar(id, parametros);
            if (atual !== geracao) return;
            if (!data || !Array.isArray(data.itens)) throw new Error('Não foi possível carregar o extrato. Tente novamente.');
            resposta = data;
            ultimaChave = chave;
            renderizar(data);
            aoCarregar?.(data);
        } catch (erro) {
            if (atual !== geracao) return;
            ultimaChave = null;
            el('[data-estado]').textContent = 'Não foi possível carregar o extrato. Use Aplicar filtro para tentar novamente.';
            notificar?.(erro.message);
        } finally {
            if (atual === geracao) { emCurso = null; root.setAttribute('aria-busy', 'false'); paginar(); }
        }
    }

    function limpar() {
        form.reset(); controles(); periodo = {}; offset = 0;
    }
    form.addEventListener('change', event => { if (event.target.name === 'modo') controles(); });
    form.addEventListener('submit', event => {
        event.preventDefault();
        try {
            periodo = periodoExtrato(Object.fromEntries(new FormData(form)));
            offset = 0;
            void carregar();
        } catch (erro) { notificar?.(erro.message); }
    });
    el('[data-limpar]').onclick = () => { limpar(); void carregar(); };
    el('[data-anterior]').onclick = () => { offset = Math.max(0, offset - limite); void carregar(); };
    el('[data-proxima]').onclick = () => { offset += limite; void carregar(); };
    el('[data-itens]').onclick = event => {
        const btn = event.target.closest('[data-movimento]');
        const item = resposta?.itens.find(i => i.id === btn?.dataset.movimento);
        if (item) administrar?.(membroId, item, btn.dataset.acao);
    };
    controles(); paginar();
    return {
        selecionar(id) {
            ++geracao; membroId = id; resposta = null; emCurso = null; ultimaChave = null;
            limpar();
            root.setAttribute('aria-busy', 'false');
            el('[data-total-atual]').textContent = '—';
            el('[data-itens]').replaceChildren(); el('[data-resumo]').replaceChildren();
            el('[data-aviso]').classList.add('d-none'); el('[data-pagina]').textContent = '';
            el('[data-periodo]').textContent = 'Todo o histórico';
            el('[data-estado]').textContent = 'Selecione um membro para consultar.';
            paginar();
            return carregar();
        },
        atualizar: () => carregar(true),
    };
}
