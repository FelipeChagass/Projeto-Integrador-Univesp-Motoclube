from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.venda import Venda
from app.models.caixa import Caixa


def gerar_relatorio(db: Session, tipo: str, dados_filtro: dict) -> dict:
    """
    Gera relatório financeiro de caixa.

    Args:
        tipo: 'TURNO', 'DIA' ou 'PERIODO'
        dados_filtro: {
            operador_id: str,   # para filtro de turno
            inicio: str,        # ISO date ou datetime
            fim: str,           # ISO date ou datetime
        }

    Returns:
        dict com resumo financeiro, produtos vendidos, histórico
    """
    agora = datetime.now(timezone.utc)

    # Define período
    if tipo == 'TURNO':
        if dados_filtro.get('inicio'):
            data_inicio = _parse_data(dados_filtro['inicio'])
        else:
            data_inicio = agora.replace(hour=0, minute=0, second=0, microsecond=0)
        data_fim = agora
        # Frontend envia 'operador' (nome); aceita ambos os campos
        nome_operador = (
            dados_filtro.get('operador_nome')
            or dados_filtro.get('operador')
            or 'Atual'
        )
        texto_periodo = f"Turno: {nome_operador}"

    elif tipo == 'DIA':
        d = agora
        # Se antes das 6h, considera dia anterior
        if d.hour < 6:
            d = d - timedelta(days=1)
        data_inicio = d.replace(hour=0, minute=0, second=0, microsecond=0)
        data_fim = d.replace(hour=23, minute=59, second=59, microsecond=999999)
        texto_periodo = f"Dia: {d.strftime('%d/%m/%Y')}"

    elif tipo == 'PERIODO':
        if not dados_filtro.get('inicio') or not dados_filtro.get('fim'):
            return {'erro': 'Datas inválidas'}
        data_inicio = _parse_data(dados_filtro['inicio'] + 'T00:00:00')
        data_fim = _parse_data(dados_filtro['fim'] + 'T23:59:59')
        texto_periodo = f"Período: {dados_filtro['inicio']} até {dados_filtro['fim']}"

    else:
        return {'erro': f'Tipo de relatório inválido: {tipo}'}

    # Monta query base
    query = db.query(Venda).filter(
        Venda.criado_em >= data_inicio,
        Venda.criado_em <= data_fim,
    )

    # Filtro por operador (turno)
    if tipo == 'TURNO' and dados_filtro.get('operador_id'):
        query = query.filter(Venda.usuario_id == dados_filtro['operador_id'])

    vendas = query.order_by(Venda.criado_em).all()

    # Monta resumo
    resumo = {
        'abertura': 0.0,
        'dinheiro': 0.0,
        'pix': 0.0,
        'cartao': 0.0,
        'vendasFiado': 0.0,
        'recebimentoDivida': 0.0,
        'totalEntradas': 0.0,
        'produtosVendidos': {},
        'periodo': texto_periodo,
        'historico': [],
    }

    # Busca valor de abertura de caixa(s) no período
    resumo['abertura'] = _calcular_abertura(
        db, data_inicio, data_fim, tipo, dados_filtro
    )

    for venda in vendas:
        valor = float(venda.valor_total)
        metodo = venda.metodo_pagamento
        tipo_v = venda.tipo_venda
        is_recebimento = tipo_v == 'recebimento_divida'

        # Histórico
        descricao = ''
        if is_recebimento:
            descricao = f'RECEBIMENTO CONTA - {venda.nome_cliente or ""}'
        else:
            # Monta resumo dos itens
            itens_resumo = ', '.join([
                f'{item.quantidade}x {item.nome_produto}'
                for item in (venda.itens or [])
            ])
            descricao = itens_resumo[:25] + '...' if len(itens_resumo) > 25 else itens_resumo

        tipo_hist = 'RECEBIMENTO' if is_recebimento else ('FIADO' if tipo_v == 'fiado' else 'VENDA')

        resumo['historico'].append({
            'hora': venda.criado_em.strftime('%d/%m %H:%M') if venda.criado_em else '',
            'descricao': descricao,
            'valor': valor,
            'metodo': metodo.upper(),
            'tipo': tipo_hist,
        })

        # Classificação financeira
        if tipo_v == 'fiado':
            resumo['vendasFiado'] += valor
            _processar_itens_vendidos(venda.itens, resumo['produtosVendidos'])
        elif is_recebimento:
            resumo['recebimentoDivida'] += valor
            # Recebimento entra no caixa pelo método de pagamento
            if metodo == 'dinheiro':
                resumo['dinheiro'] += valor
            elif metodo == 'pix':
                resumo['pix'] += valor
            elif metodo in ('cartao_credito', 'cartao_debito'):
                resumo['cartao'] += valor
        else:
            # Venda normal
            if metodo == 'dinheiro':
                resumo['dinheiro'] += valor
            elif metodo == 'pix':
                resumo['pix'] += valor
            elif metodo in ('cartao_credito', 'cartao_debito'):
                resumo['cartao'] += valor
            _processar_itens_vendidos(venda.itens, resumo['produtosVendidos'])

    resumo['totalEntradas'] = resumo['dinheiro'] + resumo['pix'] + resumo['cartao']

    return resumo


def _calcular_abertura(
    db: Session,
    data_inicio: datetime,
    data_fim: datetime,
    tipo: str,
    dados_filtro: dict,
) -> float:
    """
    Soma o valor_abertura de todos os caixas abertos no período.

    Para TURNO filtra também pelo operador (usuario_abertura_id).
    Para DIA/PERIODO soma todos os caixas abertos no intervalo.
    """
    query = db.query(func.coalesce(func.sum(Caixa.valor_abertura), 0)).filter(
        Caixa.aberto_em >= data_inicio,
        Caixa.aberto_em <= data_fim,
    )

    if tipo == 'TURNO' and dados_filtro.get('operador_id'):
        query = query.filter(
            Caixa.usuario_abertura_id == dados_filtro['operador_id']
        )

    resultado = query.scalar()
    return float(resultado) if resultado else 0.0


def _processar_itens_vendidos(itens: list, produtos_vendidos: dict):
    """Consolida os itens vendidos por nome do produto."""
    if not itens:
        return
    for item in itens:
        nome = item.nome_produto
        qtd = item.quantidade
        produtos_vendidos[nome] = produtos_vendidos.get(nome, 0) + qtd


def _parse_data(data_str: str) -> datetime:
    """Tenta converter string para datetime."""
    formatos = [
        '%Y-%m-%dT%H:%M:%S',
        '%Y-%m-%dT%H:%M:%S.%f',
        '%Y-%m-%dT%H:%M',
        '%Y-%m-%d',
        '%d/%m/%Y %H:%M:%S',
        '%d/%m/%Y',
        # JS Date.toString(): "Mon Apr 14 2025 10:30:00 GMT+0000 (...)"
        '%a %b %d %Y %H:%M:%S GMT%z',
    ]
    for fmt in formatos:
        try:
            dt = datetime.strptime(data_str.split(' (')[0].strip(), fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except ValueError:
            continue

    # Última tentativa
    try:
        return datetime.fromisoformat(data_str.replace('Z', '+00:00'))
    except Exception:
        raise ValueError(f"Formato de data não reconhecido: '{data_str}'")
