"""Cadastro e estoque; alterações serializadas na mesma linha do produto."""
import hmac
import math
from datetime import datetime, timedelta, timezone
from uuid import UUID

from flask import current_app
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core import database
from app.core.database import unit_of_work
from app.core.errors import ApiError
from app.models.ajuste_estoque import AjusteEstoque
from app.models.combo import ComboItem
from app.models.produto import Produto
from app.models.tentativa_senha import TentativaSenhaEstoque
from app.models.venda import ItemVenda, ItemVendaComponente
from app.features.produtos.combos import CATEGORIA_COMBO, combos_que_usam
from app.features.produtos.schemas import EstoquePayload
from app.features.produtos.schemas import ProdutoCriacaoPayload
from app.features.produtos.schemas import ProdutoEdicaoPayload


def _consulta_catalogo(db: Session):
    # Combos leem o estoque dos itens; carregar junto evita uma consulta por card.
    return db.query(Produto).options(selectinload(Produto.itens_combo).joinedload(ComboItem.produto))


def listar_produtos(db: Session) -> list:
    return [p.to_dict() for p in _consulta_catalogo(db).filter_by(ativo=True).order_by(Produto.nome).all()]


def listar_todos_produtos(db: Session) -> list:
    return [p.to_dict() for p in _consulta_catalogo(db).order_by(Produto.nome).all()]


def _recusar_categoria_combo(categoria: str | None, atual_combo: bool = False) -> None:
    if categoria is None:
        return
    if (categoria.strip().lower() == CATEGORIA_COMBO) != atual_combo:
        raise ApiError('CATEGORIA_COMBO', 'Combos são criados em "Novo combo" e não trocam de categoria.', 422)


def buscar_produto_por_id(db: Session, produto_id: int) -> Produto | None:
    return db.query(Produto).filter_by(id=produto_id).first()


def _bloquear_produto(db, produto_id):
    produto = db.query(Produto).filter_by(id=produto_id).populate_existing().with_for_update().first()
    if not produto:
        raise ApiError('PRODUTO_NAO_ENCONTRADO', 'Produto não encontrado.', 404)
    return produto


MAX_FALHAS_SENHA = 5
TEMPO_BLOQUEIO_SENHA = timedelta(minutes=15)


def _registrar_tentativa_senha(usuario_id, correta: bool) -> None:
    """Conta erros seguidos por operador; o 5º erro bloqueia por 15 min, o acerto zera.

    Usa sessão e transação próprias: o erro de senha é confirmado no banco mesmo que
    a requisição termine em exceção e desfaça a transação principal.
    """
    db = database.SessionLocal()
    try:
        with unit_of_work(db):
            agora = datetime.now(timezone.utc)
            registro = db.query(TentativaSenhaEstoque).filter_by(
                usuario_id=usuario_id).populate_existing().with_for_update().first()
            if registro and registro.bloqueado_ate and registro.bloqueado_ate > agora:
                segundos = math.ceil((registro.bloqueado_ate - agora).total_seconds())
                raise ApiError('SENHA_ESTOQUE_BLOQUEADA',
                               f'Muitas tentativas erradas. Tente de novo em {math.ceil(segundos / 60)} min.',
                               429, {'tentar_em_segundos': segundos})
            if correta:
                if registro:
                    db.delete(registro)
                return
            if not registro:
                registro = TentativaSenhaEstoque(usuario_id=usuario_id, falhas=0)
                db.add(registro)
            registro.falhas += 1
            registro.atualizado_em = agora
            if registro.falhas >= MAX_FALHAS_SENHA:
                registro.falhas, registro.bloqueado_ate = 0, agora + TEMPO_BLOQUEIO_SENHA
    finally:
        db.close()
    raise ApiError('SENHA_ESTOQUE_INVALIDA', 'Senha do estoque incorreta.', 403)


def validar_senha_estoque(senha: str | None, usuario_id) -> None:
    esperada = current_app.config.get('SENHA_ESTOQUE', '')
    informada = senha if isinstance(senha, str) else ''
    if not esperada:
        raise ApiError('SENHA_ESTOQUE_NAO_CONFIGURADA', 'A senha do estoque não está configurada.', 500)
    _registrar_tentativa_senha(UUID(str(usuario_id)), hmac.compare_digest(informada, esperada))


