"""Combos: produto de categoria combo que vende 2 ou mais itens do estoque por um preço.

O combo não guarda estoque; cada venda baixa os itens da composição. Alterar a
composição bloqueia a linha do combo, a mesma que a venda bloqueia antes de lê-la.
"""
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.database import unit_of_work
from app.core.errors import ApiError
from app.models.combo import ComboItem
from app.models.produto import Produto
from app.features.produtos.schemas import ComboCriacaoPayload, ComboItensPayload

CATEGORIA_COMBO = 'combo'


def _validar_itens(db: Session, itens) -> None:
    """Todo item precisa existir no estoque, estar ativo e não ser outro combo."""
    ids = [item.produto_id for item in itens]
    por_id = {p.id: p for p in db.query(Produto).filter(Produto.id.in_(ids)).all()}
    for produto_id in ids:
        produto = por_id.get(produto_id)
        if not produto:
            raise ApiError('PRODUTO_NAO_ENCONTRADO', 'Item do combo não existe no estoque.', 404,
                           {'produto_id': produto_id})
        if produto.tem_categoria_combo():
            raise ApiError('COMBO_ANINHADO', f'"{produto.nome}" já é um combo; use os itens dele.', 422,
                           {'produto_id': produto_id})
        if not produto.ativo:
            raise ApiError('PRODUTO_INATIVO', f'"{produto.nome}" está desativado; reative-o antes.', 409,
                           {'produto_id': produto_id})


def _gravar_itens(db: Session, combo: Produto, itens) -> None:
    combo.itens_combo.clear()
    db.flush()
    for item in itens:
        combo.itens_combo.append(ComboItem(produto_id=item.produto_id, quantidade=item.quantidade))
    db.flush()


def criar_combo(db: Session, dados: dict) -> dict:
    entrada = ComboCriacaoPayload.model_validate(dados)
    nome = entrada.nome.strip()
    if not nome:
        raise ApiError('NOME_INVALIDO', 'Nome é obrigatório.', 422)
    with unit_of_work(db):
        _validar_itens(db, entrada.itens)
        combo = Produto(nome=nome, preco_atual=entrada.preco_atual, categoria=CATEGORIA_COMBO,
                        url_imagem=entrada.url_imagem, estoque_bar=0, estoque_deposito=0)
        db.add(combo)
        db.flush()
        _gravar_itens(db, combo, entrada.itens)
        return {'status': 'ok', 'mensagem': 'Combo criado.', 'produto': combo.to_dict()}


def atualizar_itens_combo(db: Session, combo_id: int, dados: dict) -> dict:
    entrada = ComboItensPayload.model_validate(dados)
    with unit_of_work(db):
        combo = db.query(Produto).filter_by(id=combo_id).populate_existing().with_for_update().first()
        if not combo:
            raise ApiError('PRODUTO_NAO_ENCONTRADO', 'Produto não encontrado.', 404)
        if not combo.tem_categoria_combo():
            raise ApiError('NAO_E_COMBO', 'Somente combos têm itens.', 409)
        if combo_id in {item.produto_id for item in entrada.itens}:
            raise ApiError('COMBO_ANINHADO', 'O combo não pode conter a si mesmo.', 422)
        _validar_itens(db, entrada.itens)
        _gravar_itens(db, combo, entrada.itens)
        combo.atualizado_em = datetime.now(timezone.utc)
        db.flush()
        return {'status': 'ok', 'mensagem': 'Itens do combo atualizados.', 'produto': combo.to_dict()}


def composicoes(db: Session, combo_ids) -> dict:
    """{combo_id: {produto_id: quantidade}} lido em colunas, sem objetos do identity map."""
    resultado = {}
    linhas = db.query(ComboItem.combo_id, ComboItem.produto_id, ComboItem.quantidade).filter(
        ComboItem.combo_id.in_(list(combo_ids))).all()
    for combo_id, produto_id, quantidade in linhas:
        resultado.setdefault(combo_id, {})[produto_id] = quantidade
    return resultado


def combos_que_usam(db: Session, produto_id: int) -> list:
    return [nome for (nome,) in db.query(Produto.nome).join(ComboItem, ComboItem.combo_id == Produto.id).filter(
        ComboItem.produto_id == produto_id).order_by(Produto.nome).all()]
