"""
Serviço: Vendas

Responsável por toda a lógica de negócio relacionada ao processamento de vendas.
Nenhuma lógica de HTTP reside aqui — apenas validações de domínio, cálculos e
persistência.

Princípios aplicados:
- DRY: lógica comum extraída em helpers privados (prefixo _)
- SRP: cada helper tem uma única responsabilidade
- Fail-fast: VendaError é lançado imediatamente em falhas de negócio previstas
- Logging: erros de infraestrutura são logados com stack trace completo
"""

import logging
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.models.venda import Venda, ItemVenda
from app.models.produto import Produto
from app.models.membro import Membro
from app.models.movimentacao_membro import MovimentacaoMembro
from app.schemas.venda_schemas import (
    ItemPayload,
    VendaNormalPayload,
    VendaFiadoPayload,
    PagamentoDividaPayload,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Exceção de Domínio
# ---------------------------------------------------------------------------

class VendaError(Exception):
    """
    Erro de regra de negócio em uma transação de venda.

    Distingue falhas previsíveis de domínio (ex: estoque insuficiente,
    produto não encontrado) de erros de infraestrutura (ex: falha no banco).
    """
    pass


# ---------------------------------------------------------------------------
# Helpers Privados
# ---------------------------------------------------------------------------

def _normalizar_metodo(metodo_frontend: str) -> str:
    """
    Converte o método de pagamento do frontend para o formato do banco.
    Frontend envia: 'DINHEIRO', 'PIX', 'CARTÃO - DÉBITO', 'CARTÃO - CRÉDITO', 'FIADO'
    Banco aceita: 'dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'fiado', 'ajuste'
    """
    metodo = metodo_frontend.upper().strip()
    mapa = {
        'DINHEIRO': 'dinheiro',
        'PIX': 'pix',
        'CARTÃO - DÉBITO': 'cartao_debito',
        'CARTÃO - CRÉDITO': 'cartao_credito',
        'CARTAO - DEBITO': 'cartao_debito',
        'CARTAO - CREDITO': 'cartao_credito',
        'CARTAO': 'cartao_debito',
        'FIADO': 'fiado',
    }
    return mapa.get(metodo, 'dinheiro')


def _verificar_duplicidade(db: Session, id_externo: str | None) -> dict | None:
    """
    Verifica se uma venda com o mesmo id_externo já foi registrada.

    Retorna um dict de resposta 'duplicado' se encontrar, ou None se for nova.
    """
    if id_externo:
        existente = db.query(Venda).filter_by(id_externo=id_externo).first()
        if existente:
            return {'status': 'duplicado', 'mensagem': 'Venda já registrada.'}
    return None


def _consolidar_itens(itens: list[ItemPayload]) -> dict[int, int]:
    """
    Agrupa itens duplicados e retorna um mapa {produto_id: quantidade_total}.

    Garante que múltiplas entradas do mesmo produto sejam consolidadas antes
    de consultar o banco, evitando N queries individuais.
    """
    mapa: dict[int, int] = {}
    for item in itens:
        mapa[item.id] = mapa.get(item.id, 0) + item.qtd
    return mapa


def _buscar_e_validar_produtos(
    db: Session, mapa_reducao: dict[int, int]
) -> dict[int, Produto]:
    """
    Busca todos os produtos necessários em uma única query e valida:
    - Se o produto existe no banco
    - Se há estoque suficiente no bar

    Retorna um dict {produto_id: Produto}.
    Lança VendaError em qualquer falha de validação.
    """
    ids = list(mapa_reducao.keys())
    produtos = db.query(Produto).filter(Produto.id.in_(ids)).all()
    produtos_dict = {p.id: p for p in produtos}

    for pid, qtd_necessaria in mapa_reducao.items():
        produto = produtos_dict.get(pid)
        if not produto:
            raise VendaError(f'Produto ID {pid} não encontrado.')
        if produto.estoque_bar < qtd_necessaria:
            raise VendaError(
                f'Porções insuficientes para "{produto.nome}". '
                f'Disponível: {produto.estoque_bar}, solicitado: {qtd_necessaria}.'
            )

    return produtos_dict


def _calcular_total(
    itens: list[ItemPayload], produtos_dict: dict[int, Produto]
) -> Decimal:
    """
    Recalcula o total da venda usando preços do banco (ignora o total do frontend).

    Previne manipulação de preço por clientes maliciosos que poderiam forjar
    descontos ou itens de graça no payload enviado.
    """
    total = Decimal('0.00')
    for item in itens:
        preco_db = Decimal(str(produtos_dict[item.id].preco_atual))
        total += (preco_db * item.qtd).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    return total


def _criar_itens_venda(
    db: Session,
    venda_id,
    itens: list[ItemPayload],
    produtos_dict: dict[int, Produto],
) -> None:
    """
    Persiste todos os ItemVenda de uma venda, usando preços do banco.

    O `db.flush()` da venda pai deve ter sido chamado antes para que
    `venda_id` já exista na sessão.
    """
    for item in itens:
        produto = produtos_dict[item.id]
        preco_unit = Decimal(str(produto.preco_atual)).quantize(
            Decimal('0.01'), rounding=ROUND_HALF_UP
        )
        preco_total = (preco_unit * item.qtd).quantize(
            Decimal('0.01'), rounding=ROUND_HALF_UP
        )
        item_venda = ItemVenda(
            venda_id=venda_id,
            produto_id=item.id,
            nome_produto=produto.nome,
            quantidade=item.qtd,
            preco_unitario=preco_unit,
            preco_total=preco_total,
            observacoes=item.obs,
        )
        db.add(item_venda)


def _baixar_estoque(
    produtos_dict: dict[int, Produto], mapa_reducao: dict[int, int]
) -> None:
    """
    Decrementa o estoque_bar de cada produto vendido.

    Opera sobre os objetos já carregados na sessão do SQLAlchemy,
    sem emitir queries adicionais.
    """
    for pid, qtd in mapa_reducao.items():
        produtos_dict[pid].estoque_bar -= qtd


def _resolver_membro(
    db: Session, membro_id: str | None, nome_cliente: str
) -> Membro:
    """
    Resolve um Membro a partir do membro_id ou, como fallback, pelo nome.

    Lança VendaError se o membro não for encontrado ou não estiver ativo.
    """
    if not membro_id and nome_cliente.strip():
        membro = db.query(Membro).filter(
            Membro.nome.ilike(nome_cliente.strip()),
            Membro.ativo == True,
        ).first()
        if membro:
            membro_id = str(membro.id)

    if not membro_id:
        raise VendaError('Membro não encontrado para venda fiado.')

    membro = db.query(Membro).filter_by(id=membro_id).first()
    if not membro:
        raise VendaError('Membro não encontrado.')

    return membro


# ---------------------------------------------------------------------------
# Funções Públicas
# ---------------------------------------------------------------------------

def criar_venda_normal(db: Session, dados: VendaNormalPayload) -> dict:
    """
    Processa uma venda de pagamento imediato (não fiado).

    Fluxo:
    1. Verifica duplicidade por id_externo
    2. Valida e carrega produtos (estoque)
    3. Recalcula total no servidor
    4. Persiste Venda + ItemVenda
    5. Decrementa estoque
    6. Commit atômico
    """
    try:
        duplicado = _verificar_duplicidade(db, dados.id_externo)
        if duplicado:
            return duplicado

        if not dados.itens:
            return {'status': 'erro', 'mensagem': 'Nenhum item na venda.'}

        mapa_reducao = _consolidar_itens(dados.itens)
        produtos_dict = _buscar_e_validar_produtos(db, mapa_reducao)
        total_calculado = _calcular_total(dados.itens, produtos_dict)
        metodo_banco = _normalizar_metodo(dados.metodo)

        venda = Venda(
            id_externo=dados.id_externo,
            caixa_id=dados.caixa_id,
            usuario_id=dados.usuario_id,
            tipo_venda='normal',
            metodo_pagamento=metodo_banco,
            nome_cliente=dados.cliente,
            valor_total=total_calculado,
        )
        db.add(venda)
        db.flush()

        _criar_itens_venda(db, venda.id, dados.itens, produtos_dict)
        _baixar_estoque(produtos_dict, mapa_reducao)
        db.commit()

        return {
            'status': 'ok',
            'mensagem': 'Venda registrada com sucesso.',
            'venda_id': str(venda.id),
            'total_calculado': float(total_calculado),
        }

    except VendaError as e:
        db.rollback()
        return {'status': 'erro', 'mensagem': str(e)}
    except IntegrityError:
        db.rollback()
        return {'status': 'duplicado', 'mensagem': 'Venda já registrada (duplicidade).'}
    except Exception:
        logger.exception("Erro inesperado em criar_venda_normal")
        db.rollback()
        return {'status': 'erro', 'mensagem': 'Erro interno no processamento.'}


def criar_venda_fiado(db: Session, dados: VendaFiadoPayload) -> dict:
    """
    Processa uma venda fiado (crédito para membro).

    Fluxo adicional em relação à venda normal:
    - Resolve membro por ID ou nome (fallback)
    - Cria movimentação de débito associada
    - Atualiza saldo_devedor do membro
    """
    try:
        membro = _resolver_membro(db, dados.membro_id, dados.cliente)

        duplicado = _verificar_duplicidade(db, dados.id_externo)
        if duplicado:
            return duplicado

        if not dados.itens:
            return {'status': 'erro', 'mensagem': 'Nenhum item na venda.'}

        mapa_reducao = _consolidar_itens(dados.itens)
        produtos_dict = _buscar_e_validar_produtos(db, mapa_reducao)
        total_calculado = _calcular_total(dados.itens, produtos_dict)

        venda = Venda(
            id_externo=dados.id_externo,
            caixa_id=dados.caixa_id,
            usuario_id=dados.usuario_id,
            membro_id=str(membro.id),
            tipo_venda='fiado',
            metodo_pagamento='fiado',
            nome_cliente=membro.nome,
            valor_total=total_calculado,
        )
        db.add(venda)
        db.flush()

        _criar_itens_venda(db, venda.id, dados.itens, produtos_dict)

        resumo_itens = ', '.join([f"{i.qtd}x {i.nome}" for i in dados.itens])
        movimentacao = MovimentacaoMembro(
            membro_id=str(membro.id),
            venda_id=venda.id,
            usuario_id=dados.usuario_id,
            tipo_movimentacao='debito',
            origem='venda_fiado',
            descricao=f'Venda fiado: {resumo_itens}',
            valor=total_calculado,
        )
        db.add(movimentacao)

        membro.saldo_devedor = Decimal(str(membro.saldo_devedor)) + total_calculado

        _baixar_estoque(produtos_dict, mapa_reducao)
        db.commit()

        return {
            'status': 'ok',
            'mensagem': 'Venda fiado registrada com sucesso.',
            'venda_id': str(venda.id),
            'total_calculado': float(total_calculado),
        }

    except VendaError as e:
        db.rollback()
        return {'status': 'erro', 'mensagem': str(e)}
    except IntegrityError:
        db.rollback()
        return {'status': 'duplicado', 'mensagem': 'Venda já registrada (duplicidade).'}
    except Exception:
        logger.exception("Erro inesperado em criar_venda_fiado")
        db.rollback()
        return {'status': 'erro', 'mensagem': 'Erro interno no processamento.'}


def registrar_pagamento_divida(db: Session, dados: PagamentoDividaPayload) -> dict:
    """
    Registra o pagamento total da dívida de um membro.

    Fluxo:
    1. Resolve membro por ID ou nome
    2. Valida existência de dívida
    3. Cria venda de tipo 'recebimento_divida'
    4. Cria movimentação de crédito
    5. Zera saldo_devedor
    6. Commit atômico
    """
    try:
        membro = _resolver_membro(db, dados.membro_id, dados.nome_membro)

        saldo_atual = Decimal(str(membro.saldo_devedor))
        if saldo_atual <= 0:
            return {'status': 'erro', 'mensagem': 'Este membro não possui dívidas pendentes.'}

        metodo_banco = _normalizar_metodo(dados.metodo)

        venda = Venda(
            caixa_id=dados.caixa_id,
            usuario_id=dados.usuario_id,
            membro_id=str(membro.id),
            tipo_venda='recebimento_divida',
            metodo_pagamento=metodo_banco,
            nome_cliente=membro.nome,
            valor_total=saldo_atual,
            observacoes=f'Recebimento conta - {membro.nome}',
        )
        db.add(venda)
        db.flush()

        movimentacao = MovimentacaoMembro(
            membro_id=str(membro.id),
            venda_id=venda.id,
            usuario_id=dados.usuario_id,
            tipo_movimentacao='credito',
            origem='pagamento',
            descricao=f'Pagamento conta via {metodo_banco} - R$ {saldo_atual:.2f}',
            valor=saldo_atual,
        )
        db.add(movimentacao)

        membro.saldo_devedor = Decimal('0.00')
        db.commit()

        return {
            'status': 'ok',
            'mensagem': 'Conta quitada com sucesso!',
            'valor_pago': float(saldo_atual),
            'venda_id': str(venda.id),
        }

    except VendaError as e:
        db.rollback()
        return {'status': 'erro', 'mensagem': str(e)}
    except Exception:
        logger.exception("Erro inesperado em registrar_pagamento_divida")
        db.rollback()
        return {'status': 'erro', 'mensagem': 'Erro interno ao quitar conta.'}


def processar_venda(db: Session, dados: VendaNormalPayload | VendaFiadoPayload) -> dict:
    """
    Ponto de entrada único para processar qualquer tipo de venda.
    Decide qual função chamar baseado no método de pagamento.

    Este método é chamado pelo endpoint /api/vendas e mantém
    compatibilidade com o formato de dados do frontend legado.
    """
    if dados.metodo.upper().strip() == 'FIADO':
        fiado_dados = dados if isinstance(dados, VendaFiadoPayload) else VendaFiadoPayload(**dados.model_dump())
        return criar_venda_fiado(db, fiado_dados)
    return criar_venda_normal(db, dados)
