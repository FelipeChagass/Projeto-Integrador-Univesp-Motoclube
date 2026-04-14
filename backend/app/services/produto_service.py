from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from sqlalchemy.orm import Session

from app.models.produto import Produto
from app.models.ajuste_estoque import AjusteEstoque


# ─────────────────────── Leitura ───────────────────────

def listar_produtos(db: Session) -> list:
    """Retorna todos os produtos ATIVOS como dicts."""
    produtos = db.query(Produto).filter_by(ativo=True).order_by(Produto.nome).all()
    return [p.to_dict() for p in produtos]


def listar_todos_produtos(db: Session) -> list:
    """Retorna todos os produtos, incluindo inativos (para a tela de administração)."""
    produtos = db.query(Produto).order_by(Produto.nome).all()
    return [p.to_dict() for p in produtos]


def buscar_produto_por_id(db: Session, produto_id: int) -> Produto | None:
    """Busca um produto por ID (incluindo inativos)."""
    return db.query(Produto).filter_by(id=produto_id).first()


# ─────────────────────── CRUD Admin ───────────────────────

def criar_produto(db: Session, dados: dict) -> dict:
    """
    Cria um novo produto.

    Args:
        dados: {nome, preco_atual, categoria, url_imagem?,
                estoque_bar?, estoque_deposito?,
                estoque_min_bar?, estoque_min_deposito?}
    """
    try:
        nome = (dados.get('nome') or '').strip()
        if not nome:
            return {'status': 'erro', 'mensagem': 'Nome é obrigatório.'}

        try:
            preco = Decimal(str(dados.get('preco_atual', 0)))
            if preco < 0:
                return {'status': 'erro', 'mensagem': 'Preço não pode ser negativo.'}
        except (InvalidOperation, ValueError):
            return {'status': 'erro', 'mensagem': 'Preço inválido.'}

        produto = Produto(
            nome=nome,
            preco_atual=preco,
            categoria=dados.get('categoria', 'bebida'),
            url_imagem=dados.get('url_imagem', ''),
            estoque_bar=max(0, int(dados.get('estoque_bar', 0))),
            estoque_deposito=max(0, int(dados.get('estoque_deposito', 0))),
            estoque_min_bar=max(0, int(dados.get('estoque_min_bar', 0))),
            estoque_min_deposito=max(0, int(dados.get('estoque_min_deposito', 0))),
        )
        db.add(produto)
        db.commit()
        db.refresh(produto)
        return {'status': 'ok', 'mensagem': 'Produto criado!', 'produto': produto.to_dict()}

    except Exception as e:
        db.rollback()
        return {'status': 'erro', 'mensagem': f'Erro ao criar: {str(e)}'}


def editar_produto(db: Session, dados: dict) -> dict:
    """
    Edita campos de um produto existente.
    Apenas os campos enviados são alterados.
    """
    try:
        produto = db.query(Produto).filter_by(id=dados.get('produto_id')).first()
        if not produto:
            return {'status': 'erro', 'mensagem': 'Produto não encontrado.'}

        if 'nome' in dados and dados['nome']:
            produto.nome = dados['nome'].strip()
        if 'preco_atual' in dados:
            try:
                preco = Decimal(str(dados['preco_atual']))
                if preco < 0:
                    return {'status': 'erro', 'mensagem': 'Preço não pode ser negativo.'}
                produto.preco_atual = preco
            except (InvalidOperation, ValueError):
                return {'status': 'erro', 'mensagem': 'Preço inválido.'}
        if 'categoria' in dados:
            produto.categoria = dados['categoria']
        if 'url_imagem' in dados:
            produto.url_imagem = dados['url_imagem']
        if 'estoque_min_bar' in dados:
            produto.estoque_min_bar = max(0, int(dados['estoque_min_bar']))
        if 'estoque_min_deposito' in dados:
            produto.estoque_min_deposito = max(0, int(dados['estoque_min_deposito']))
        if 'ativo' in dados:
            produto.ativo = bool(dados['ativo'])

        produto.atualizado_em = datetime.now(timezone.utc)
        db.commit()
        db.refresh(produto)
        return {'status': 'ok', 'mensagem': 'Produto atualizado!', 'produto': produto.to_dict()}

    except Exception as e:
        db.rollback()
        return {'status': 'erro', 'mensagem': f'Erro ao editar: {str(e)}'}


def deletar_produto(db: Session, produto_id: int) -> dict:
    """Soft-delete: marca ativo=False."""
    try:
        produto = db.query(Produto).filter_by(id=produto_id).first()
        if not produto:
            return {'status': 'erro', 'mensagem': 'Produto não encontrado.'}

        produto.ativo = False
        produto.atualizado_em = datetime.now(timezone.utc)
        db.commit()
        return {'status': 'ok', 'mensagem': f'Produto "{produto.nome}" desativado.'}

    except Exception as e:
        db.rollback()
        return {'status': 'erro', 'mensagem': f'Erro ao desativar: {str(e)}'}


# ─────────────────── Ajuste de Estoque ───────────────────

def atualizar_estoque(db: Session, dados: dict) -> dict:
    """
    Atualiza estoque de um produto e registra o ajuste.

    Regra especial: se estoque_bar aumentou, a diferença é subtraída do depósito
    (transferência depósito → bar).

    Aceita usuario_id direto (vindo da sessão).
    """
    try:
        produto_id = dados.get('produto_id')
        produto = db.query(Produto).filter_by(id=produto_id).first()

        if not produto:
            return {'status': 'erro', 'mensagem': 'Produto não encontrado.'}

        usuario_id = dados.get('usuario_id')

        novo_bar = int(dados.get('estoque_bar', produto.estoque_bar))
        novo_dep = int(dados.get('estoque_deposito', produto.estoque_deposito))
        novo_min_bar = int(dados.get('estoque_min_bar', produto.estoque_min_bar))
        novo_min_dep = int(dados.get('estoque_min_deposito', produto.estoque_min_deposito))

        if novo_bar < 0 or novo_dep < 0:
            return {'status': 'erro', 'mensagem': 'Valores negativos não permitidos.'}

        # Transferência automática depósito → bar
        diferenca = novo_bar - produto.estoque_bar
        if diferenca > 0:
            if novo_dep - diferenca < 0:
                return {'status': 'erro', 'mensagem': 'Depósito insuficiente para transferência.'}
            novo_dep = novo_dep - diferenca

        ajuste = AjusteEstoque(
            produto_id=produto_id,
            usuario_id=usuario_id,
            estoque_bar_anterior=produto.estoque_bar,
            estoque_bar_novo=novo_bar,
            estoque_deposito_anterior=produto.estoque_deposito,
            estoque_deposito_novo=novo_dep,
            estoque_min_bar_anterior=produto.estoque_min_bar,
            estoque_min_bar_novo=novo_min_bar,
            estoque_min_deposito_anterior=produto.estoque_min_deposito,
            estoque_min_deposito_novo=novo_min_dep,
            motivo=dados.get('motivo', 'Ajuste manual via sistema'),
        )
        db.add(ajuste)

        produto.estoque_bar = novo_bar
        produto.estoque_deposito = novo_dep
        produto.estoque_min_bar = novo_min_bar
        produto.estoque_min_deposito = novo_min_dep
        produto.atualizado_em = datetime.now(timezone.utc)

        db.commit()

        return {
            'status': 'ok',
            'mensagem': 'Estoque atualizado com sucesso!',
            'produto': produto.to_dict(),
        }

    except Exception as e:
        db.rollback()
        return {'status': 'erro', 'mensagem': f'Erro ao atualizar: {str(e)}'}
