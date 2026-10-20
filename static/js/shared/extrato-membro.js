/** Consulta somente leitura compartilhada: filtros, resumo e paginação.
 * Recebe o adaptador HTTP de cada tela. Valores financeiros vêm do backend.
 * A geração da consulta descarta respostas antigas sem bloquear vendas.
 */
import { esc, formatCurrency } from './utils.js';

function dataValida(dataTexto) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataTexto)) return false;
    const data = new Date(`${dataTexto}T12:00:00Z`);
    return Number.isFinite(data.getTime()) && data.toISOString().slice(0, 10) === dataTexto && dataTexto >= '0001-01-01';
}

export function periodoExtrato({ modo: modoPeriodo, inicio: dataInicio, fim: dataFim }) {
    if (modoPeriodo === 'todos') return {};
    if (modoPeriodo !== 'datas') throw new Error('Selecione um período válido.');
    if (!dataValida(dataInicio) || !dataValida(dataFim)) throw new Error('Informe início e fim válidos.');
    if (dataInicio > dataFim) throw new Error('O início do período deve ser anterior ou igual ao fim.');
    return { data_inicio: dataInicio, data_fim: dataFim };
}

const rotulosSituacoes = { quitado: 'Quitado', parcial: 'Parcialmente pago', em_aberto: 'Em aberto',
    pagamento: 'Pagamento recebido', credito: 'Crédito de ajuste', nao_identificado: 'Quitação não identificada' };
const rotulosOrigens = { venda_fiado: 'Venda pendurada', pagamento: 'Pagamento', ajuste_manual: 'Ajuste manual' };

