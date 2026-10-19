"""Consulta financeira paginada. FIFO informativo em SQL, sem alterar saldo ou baixa.

Todos os créditos (inclusive ajustes) abatem débitos antigos. Pagamentos recebidos
no período são distintos do abatimento atual dos débitos originados no período.
Histórico incompatível com o saldo oficial não recebe quitações presumidas.
"""
from datetime import datetime, time, timedelta
from decimal import Decimal

from sqlalchemy import case, func

from app.core.tempo import FUSO
from app.models.movimentacao_membro import MovimentacaoMembro as Movimento


AVISO_HISTORICO = ('O histórico não corresponde ao saldo atual. Não é possível atribuir quitação aos '
                   'lançamentos; confira os registros com o administrador.')


def _valor_se(tipo):
    return case((Movimento.tipo_movimentacao == tipo, Movimento.valor), else_=0)


def _ler_totais(db, membro):
    """Devolve (créditos totais, histórico confiável): sem 'ajuste' e débitos - créditos = saldo oficial."""
    totais = db.query(func.coalesce(func.sum(_valor_se('debito')), 0), func.coalesce(func.sum(_valor_se('credito')), 0),
                      func.count().filter(Movimento.tipo_movimentacao == 'ajuste')).filter(
                          Movimento.membro_id == membro.id).one()
    confiavel = not totais[2] and Decimal(totais[0]) - Decimal(totais[1]) == membro.saldo_devedor
    return totais[1], confiavel


def _movimentos_com_aberto(db, membro, creditos):
    """Subconsulta de movimentos e a expressão do valor em aberto de cada débito por FIFO."""
    # A janela precede o filtro e a paginação: créditos posteriores também quitam dívidas antigas.
    base = db.query(
        Movimento,
        func.sum(_valor_se('debito')).over(order_by=(Movimento.criado_em, Movimento.id),
                                           rows=(None, 0)).label('debito_acumulado'),
    ).filter(Movimento.membro_id == membro.id).subquery()
    aberto = case((base.c.tipo_movimentacao == 'debito',
                   func.least(base.c.valor, func.greatest(0, base.c.debito_acumulado - creditos))), else_=0)
    return base, aberto


def _filtros_periodo(base, filtro):
    if not filtro.data_inicio:
        return []
    return [base.c.criado_em >= datetime.combine(filtro.data_inicio, time.min, FUSO),
            base.c.criado_em < datetime.combine(filtro.data_fim + timedelta(days=1), time.min, FUSO)]


def _resumo(db, base, aberto, filtros):
    """Devolve (débitos, pagamentos, outros créditos, em aberto, quantidade) do período."""
    soma = lambda cond: func.coalesce(func.sum(case((cond, base.c.valor), else_=0)), 0)
    return db.query(
        soma(base.c.tipo_movimentacao == 'debito'),
        soma((base.c.tipo_movimentacao == 'credito') & (base.c.origem == 'pagamento')),
        soma((base.c.tipo_movimentacao == 'credito') & (base.c.origem != 'pagamento')),
        func.coalesce(func.sum(aberto), 0), func.count(),
    ).select_from(base).filter(*filtros).one()


def _situacao(m, valor_aberto):
    if valor_aberto is not None:
        return 'quitado' if valor_aberto == 0 else 'parcial' if valor_aberto < float(m.valor) else 'em_aberto'
    if m.tipo_movimentacao == 'credito':
        return 'pagamento' if m.origem == 'pagamento' else 'credito'
    return 'nao_identificado'


def _item(m, confiavel):
    valor_aberto = float(m.aberto) if confiavel and m.tipo_movimentacao == 'debito' else None
    return {
        'id': str(m.id), 'data': m.criado_em.astimezone(FUSO).strftime('%d/%m/%Y %H:%M'),
        'tipo': m.tipo_movimentacao, 'origem': m.origem, 'descricao': m.descricao or '',
        'valor': float(m.valor), 'versao': m.versao, 'venda_id': str(m.venda_id) if m.venda_id else None,
        'valor_aberto': valor_aberto,
        'valor_abatido': float(m.valor) - valor_aberto if valor_aberto is not None else None,
        'situacao': _situacao(m, valor_aberto),
    }


def consultar_extrato(db, membro, filtro):
    creditos, confiavel = _ler_totais(db, membro)
    base, aberto = _movimentos_com_aberto(db, membro, creditos)
    filtros = _filtros_periodo(base, filtro)
    resumo = _resumo(db, base, aberto, filtros)
    linhas = db.query(base, aberto.label('aberto')).filter(*filtros).order_by(
        base.c.criado_em.desc(), base.c.id.desc()).offset(filtro.offset).limit(filtro.limite + 1).all()
    return {
        'membro': membro.to_dict(), 'itens': [_item(m, confiavel) for m in linhas[:filtro.limite]],
        'total': float(membro.saldo_devedor),
        'periodo': {'inicio': filtro.data_inicio.isoformat() if filtro.data_inicio else None,
                    'fim': filtro.data_fim.isoformat() if filtro.data_fim else None},
        'resumo': {'total_periodo': float(resumo[0]), 'total_pago_periodo': float(resumo[1]),
                   'total_creditos_ajuste_periodo': float(resumo[2]),
                   'total_aberto_periodo': float(resumo[3]) if confiavel else None,
                   'total_abatido_periodo': float(resumo[0] - resumo[3]) if confiavel else None,
                   'divida_total_atual': float(membro.saldo_devedor)},
        'criterio_quitacao': 'fifo_informativo',
        'aviso': None if confiavel else AVISO_HISTORICO,
        'paginacao': {'limite': filtro.limite, 'offset': filtro.offset,
                      'tem_mais': len(linhas) > filtro.limite, 'total': resumo[4]},
    }
