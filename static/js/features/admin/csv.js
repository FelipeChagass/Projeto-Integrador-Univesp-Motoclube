/** CSV para planilhas: UTF-8, separador brasileiro e proteção contra fórmulas. */
export function criarCsv(vendas) {
    const celula = valor => {
        let texto = String(valor ?? '');
        if (/^[\s]*[=+\-@]/.test(texto) || /^[\t\r\n]/.test(texto)) texto = `'${texto}`;
        return `"${texto.replace(/"/g, '""')}"`;
    };
    const linhas = [['Data', 'Tipo', 'Pagamento', 'Operador', 'Cliente', 'Valor (R$)', 'Itens']];
    vendas.forEach(v => linhas.push([
        v.criado_em ? new Date(v.criado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '',
        v.tipo_venda, v.metodo_pagamento, v.usuario_nome, v.nome_cliente,
        Number(v.valor_total).toFixed(2).replace('.', ','),
        (v.itens || []).map(i => `${i.quantidade}x ${i.nome_produto}`).join(', '),
    ]));
    return '\uFEFF' + linhas.map(linha => linha.map(celula).join(';')).join('\r\n');
}