export function criarConsultaExtrato(elementoRaiz, { buscar, notificar, administrar, aoCarregar } = {}) {
    const buscarElemento = seletor => elementoRaiz.querySelector(seletor);
    const formularioFiltros = buscarElemento('[data-filtros]');
    const buscarCampoFiltro = nomeCampo => formularioFiltros.elements.namedItem(nomeCampo);
    let membroId = null, geracaoConsulta = 0, periodoSelecionado = {}, deslocamentoPagina = 0, respostaExtrato = null, chaveConsultaEmCurso = null, ultimaChaveConsulta = null;
    const limitePagina = 20;

    function controles() {
        const modoPeriodo = buscarCampoFiltro('modo').value;
        for (const nomeCampo of ['inicio', 'fim']) buscarElemento(`[data-campo="${nomeCampo}"]`).classList.toggle('d-none', modoPeriodo !== 'datas');
    }

    function paginar(carregando = false) {
        buscarElemento('[data-anterior]').disabled = carregando || !respostaExtrato || deslocamentoPagina === 0;
        buscarElemento('[data-proxima]').disabled = carregando || !respostaExtrato?.paginacao?.tem_mais;
        buscarElemento('[data-aplicar]').disabled = !membroId;
        buscarElemento('[data-limpar]').disabled = !membroId;
    }

    function renderizar(dadosExtrato) {
        buscarElemento('[data-total-atual]').textContent = formatCurrency(dadosExtrato.total);
        const resumoPeriodo = dadosExtrato.resumo;
        const cartoesResumo = resumoPeriodo ? [
            ['Total do período (débitos)', resumoPeriodo.total_periodo, ''],
            ['Pago no período', resumoPeriodo.total_pago_periodo, 'extrato-pago'],
            ['Em aberto no período (hoje)', resumoPeriodo.total_aberto_periodo, ''],
        ] : [];
        buscarElemento('[data-resumo]').innerHTML = cartoesResumo.map(([tituloResumo, valorResumo, classeResumo]) => `<div class="col-12 col-sm-4"><div class="extrato-resumo-card rounded p-3 h-100"><span class="small d-block">${tituloResumo}</span><strong class="d-block mt-1 ${classeResumo}">${valorResumo == null ? 'Não identificado' : formatCurrency(valorResumo)}</strong></div></div>`).join('');
        if (resumoPeriodo?.total_creditos_ajuste_periodo) buscarElemento('[data-resumo]').insertAdjacentHTML('beforeend', `<p class="small mb-0">Créditos de ajuste no período: ${formatCurrency(resumoPeriodo.total_creditos_ajuste_periodo)} (não são pagamentos).</p>`);
        buscarElemento('[data-aviso]').textContent = dadosExtrato.aviso || '';
        buscarElemento('[data-aviso]').classList.toggle('d-none', !dadosExtrato.aviso);
        const formatarData = dataTexto => dataTexto.split('-').reverse().join('/');
        buscarElemento('[data-periodo]').textContent = periodoSelecionado.data_inicio ? `Período: ${formatarData(periodoSelecionado.data_inicio)} a ${formatarData(periodoSelecionado.data_fim)}` : 'Todo o histórico';
        buscarElemento('[data-estado]').textContent = dadosExtrato.itens.length ? '' : 'Nenhum lançamento encontrado para o período selecionado.';
        buscarElemento('[data-itens]').innerHTML = dadosExtrato.itens.map(movimento => `<article class="extrato-movimento rounded p-3 mb-2">
            <div class="d-flex flex-wrap justify-content-between gap-2"><strong>${esc(movimento.descricao || 'Movimentação')}</strong><strong>${formatCurrency(movimento.valor)}</strong></div>
            <div class="d-flex flex-wrap justify-content-between gap-2 small mt-2"><span>${esc(movimento.data)} · ${movimento.tipo === 'debito' ? 'Débito' : movimento.tipo === 'credito' ? 'Crédito' : 'Ajuste'} · ${esc(rotulosOrigens[movimento.origem] || movimento.origem || '')}</span><span class="${['quitado', 'pagamento', 'credito'].includes(movimento.situacao) ? 'extrato-pago' : ''}">${esc(rotulosSituacoes[movimento.situacao] || 'Quitação não identificada')}</span></div>
            ${movimento.valor_aberto != null ? `<p class="small mb-0 mt-2">Abatido: ${formatCurrency(movimento.valor_abatido)} · Em aberto: ${formatCurrency(movimento.valor_aberto)}</p>` : ''}
            ${administrar ? `<div class="d-flex flex-wrap gap-2 mt-2"><button type="button" class="btn btn-sm btn-outline-light" data-movimento="${esc(movimento.id)}" data-acao="editar">Editar</button><button type="button" class="btn btn-sm btn-del" data-movimento="${esc(movimento.id)}" data-acao="excluir">Excluir</button></div>` : ''}
        </article>`).join('');
        buscarElemento('[data-pagina]').textContent = dadosExtrato.itens.length ? `${deslocamentoPagina + 1}–${deslocamentoPagina + dadosExtrato.itens.length} de ${dadosExtrato.paginacao?.total ?? dadosExtrato.itens.length}` : '';
        paginar();
    }

    async function carregar(forcarAtualizacao = false) {
        if (!membroId) return;
        const membroConsultadoId = membroId, parametrosConsulta = { ...periodoSelecionado, limite: limitePagina, offset: deslocamentoPagina };
        const chaveConsulta = JSON.stringify([membroConsultadoId, parametrosConsulta]);
        if (!forcarAtualizacao && (chaveConsultaEmCurso === chaveConsulta || (respostaExtrato && ultimaChaveConsulta === chaveConsulta))) return;
        const geracaoAtual = ++geracaoConsulta;
        chaveConsultaEmCurso = chaveConsulta;
        respostaExtrato = null;
        buscarElemento('[data-itens]').replaceChildren();
        buscarElemento('[data-resumo]').replaceChildren();
        buscarElemento('[data-pagina]').textContent = '';
        buscarElemento('[data-aviso]').classList.add('d-none');
        buscarElemento('[data-estado]').textContent = 'Carregando lançamentos...';
        elementoRaiz.setAttribute('aria-busy', 'true');
        paginar(true);
        try {
            const dadosExtrato = await buscar(membroConsultadoId, parametrosConsulta);
            if (geracaoAtual !== geracaoConsulta) return;
            if (!dadosExtrato || !Array.isArray(dadosExtrato.itens)) throw new Error('Não foi possível carregar o extrato. Tente novamente.');
            respostaExtrato = dadosExtrato;
            ultimaChaveConsulta = chaveConsulta;
            renderizar(dadosExtrato);
            aoCarregar?.(dadosExtrato);
        } catch (erro) {
            if (geracaoAtual !== geracaoConsulta) return;
            ultimaChaveConsulta = null;
            buscarElemento('[data-estado]').textContent = 'Não foi possível carregar o extrato. Use Aplicar filtro para tentar novamente.';
            notificar?.(erro.message);
        } finally {
            if (geracaoAtual === geracaoConsulta) { chaveConsultaEmCurso = null; elementoRaiz.setAttribute('aria-busy', 'false'); paginar(); }
        }
    }

    function limpar() {
        formularioFiltros.reset(); controles(); periodoSelecionado = {}; deslocamentoPagina = 0;
    }
    formularioFiltros.addEventListener('change', eventoFormulario => { if (eventoFormulario.target.name === 'modo') controles(); });
    formularioFiltros.addEventListener('submit', eventoFormulario => {
        eventoFormulario.preventDefault();
        try {
            periodoSelecionado = periodoExtrato(Object.fromEntries(new FormData(formularioFiltros)));
            deslocamentoPagina = 0;
            void carregar();
        } catch (erro) { notificar?.(erro.message); }
    });
    buscarElemento('[data-limpar]').onclick = () => { limpar(); void carregar(); };
    buscarElemento('[data-anterior]').onclick = () => { deslocamentoPagina = Math.max(0, deslocamentoPagina - limitePagina); void carregar(); };
    buscarElemento('[data-proxima]').onclick = () => { deslocamentoPagina += limitePagina; void carregar(); };
    buscarElemento('[data-itens]').onclick = eventoClique => {
        const botaoAcao = eventoClique.target.closest('[data-movimento]');
        const movimentoSelecionado = respostaExtrato?.itens.find(movimento => movimento.id === botaoAcao?.dataset.movimento);
        if (movimentoSelecionado) administrar?.(membroId, movimentoSelecionado, botaoAcao.dataset.acao);
    };
    controles(); paginar();
    return {
        selecionar(membroSelecionadoId) {
            ++geracaoConsulta; membroId = membroSelecionadoId; respostaExtrato = null; chaveConsultaEmCurso = null; ultimaChaveConsulta = null;
            limpar();
            elementoRaiz.setAttribute('aria-busy', 'false');
            buscarElemento('[data-total-atual]').textContent = '—';
            buscarElemento('[data-itens]').replaceChildren(); buscarElemento('[data-resumo]').replaceChildren();
            buscarElemento('[data-aviso]').classList.add('d-none'); buscarElemento('[data-pagina]').textContent = '';
            buscarElemento('[data-periodo]').textContent = 'Todo o histórico';
            buscarElemento('[data-estado]').textContent = 'Selecione um membro para consultar.';
            paginar();
            return carregar();
        },
        atualizar: () => carregar(true),
    };
}
