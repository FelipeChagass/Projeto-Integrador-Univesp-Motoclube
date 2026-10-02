"""Consulta financeira paginada. FIFO informativo em SQL, sem alterar saldo ou baixa.

Todos os créditos (inclusive ajustes) abatem débitos antigos. Pagamentos recebidos
no período são distintos do abatimento atual dos débitos originados no período.
Histórico incompatível com o saldo oficial não recebe quitações presumidas.
"""
from datetime import datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import case, func

from app.models.movimentacao_membro import MovimentacaoMembro as Movimento

FUSO = ZoneInfo('America/Sao_Paulo')


def consultar_extrato(db, membro, filtro):
    debito = case((Movimento.tipo_movimentacao == 'debito', Movimento.valor), else_=0)
    credito = case((Movimento.tipo_movimentacao == 'credito', Movimento.valor), else_=0)
    totais = db.query(func.coalesce(func.sum(debito), 0), func.coalesce(func.sum(credito), 0),
                      func.count().filter(Movimento.tipo_movimentacao == 'ajuste')).filter(
                          Movimento.membro_id == membro.id).one()
    confiavel = not totais[2] and Decimal(totais[0]) - Decimal(totais[1]) == membro.saldo_devedor
    # A janela precede o filtro e a paginação: créditos posteriores também quitam dívidas antigas.
    base = db.query(
        Movimento,
        func.sum(debito).over(order_by=(Movimento.criado_em, Movimento.id),
                              rows=(None, 0)).label('debito_acumulado'),
    ).filter(Movimento.membro_id == membro.id).subquery()
    aberto = case((base.c.tipo_movimentacao == 'debito',
                   func.least(base.c.valor, func.greatest(0, base.c.debito_acumulado - totais[1]))), else_=0)
    filtros = []
    if filtro.data_inicio:
        filtros = [base.c.criado_em >= datetime.combine(filtro.data_inicio, time.min, FUSO),
                   base.c.criado_em < datetime.combine(filtro.data_fim + timedelta(days=1), time.min, FUSO)]
    soma = lambda cond: func.coalesce(func.sum(case((cond, base.c.valor), else_=0)), 0)
    resumo = db.query(
        soma(base.c.tipo_movimentacao == 'debito'),
        soma((base.c.tipo_movimentacao == 'credito') & (base.c.origem == 'pagamento')),
        soma((base.c.tipo_movimentacao == 'credito') & (base.c.origem != 'pagamento')),
        func.coalesce(func.sum(aberto), 0), func.count(),
    ).select_from(base).filter(*filtros).one()
    linhas = db.query(base, aberto.label('aberto')).filter(*filtros).order_by(
        base.c.criado_em.desc(), base.c.id.desc()).offset(filtro.offset).limit(filtro.limite + 1).all()
    itens = []
    for m in linhas[:filtro.limite]:
        valor_aberto = float(m.aberto) if confiavel and m.tipo_movimentacao == 'debito' else None
        situacao = ('quitado' if valor_aberto == 0 else 'parcial' if valor_aberto < float(m.valor)
                    else 'em_aberto') if valor_aberto is not None else (
                        'pagamento' if m.tipo_movimentacao == 'credito' and m.origem == 'pagamento'
                        else 'credito' if m.tipo_movimentacao == 'credito' else 'nao_identificado')
        itens.append({
            'id': str(m.id), 'data': m.criado_em.astimezone(FUSO).strftime('%d/%m/%Y %H:%M'),
            'tipo': m.tipo_movimentacao, 'origem': m.origem, 'descricao': m.descricao or '',
            'valor': float(m.valor), 'versao': m.versao, 'venda_id': str(m.venda_id) if m.venda_id else None,
            'valor_aberto': valor_aberto,
            'valor_abatido': float(m.valor) - valor_aberto if valor_aberto is not None else None,
            'situacao': situacao,
        })
    return {
        'membro': membro.to_dict(), 'itens': itens, 'total': float(membro.saldo_devedor),
        'periodo': {'inicio': filtro.data_inicio.isoformat() if filtro.data_inicio else None,
                    'fim': filtro.data_fim.isoformat() if filtro.data_fim else None},
        'resumo': {'total_periodo': float(resumo[0]), 'total_pago_periodo': float(resumo[1]),
                   'total_creditos_ajuste_periodo': float(resumo[2]),
                   'total_aberto_periodo': float(resumo[3]) if confiavel else None,
                   'total_abatido_periodo': float(resumo[0] - resumo[3]) if confiavel else None,
                   'divida_total_atual': float(membro.saldo_devedor)},
        'criterio_quitacao': 'fifo_informativo',
        'aviso': None if confiavel else 'O histórico não corresponde ao saldo atual. Não é possível atribuir quitação aos lançamentos; confira os registros com o administrador.',
        'paginacao': {'limite': filtro.limite, 'offset': filtro.offset,
                      'tem_mais': len(linhas) > filtro.limite, 'total': resumo[4]},
    }
