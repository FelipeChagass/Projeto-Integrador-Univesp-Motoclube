"""Relatórios com totais SQL exatos e histórico limitado, no fuso do estabelecimento."""
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import selectinload

from app.core.errors import ApiError
from app.core.tempo import FUSO
from app.models.caixa import Caixa
from app.models.venda import Venda, ItemVenda


def _intervalo(tipo, dados, agora):
    if tipo == 'DIA':
        local = agora.astimezone(FUSO)
        dia = local.date() - timedelta(days=1 if local.hour < 6 else 0)
        inicio = datetime.combine(dia, time(6), FUSO)
        return inicio.astimezone(timezone.utc), (inicio + timedelta(days=1)).astimezone(timezone.utc), f'Dia (Operação): {dia:%d/%m/%Y}'
    if tipo == 'PERIODO':
        try:
            inicio = date.fromisoformat(dados['inicio'])
            fim = date.fromisoformat(dados['fim'])
        except (KeyError, ValueError, TypeError):
            raise ApiError('PERIODO_INVALIDO', 'Informe datas no formato AAAA-MM-DD.', 422) from None
        if fim < inicio or (fim - inicio).days > 366:
            raise ApiError('PERIODO_INVALIDO', 'Use um período ordenado de até 367 dias.', 422)
        return (datetime.combine(inicio, time.min, FUSO).astimezone(timezone.utc),
                datetime.combine(fim + timedelta(days=1), time.min, FUSO).astimezone(timezone.utc),
                f'Período: {inicio:%d/%m/%Y} até {fim:%d/%m/%Y}')
    raise ApiError('TIPO_INVALIDO', 'Tipo de relatório inválido.', 422)


def _operador(dados_filtro):
    try:
        return UUID(str(dados_filtro['operador_id']))
    except (KeyError, ValueError, TypeError):
        raise ApiError('OPERADOR_INVALIDO', 'Operador não identificado.', 422) from None


def _caixa_do_turno(db, dados_filtro, operador, admin):
    if not dados_filtro.get('caixa_id'):
        raise ApiError('CAIXA_OBRIGATORIO', 'Informe o caixa do turno.', 422)
    try:
        caixa_id = UUID(str(dados_filtro['caixa_id']))
    except ValueError:
        raise ApiError('CAIXA_INVALIDO', 'Identificador de caixa inválido.', 422) from None
    caixa = db.get(Caixa, caixa_id)
    if not caixa:
        raise ApiError('CAIXA_NAO_ENCONTRADO', 'Caixa não encontrado.', 404)
    if caixa.usuario_abertura_id != operador and not admin:
        raise ApiError('CAIXA_NAO_AUTORIZADO', 'Caixa pertence a outro operador.', 403)
    return caixa


def _escopo(db, tipo, dados_filtro, operador, admin, agora):
    """Devolve (caixa, inicio, fim, periodo, filtros das vendas). Operador vê só as próprias vendas."""
    if tipo == 'TURNO':
        caixa = _caixa_do_turno(db, dados_filtro, operador, admin)
        return caixa, caixa.aberto_em, caixa.fechado_em or agora, f'Turno: {caixa.id}', [Venda.caixa_id == caixa.id]
    inicio, fim, periodo = _intervalo(tipo, dados_filtro, agora)
    filtros = [Venda.criado_em >= inicio, Venda.criado_em < fim]
    if not admin:
        filtros.append(Venda.usuario_id == operador)
    return None, inicio, fim, periodo, filtros


def _paginacao(dados_filtro):
    try:
        limite, offset = int(dados_filtro.get('limite', 500)), int(dados_filtro.get('offset', 0))
    except (ValueError, TypeError):
        raise ApiError('PAGINACAO_INVALIDA', 'Paginação inválida.', 422) from None
    if not 1 <= limite <= 500 or offset < 0:
        raise ApiError('PAGINACAO_INVALIDA', 'Paginação inválida.', 422)
    return limite, offset


