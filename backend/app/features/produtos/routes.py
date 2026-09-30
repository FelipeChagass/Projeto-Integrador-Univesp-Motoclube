"""
Rotas: Produtos
GET    /api/produtos            → Lista todos os produtos ativos
PUT    /api/produtos/estoque    → Atualiza estoque de um produto
POST   /api/produtos            → Cria novo produto (admin)
PUT    /api/produtos/<id>       → Edita produto existente (admin)
DELETE /api/produtos/<id>       → Desativa produto - soft delete (admin)
"""

from flask import Blueprint, jsonify, g
from app.core.database import session_scope
from app.core.errors import json_object
from app.features.produtos import service as produto_service
from app.features.auth.middleware import requer_login, requer_admin

bp = Blueprint('produtos', __name__, url_prefix='/api/produtos')


@bp.route('', methods=['GET'])
@requer_login
def listar():
    """Lista todos os produtos ativos."""
    with session_scope() as db:
        produtos = produto_service.listar_produtos(db)
        return jsonify({'status': 'ok', 'produtos': produtos})


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
    with session_scope() as db:
        dados = json_object()
        dados['usuario_id'] = g.usuario_id

        exigir_senha = g.usuario_dict.get('perfil') != 'admin'
        resultado = produto_service.atualizar_estoque(db, dados, exigir_senha=exigir_senha)
        status_code = 200 if resultado['status'] == 'ok' else 400
        return jsonify(resultado), status_code


@bp.route('/estoque/verificar-senha', methods=['POST'])
@requer_login
def verificar_senha_estoque():
    dados = json_object()
    if g.usuario_dict.get('perfil') != 'admin':
        produto_service.validar_senha_estoque(dados.get('senha'))
    return jsonify({'status': 'ok'})


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
    with session_scope() as db:
        dados = json_object()
        resultado = produto_service.criar_produto(db, dados)
        status_code = 201 if resultado['status'] == 'ok' else 400
        return jsonify(resultado), status_code


@bp.route('/<int:produto_id>', methods=['PUT'])
@requer_admin
def editar(produto_id):
    """
    Edita campos de um produto. Restrito a admins.
    Apenas os campos enviados são alterados.
    """
    with session_scope() as db:
        dados = json_object()
        dados['produto_id'] = produto_id
        resultado = produto_service.editar_produto(db, dados)
        status_code = 200 if resultado['status'] == 'ok' else 400
        return jsonify(resultado), status_code


@bp.route('/<int:produto_id>', methods=['DELETE'])
@requer_admin
def deletar(produto_id):
    """
    Soft-delete de um produto (marca ativo=False). Restrito a admins.
    """
    with session_scope() as db:
        resultado = produto_service.deletar_produto(db, produto_id)
        status_code = 200 if resultado['status'] == 'ok' else 400
        return jsonify(resultado), status_code