def criar_produto(db: Session, dados: dict) -> dict:
    entrada = ProdutoCriacaoPayload.model_validate(dados)
    nome = entrada.nome.strip()
    if not nome:
        raise ApiError('NOME_INVALIDO', 'Nome é obrigatório.', 422)
    _recusar_categoria_combo(entrada.categoria)
    with unit_of_work(db):
        produto = Produto(**entrada.model_dump(exclude={'nome'}), nome=nome)
        db.add(produto)
        db.flush()
        return {'status': 'ok', 'mensagem': 'Produto criado.', 'produto': produto.to_dict()}


def editar_produto(db: Session, dados: dict) -> dict:
    entrada = ProdutoEdicaoPayload.model_validate(dados)
    with unit_of_work(db):
        produto = _bloquear_produto(db, entrada.produto_id)
        _recusar_categoria_combo(entrada.categoria, produto.tem_categoria_combo())
        for campo, valor in entrada.model_dump(exclude={'produto_id'}, exclude_none=True, exclude_unset=True).items():
            if campo == 'nome':
                valor = valor.strip()
                if not valor:
                    raise ApiError('NOME_INVALIDO', 'Nome é obrigatório.', 422)
            setattr(produto, campo, valor)
        produto.atualizado_em = datetime.now(timezone.utc)
        db.flush()
        return {'status': 'ok', 'mensagem': 'Produto atualizado.', 'produto': produto.to_dict()}


def trocar_imagem(db: Session, produto_id: int, url: str) -> tuple[dict, str | None]:
    """Grava a foto nova e devolve a anterior, lida sob o lock: duas trocas simultâneas não perdem arquivo."""
    with unit_of_work(db):
        produto = _bloquear_produto(db, produto_id)
        anterior = produto.url_imagem
        produto.url_imagem = url
        produto.atualizado_em = datetime.now(timezone.utc)
        db.flush()
        return {'status': 'ok', 'mensagem': 'Produto atualizado.', 'produto': produto.to_dict()}, anterior


def excluir_produto_e_imagem(db: Session, produto_id: int) -> tuple[dict, str | None]:
    """Exclui o produto e devolve a URL da foto para ser descartada após o commit."""
    with unit_of_work(db):
        url_imagem = _bloquear_produto(db, produto_id).url_imagem
        return deletar_produto(db, produto_id), url_imagem


def deletar_produto(db: Session, produto_id: int) -> dict:
    with unit_of_work(db):
        produto = _bloquear_produto(db, produto_id)
        if produto.tem_categoria_combo() and db.query(ItemVenda.id).filter_by(produto_id=produto.id).first():
            raise ApiError('COMBO_COM_VENDAS', 'Combo com vendas registradas; desative-o para tirá-lo do catálogo.', 409)
        combos = combos_que_usam(db, produto.id)
        if combos:
            raise ApiError('PRODUTO_EM_COMBO', f'Remova este produto dos combos antes de excluí-lo: {", ".join(combos)}.', 409,
                           {'combos': combos})
        if (db.query(ItemVenda.id).filter_by(produto_id=produto.id).first()
                or db.query(ItemVendaComponente.item_venda_id).filter_by(produto_id=produto.id).first()):
            raise ApiError('PRODUTO_COM_VENDAS', 'Exclua as vendas vinculadas antes de excluir este produto, para preservar a devolução ao estoque.', 409)
        db.query(AjusteEstoque).filter_by(produto_id=produto.id).delete(synchronize_session=False)
        db.delete(produto)
        return {'status': 'ok', 'mensagem': f'Produto "{produto.nome}" excluído.'}


def atualizar_estoque(db: Session, dados: dict, *, exigir_senha: bool = True) -> dict:
    entrada = EstoquePayload.model_validate(dados)
    if exigir_senha:
        validar_senha_estoque(entrada.senha_estoque, entrada.usuario_id)
    with unit_of_work(db):
        produto = _bloquear_produto(db, entrada.produto_id)
        if not produto.ativo:
            raise ApiError('PRODUTO_INATIVO', 'Produto inativo.', 409)
        if produto.tem_categoria_combo():
            raise ApiError('COMBO_SEM_ESTOQUE', 'Combo não tem estoque próprio; ajuste o estoque dos itens.', 409)
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