def _totais_por_metodo(db, filtros):
    """Entradas por método (cartões somados); fiado não é entrada; recebimento entra no seu método."""
    totais = dict(dinheiro=Decimal(0), pix=Decimal(0), cartao=Decimal(0),
                  vendasFiado=Decimal(0), recebimentoDivida=Decimal(0))
    agregados = db.query(Venda.tipo_venda, Venda.metodo_pagamento, func.sum(Venda.valor_total)).filter(
        *filtros).group_by(Venda.tipo_venda, Venda.metodo_pagamento).all()
    for tipo_venda, metodo, valor in agregados:
        valor = Decimal(valor)
        if tipo_venda == 'fiado':
            totais['vendasFiado'] += valor
        elif tipo_venda in ('normal', 'recebimento_divida'):
            if tipo_venda == 'recebimento_divida':
                totais['recebimentoDivida'] += valor
            grupo = 'cartao' if metodo in ('cartao_credito', 'cartao_debito') else metodo
            if grupo in ('dinheiro', 'pix', 'cartao'):
                totais[grupo] += valor
    totais['totalEntradas'] = totais['dinheiro'] + totais['pix'] + totais['cartao']
    return totais


def _abertura(db, caixa, inicio, fim, operador, admin):
    if caixa:
        return Decimal(caixa.valor_abertura)
    consulta = db.query(func.coalesce(func.sum(Caixa.valor_abertura), 0)).filter(
        Caixa.aberto_em >= inicio, Caixa.aberto_em < fim)
    if not admin:
        consulta = consulta.filter(Caixa.usuario_abertura_id == operador)
    return Decimal(consulta.scalar())


def _produtos_vendidos(db, filtros):
    produtos = db.query(ItemVenda.nome_produto, func.sum(ItemVenda.quantidade)).join(
        Venda, Venda.id == ItemVenda.venda_id).filter(*filtros, Venda.tipo_venda.in_(['normal', 'fiado'])).group_by(
            ItemVenda.nome_produto).all()
    return {nome: int(qtd) for nome, qtd in produtos}


def _linha_historico(venda):
    recebimento = venda.tipo_venda == 'recebimento_divida'
    descricao = (f'RECEBIMENTO CONTA - {venda.nome_cliente or ""}' if recebimento else
                 ', '.join(f'{i.quantidade}x {i.nome_produto}' for i in venda.itens))
    return {
        'id': str(venda.id), 'hora': venda.criado_em.astimezone(FUSO).strftime('%d/%m %H:%M'),
        'descricao': descricao, 'valor': float(venda.valor_total),
        'metodo': venda.metodo_pagamento.upper(),
        'tipo': 'RECEBIMENTO' if recebimento else ('FIADO' if venda.tipo_venda == 'fiado' else 'VENDA'),
    }


def _historico(db, filtros, limite, offset):
    """Devolve (linhas da página, há mais páginas)."""
    vendas = db.query(Venda).options(selectinload(Venda.itens)).filter(*filtros).order_by(
        Venda.criado_em, Venda.id).offset(offset).limit(limite + 1).all()
    return [_linha_historico(venda) for venda in vendas[:limite]], len(vendas) > limite


def gerar_relatorio(db, tipo, dados_filtro):
    agora = datetime.now(timezone.utc)
    operador = _operador(dados_filtro)
    admin = dados_filtro.get('perfil') == 'admin'
    caixa, inicio, fim, periodo, filtros = _escopo(db, tipo, dados_filtro, operador, admin, agora)
    limite, offset = _paginacao(dados_filtro)

    totais = _totais_por_metodo(db, filtros)
    totais['abertura'] = _abertura(db, caixa, inicio, fim, operador, admin)
    totais['totalGeral'] = totais['totalEntradas'] + totais['abertura']
    produtos = _produtos_vendidos(db, filtros)
    historico, tem_mais = _historico(db, filtros, limite, offset)
    return {
        'status': 'ok', **{k: float(v) for k, v in totais.items()}, 'periodo': periodo,
        'produtosVendidos': produtos,
        'historico': historico, 'historico_truncado': tem_mais or offset > 0,
        'paginacao': {'limite': limite, 'offset': offset, 'tem_mais': tem_mais},
    }
