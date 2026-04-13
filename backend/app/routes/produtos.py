"""
Rotas: Produtos
GET    /api/produtos            → Lista todos os produtos ativos
PUT    /api/produtos/estoque    → Atualiza estoque de um produto
POST   /api/produtos            → Cria novo produto (admin)
PUT    /api/produtos/<id>       → Edita produto existente (admin)
DELETE /api/produtos/<id>       → Desativa produto - soft delete (admin)
"""

from flask import Blueprint, request, jsonify, g
from app.database import get_db
from app.services import produto_service
from app.auth_middleware import requer_login, requer_admin

bp = Blueprint('produtos', __name__, url_prefix='/api/produtos')


@bp.route('', methods=['GET'])
@requer_login
def listar():
    """Lista todos os produtos ativos."""
    db = next(get_db())
    try:
        produtos = produto_service.listar_produtos(db)
        return jsonify({'status': 'ok', 'produtos': produtos})
    finally:
        db.close()


@bp.route('/estoque', methods=['PUT'])
@requer_login
def atualizar_estoque():
    """
    Atualiza estoque de um produto.

    Body JSON:
    {
        "produto_id": 1,
        "estoque_bar": 50,
        "estoque_deposito": 100,
        "estoque_min_bar": 5,
        "estoque_min_deposito": 10
    }
    """
    db = next(get_db())
    try:
        dados = request.get_json()
        if not dados or not dados.get('produto_id'):
            return jsonify({'status': 'erro', 'mensagem': 'Dados inválidos.'}), 400

        dados['usuario_id'] = g.usuario_id

        resultado = produto_service.atualizar_estoque(db, dados)
        status_code = 200 if resultado['status'] == 'ok' else 400
        return jsonify(resultado), status_code
    finally:
        db.close()


@bp.route('', methods=['POST'])
@requer_admin
def criar():
    """
    Cria um novo produto. Restrito a admins.

    Body JSON:
    {
        "nome": "Cerveja 600ml",
        "preco_atual": 12.00,
        "categoria": "bebida",
        "url_imagem": "https://...",
        "estoque_bar": 0,
        "estoque_deposito": 0,
        "estoque_min_bar": 5,
        "estoque_min_deposito": 10
    }
    """
    db = next(get_db())
    try:
        dados = request.get_json(silent=True) or {}
        resultado = produto_service.criar_produto(db, dados)
        status_code = 201 if resultado['status'] == 'ok' else 400
        return jsonify(resultado), status_code
    finally:
        db.close()


@bp.route('/<int:produto_id>', methods=['PUT'])
@requer_admin
def editar(produto_id):
    """
    Edita campos de um produto. Restrito a admins.
    Apenas os campos enviados são alterados.
    """
    db = next(get_db())
    try:
        dados = request.get_json(silent=True) or {}
        dados['produto_id'] = produto_id
        resultado = produto_service.editar_produto(db, dados)
        status_code = 200 if resultado['status'] == 'ok' else 400
        return jsonify(resultado), status_code
    finally:
        db.close()


@bp.route('/<int:produto_id>', methods=['DELETE'])
@requer_admin
def deletar(produto_id):
    """
    Soft-delete de um produto (marca ativo=False). Restrito a admins.
    """
    db = next(get_db())
    try:
        resultado = produto_service.deletar_produto(db, produto_id)
        status_code = 200 if resultado['status'] == 'ok' else 400
        return jsonify(resultado), status_code
    finally:
        db.close()
