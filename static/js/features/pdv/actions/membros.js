/**
 * Seleção de membro, extrato e preparação de venda fiada no PDV.
 * Reutiliza pagamentos.js; identidade financeira é membro_id, nunca apenas o nome.
 */
import { API } from '../../../shared/api.js';
import { S } from '../state.js';
import { esc, formatCurrency } from '../../../shared/utils.js';
import { showToast, fecharModal, abrirModal } from '../ui.js';
import { registrarVendaOtimista } from './pagamentos.js';

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
    const listaValida = Array.isArray(S.membros) ? S.membros : [];
    [...listaValida].sort((a, b) => (a.nome || '').localeCompare(b.nome || '')).forEach(membro => {
        if (membro && membro.nome) {
            const opt = document.createElement('option');
            opt.value = membro.id;
            opt.innerText = membro.nome;
            select.appendChild(opt);
        }
    });
}

export function confirmarSelecaoMembro() {
    try {
        const membroId = document.getElementById('select-membro').value;
        const membro = S.membros.find(m => m.id === membroId);
        if (!membro) return showToast('Por favor, selecione um membro na lista.');
        fecharModal('modal-selecionar-membro');
        const preview = document.getElementById('preview-divida');
        if (preview) preview.innerText = '';
        if (S.contextoMembro === 'FIADO') registrarVendaOtimista('FIADO', membro.nome, membro.id);
        else if (S.contextoMembro === 'FECHAR_CONTA') carregarDadosFechamento(membro);
        else showToast('Ação indefinida.');
    } catch (e) { showToast(`Erro na seleção: ${e.message}`); }
}

export function fecharModalSelecaoMembro() {
    fecharModal('modal-selecionar-membro');
    const preview = document.getElementById('preview-divida');
    if (preview) preview.innerText = '';
}

export function carregarDadosFechamento(membro) {
    abrirModal('modal-fechar-conta');
    document.getElementById('nome-fechar-conta').innerText = membro.nome;
    document.getElementById('lista-fechamento').innerHTML = 'Buscando...';
    API.buscarExtratoMembro(membro.id)
        .then(res => {
            S.dadosFechamentoAtual = { nome: membro.nome, membro_id: membro.id, itens: res.itens, total: res.total };
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
