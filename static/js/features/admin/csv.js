/** CSV para planilhas: UTF-8, separador brasileiro e proteção contra fórmulas. */
export function criarCsv(vendas) {
    const celula = valor => {
        let texto = String(valor ?? '');
        if (/^[\s]*[=+\-@]/.test(texto) || /^[\t\r\n]/.test(texto)) texto = `'${texto}`;
        return `"${texto.replace(/"/g, '""')}"`;
    };
    const linhas = [['Data', 'Tipo', 'Pagamento', 'Operador', 'Cliente', 'Valor (R$)', 'Itens']];
    vendas.forEach(venda => linhas.push([
        venda.criado_em ? new Date(venda.criado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '',
        venda.tipo_venda, venda.metodo_pagamento, venda.usuario_nome, venda.nome_cliente,
        Number(venda.valor_total).toFixed(2).replace('.', ','),
        (venda.itens || []).map(itemVenda => `${itemVenda.quantidade}x ${itemVenda.nome_produto}`).join(', '),
    ]));
    return '\uFEFF' + linhas.map(linha => linha.map(celula).join(';')).join('\r\n');
}
