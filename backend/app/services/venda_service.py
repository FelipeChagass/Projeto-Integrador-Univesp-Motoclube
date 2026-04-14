from decimal import Decimal, ROUND_HALF_UP
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.models.venda import Venda, ItemVenda
from app.models.produto import Produto
from app.models.membro import Membro
from app.models.movimentacao_membro import MovimentacaoMembro


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


def criar_venda_normal(db: Session, dados: dict) -> dict:
    """
    Processa uma venda normal (não fiado).

    Fluxo:
    1. Resolve operador nome → UUID
    2. Verifica duplicidade (id_externo)
    3. Valida estoque de cada item
    4. Cria registro de venda + itens
    5. Baixa estoque do bar
    6. Commit atômico
    """
    try:
        operador_id = dados.get('usuario_id')

        # 1. VERIFICAÇÃO DE DUPLICIDADE
        id_externo = dados.get('id_externo')
        if id_externo:
            existente = db.query(Venda).filter_by(id_externo=id_externo).first()
            if existente:
                return {'status': 'duplicado', 'mensagem': 'Venda já registrada.'}

        itens_dados = dados.get('itens', [])
        if not itens_dados:
            return {'status': 'erro', 'mensagem': 'Nenhum item na venda.'}

        metodo_banco = _normalizar_metodo(dados.get('metodo', 'DINHEIRO'))

        # 2. VERIFICAÇÃO E CONSOLIDAÇÃO DE ESTOQUE
        mapa_reducao = {}
        for item in itens_dados:
            pid = int(item['id'])
            qtd = int(item['qtd'])
            mapa_reducao[pid] = mapa_reducao.get(pid, 0) + qtd

        produtos_ids = list(mapa_reducao.keys())
        produtos = db.query(Produto).filter(Produto.id.in_(produtos_ids)).all()
        produtos_dict = {p.id: p for p in produtos}

        for pid, qtd_necessaria in mapa_reducao.items():
            produto = produtos_dict.get(pid)
            if not produto:
                return {'status': 'erro', 'mensagem': f'Produto ID {pid} não encontrado.'}
            if produto.estoque_bar < qtd_necessaria:
                return {'status': 'erro', 'mensagem': f'Porções insuficientes para "{produto.nome}". Disponível: {produto.estoque_bar}, solicitado: {qtd_necessaria}.'}

        # 3. RECALCULA TOTAL NO SERVIDOR (ignora o total enviado pelo frontend)
        # Isso previne manipulação de preço por clientes maliciosos.
        total_calculado = Decimal('0.00')
        for item in itens_dados:
            pid = int(item['id'])
            qtd = int(item['qtd'])
            preco_db = Decimal(str(produtos_dict[pid].preco_atual))
            total_calculado += (preco_db * qtd).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

        # 4. CRIA REGISTRO DE VENDA
        venda = Venda(
            id_externo=id_externo,
            caixa_id=dados.get('caixa_id'),
            usuario_id=operador_id,
            tipo_venda='normal',
            metodo_pagamento=metodo_banco,
            nome_cliente=dados.get('cliente', 'BALCÃO'),
            valor_total=total_calculado,
        )
        db.add(venda)
        db.flush()

        # 5. CRIA ITENS DA VENDA com preços do banco
        for item in itens_dados:
            pid = int(item['id'])
            qtd = int(item['qtd'])
            preco_unit = Decimal(str(produtos_dict[pid].preco_atual)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
            preco_total = (preco_unit * qtd).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

            item_venda = ItemVenda(
                venda_id=venda.id,
                produto_id=pid,
                nome_produto=produtos_dict[pid].nome,
                quantidade=qtd,
                preco_unitario=preco_unit,
                preco_total=preco_total,
                observacoes=item.get('obs', ''),
            )
            db.add(item_venda)

        # 6. BAIXA ESTOQUE DO BAR
        for pid, qtd in mapa_reducao.items():
            produto = produtos_dict[pid]
            produto.estoque_bar = produto.estoque_bar - qtd

        # 7. COMMIT ATÔMICO
        db.commit()

        return {
            'status': 'ok',
            'mensagem': 'Venda registrada com sucesso.',
            'venda_id': str(venda.id),
            'total_calculado': float(total_calculado),
        }

    except IntegrityError:
        db.rollback()
        return {'status': 'duplicado', 'mensagem': 'Venda já registrada (duplicidade).'}
    except Exception as e:
        db.rollback()
        return {'status': 'erro', 'mensagem': f'Erro no processamento: {str(e)}'}


def criar_venda_fiado(db: Session, dados: dict) -> dict:
    """
    Processa uma venda fiado.

    Fluxo adicional em relação à venda normal:
    - Resolve membro por nome
    - Cria movimentação de débito
    - Atualiza saldo_devedor do membro
    """
    try:
        operador_id = dados.get('usuario_id')

        # Resolve membro
        membro_id = dados.get('membro_id')
        if not membro_id:
            nome_cliente = dados.get('cliente', '').strip()
            if nome_cliente:
                membro = db.query(Membro).filter(
                    Membro.nome.ilike(nome_cliente),
                    Membro.ativo == True
                ).first()
                if membro:
                    membro_id = str(membro.id)

        if not membro_id:
            return {'status': 'erro', 'mensagem': 'Membro não encontrado para venda fiado.'}

        membro = db.query(Membro).filter_by(id=membro_id).first()
        if not membro:
            return {'status': 'erro', 'mensagem': 'Membro não encontrado.'}

        # Duplicidade
        id_externo = dados.get('id_externo')
        if id_externo:
            existente = db.query(Venda).filter_by(id_externo=id_externo).first()
            if existente:
                return {'status': 'duplicado', 'mensagem': 'Venda já registrada.'}

        itens_dados = dados.get('itens', [])
        if not itens_dados:
            return {'status': 'erro', 'mensagem': 'Nenhum item na venda.'}

        # Verificação de estoque
        mapa_reducao = {}
        for item in itens_dados:
            pid = int(item['id'])
            qtd = int(item['qtd'])
            mapa_reducao[pid] = mapa_reducao.get(pid, 0) + qtd

        produtos_ids = list(mapa_reducao.keys())
        produtos = db.query(Produto).filter(Produto.id.in_(produtos_ids)).all()
        produtos_dict = {p.id: p for p in produtos}

        for pid, qtd_necessaria in mapa_reducao.items():
            produto = produtos_dict.get(pid)
            if not produto:
                return {'status': 'erro', 'mensagem': f'Produto ID {pid} não encontrado.'}
            if produto.estoque_bar < qtd_necessaria:
                return {'status': 'erro', 'mensagem': f'Porções insuficientes para "{produto.nome}". Disponível: {produto.estoque_bar}, solicitado: {qtd_necessaria}.'}

        # RECALCULA TOTAL NO SERVIDOR
        total_calculado = Decimal('0.00')
        for item in itens_dados:
            pid = int(item['id'])
            qtd = int(item['qtd'])
            preco_db = Decimal(str(produtos_dict[pid].preco_atual))
            total_calculado += (preco_db * qtd).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

        valor_total = total_calculado

        # 1. Cria venda
        venda = Venda(
            id_externo=id_externo,
            caixa_id=dados.get('caixa_id'),
            usuario_id=operador_id,
            membro_id=membro_id,
            tipo_venda='fiado',
            metodo_pagamento='fiado',
            nome_cliente=membro.nome,
            valor_total=valor_total,
        )
        db.add(venda)
        db.flush()

        # 2. Cria itens da venda com preços do banco
        for item in itens_dados:
            pid = int(item['id'])
            qtd = int(item['qtd'])
            preco_unit = Decimal(str(produtos_dict[pid].preco_atual)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
            preco_total = (preco_unit * qtd).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

            item_venda = ItemVenda(
                venda_id=venda.id,
                produto_id=pid,
                nome_produto=produtos_dict[pid].nome,
                quantidade=qtd,
                preco_unitario=preco_unit,
                preco_total=preco_total,
                observacoes=item.get('obs', ''),
            )
            db.add(item_venda)

        # 3. Cria movimentação de débito
        resumo_itens = ', '.join([f"{i['qtd']}x {i['nome']}" for i in itens_dados])
        movimentacao = MovimentacaoMembro(
            membro_id=membro_id,
            venda_id=venda.id,
            usuario_id=operador_id,
            tipo_movimentacao='debito',
            origem='venda_fiado',
            descricao=f'Venda fiado: {resumo_itens}',
            valor=valor_total,
        )
        db.add(movimentacao)

        # 4. Atualiza saldo devedor do membro
        membro.saldo_devedor = Decimal(str(membro.saldo_devedor)) + valor_total

        # 5. Baixa estoque
        for pid, qtd in mapa_reducao.items():
            produto = produtos_dict[pid]
            produto.estoque_bar = produto.estoque_bar - qtd

        # 6. Commit atômico
        db.commit()

        return {
            'status': 'ok',
            'mensagem': 'Venda fiado registrada com sucesso.',
            'venda_id': str(venda.id),
        }

    except IntegrityError:
        db.rollback()
        return {'status': 'duplicado', 'mensagem': 'Venda já registrada (duplicidade).'}
    except Exception as e:
        db.rollback()
        return {'status': 'erro', 'mensagem': f'Erro no processamento: {str(e)}'}


def registrar_pagamento_divida(db: Session, dados: dict) -> dict:
    """
    Registra o pagamento de dívida de um membro.

    Fluxo:
    1. Resolve operador
    2. Encontra membro por nome ou id
    3. Cria venda recebimento_divida
    4. Cria movimentação de crédito
    5. Zera saldo devedor
    """
    try:
        operador_id = dados.get('usuario_id')

        # Encontra o membro
        membro_id = dados.get('membro_id')
        nome_membro = dados.get('nome_membro', '').strip()

        if not membro_id and nome_membro:
            membro = db.query(Membro).filter(
                Membro.nome.ilike(nome_membro),
                Membro.ativo == True
            ).first()
            if membro:
                membro_id = str(membro.id)

        if not membro_id:
            return {'status': 'erro', 'mensagem': 'Membro não identificado.'}

        membro = db.query(Membro).filter_by(id=membro_id).first()
        if not membro:
            return {'status': 'erro', 'mensagem': 'Membro não encontrado.'}

        saldo_atual = Decimal(str(membro.saldo_devedor))
        if saldo_atual <= 0:
            return {'status': 'erro', 'mensagem': 'Este membro não possui dívidas pendentes.'}

        metodo_banco = _normalizar_metodo(dados.get('metodo', 'DINHEIRO'))

        # 1. Cria venda de recebimento
        venda = Venda(
            caixa_id=dados.get('caixa_id'),
            usuario_id=operador_id,
            membro_id=membro_id,
            tipo_venda='recebimento_divida',
            metodo_pagamento=metodo_banco,
            nome_cliente=membro.nome,
            valor_total=saldo_atual,
            observacoes=f'Recebimento conta - {membro.nome}',
        )
        db.add(venda)
        db.flush()

        # 2. Cria movimentação de crédito
        movimentacao = MovimentacaoMembro(
            membro_id=membro_id,
            venda_id=venda.id,
            usuario_id=operador_id,
            tipo_movimentacao='credito',
            origem='pagamento',
            descricao=f'Pagamento conta via {metodo_banco} - R$ {saldo_atual:.2f}',
            valor=saldo_atual,
        )
        db.add(movimentacao)

        # 3. Zera saldo devedor
        membro.saldo_devedor = Decimal('0.00')

        # 4. Commit atômico
        db.commit()

        return {
            'status': 'ok',
            'mensagem': 'Conta quitada com sucesso!',
            'valor_pago': float(saldo_atual),
            'venda_id': str(venda.id),
        }

    except Exception as e:
        db.rollback()
        return {'status': 'erro', 'mensagem': f'Erro ao quitar: {str(e)}'}


def processar_venda(db: Session, dados: dict) -> dict:
    """
    Ponto de entrada único para processar qualquer tipo de venda.
    Decide qual função chamar baseado no método de pagamento.

    Este método é chamado pelo endpoint /api/vendas e mantém
    compatibilidade com o formato de dados do frontend legado.
    """
    metodo = dados.get('metodo', '').upper().strip()

    if metodo == 'FIADO':
        return criar_venda_fiado(db, dados)
    else:
        return criar_venda_normal(db, dados)
