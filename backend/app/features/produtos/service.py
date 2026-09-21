"""Cadastro e estoque; alterações serializadas na mesma linha do produto."""
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.database import unit_of_work
from app.core.errors import ApiError
from app.models.ajuste_estoque import AjusteEstoque
from app.models.produto import Produto
from app.models.usuario import Usuario
from app.features.produtos.schemas import EstoquePayload
from app.features.produtos.schemas import ProdutoCriacaoPayload
from app.features.produtos.schemas import ProdutoEdicaoPayload


def listar_produtos(db: Session) -> list:
    return [p.to_dict() for p in db.query(Produto).filter_by(ativo=True).order_by(Produto.nome).all()]


def listar_todos_produtos(db: Session) -> list:
    return [p.to_dict() for p in db.query(Produto).order_by(Produto.nome).all()]


def buscar_produto_por_id(db: Session, produto_id: int) -> Produto | None:
    return db.query(Produto).filter_by(id=produto_id).first()


def _bloquear_produto(db, produto_id):
    produto = db.query(Produto).filter_by(id=produto_id).populate_existing().with_for_update().first()
    if not produto:
        raise ApiError('PRODUTO_NAO_ENCONTRADO', 'Produto não encontrado.', 404)
    return produto


def criar_produto(db: Session, dados: dict) -> dict:
    entrada = ProdutoCriacaoPayload.model_validate(dados)
    nome = entrada.nome.strip()
    if not nome:
        raise ApiError('NOME_INVALIDO', 'Nome é obrigatório.', 422)
    with unit_of_work(db):
        produto = Produto(**entrada.model_dump(exclude={'nome'}), nome=nome)
        db.add(produto)
        db.flush()
        return {'status': 'ok', 'mensagem': 'Produto criado.', 'produto': produto.to_dict()}


def editar_produto(db: Session, dados: dict) -> dict:
    entrada = ProdutoEdicaoPayload.model_validate(dados)
    with unit_of_work(db):
        produto = _bloquear_produto(db, entrada.produto_id)
        for campo, valor in entrada.model_dump(exclude={'produto_id'}, exclude_none=True, exclude_unset=True).items():
            if campo == 'nome':
                valor = valor.strip()
                if not valor:
                    raise ApiError('NOME_INVALIDO', 'Nome é obrigatório.', 422)
            setattr(produto, campo, valor)
        produto.atualizado_em = datetime.now(timezone.utc)
        db.flush()
        return {'status': 'ok', 'mensagem': 'Produto atualizado.', 'produto': produto.to_dict()}


def deletar_produto(db: Session, produto_id: int) -> dict:
    with unit_of_work(db):
        produto = _bloquear_produto(db, produto_id)
        produto.ativo = False
        produto.atualizado_em = datetime.now(timezone.utc)
        return {'status': 'ok', 'mensagem': f'Produto "{produto.nome}" desativado.'}


def atualizar_estoque(db: Session, dados: dict) -> dict:
    entrada = EstoquePayload.model_validate(dados)
    with unit_of_work(db):
        if not db.query(Usuario).filter_by(id=entrada.usuario_id, perfil='admin', ativo=True).first():
            raise ApiError('ACESSO_NEGADO', 'Ajuste de estoque exige administrador.', 403)
        produto = _bloquear_produto(db, entrada.produto_id)
        if not produto.ativo:
            raise ApiError('PRODUTO_INATIVO', 'Produto inativo.', 409)
        for campo in ('estoque_bar', 'estoque_deposito'):
            esperado = getattr(entrada, campo + '_esperado')
            if esperado is not None and esperado != getattr(produto, campo):
                raise ApiError('ESTOQUE_ALTERADO', 'Estoque mudou; atualize a tela antes do ajuste.', 409,
                               {'produto_id': produto.id, 'estoque_bar': produto.estoque_bar,
                                'estoque_deposito': produto.estoque_deposito})
        novo_bar = entrada.estoque_bar if entrada.estoque_bar is not None else produto.estoque_bar
        novo_dep = entrada.estoque_deposito if entrada.estoque_deposito is not None else produto.estoque_deposito
        novo_bar += entrada.delta_bar or 0
        novo_dep += entrada.delta_deposito or 0
        if entrada.auto_transferir:
            novo_dep -= max(0, novo_bar - produto.estoque_bar)
        if novo_bar < 0 or novo_dep < 0:
            raise ApiError('ESTOQUE_INSUFICIENTE', 'Ajuste resultaria em estoque negativo.', 409)
        novo_min_bar = entrada.estoque_min_bar if entrada.estoque_min_bar is not None else produto.estoque_min_bar
        novo_min_dep = entrada.estoque_min_deposito if entrada.estoque_min_deposito is not None else produto.estoque_min_deposito
        db.add(AjusteEstoque(
            produto_id=produto.id, usuario_id=entrada.usuario_id,
            estoque_bar_anterior=produto.estoque_bar, estoque_bar_novo=novo_bar,
            estoque_deposito_anterior=produto.estoque_deposito, estoque_deposito_novo=novo_dep,
            estoque_min_bar_anterior=produto.estoque_min_bar, estoque_min_bar_novo=novo_min_bar,
            estoque_min_deposito_anterior=produto.estoque_min_deposito, estoque_min_deposito_novo=novo_min_dep,
            motivo=entrada.motivo))
        produto.estoque_bar, produto.estoque_deposito = novo_bar, novo_dep
        produto.estoque_min_bar, produto.estoque_min_deposito = novo_min_bar, novo_min_dep
        produto.atualizado_em = datetime.now(timezone.utc)
        db.flush()
        return {'status': 'ok', 'mensagem': 'Estoque atualizado.', 'produto': produto.to_dict()}
