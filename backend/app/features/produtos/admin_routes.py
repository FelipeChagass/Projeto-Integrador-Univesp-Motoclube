"""Rotas administrativas de produtos e upload validado."""
from flask import jsonify, request, g, current_app
from app.features.admin.routes import bp
from app.features.auth.middleware import requer_admin
from app.core.database import session_scope
from app.core.errors import ApiError, json_object
from app.features.auth.admin_client import get_supabase_admin_client
from app.features.produtos import service as produto_service
from app.features.produtos import images as imagem_service


@bp.route('/produtos', methods=['GET'])
@requer_admin
def listar_produtos():
    with session_scope() as db:
        return jsonify(status='ok', produtos=produto_service.listar_todos_produtos(db))


@bp.route('/produtos', methods=['POST'])
@requer_admin
def criar_produto():
    with session_scope() as db:
        return jsonify(produto_service.criar_produto(db, json_object())), 201


@bp.route('/produtos/<int:produto_id>', methods=['PUT'])
@requer_admin
def editar_produto(produto_id):
    dados = json_object()
    dados['produto_id'] = produto_id
    with session_scope() as db:
        return jsonify(produto_service.editar_produto(db, dados))


@bp.route('/produtos/<int:produto_id>', methods=['DELETE'])
@requer_admin
def deletar_produto(produto_id):
    with session_scope() as db:
        return jsonify(produto_service.deletar_produto(db, produto_id))


@bp.route('/produtos/<int:produto_id>/estoque', methods=['POST'])
@requer_admin
def ajustar_estoque(produto_id):
    dados = json_object()
    dados.update(produto_id=produto_id, usuario_id=g.usuario_id)
    with session_scope() as db:
        return jsonify(produto_service.atualizar_estoque(db, dados))


@bp.route('/produtos/<int:produto_id>/imagem', methods=['POST'])
@requer_admin
def upload_imagem(produto_id):
    arquivo = request.files.get('imagem')
    if arquivo is None:
        raise ApiError('IMAGEM_AUSENTE', 'Envie o campo imagem.', 400)
    conteudo = imagem_service.validar_imagem(arquivo)
    with session_scope() as db:
        if not produto_service.buscar_produto_por_id(db, produto_id):
            raise ApiError('PRODUTO_NAO_ENCONTRADO', 'Produto não encontrado.', 404)
    url = imagem_service.enviar_imagem(get_supabase_admin_client(), current_app.config['STORAGE_BUCKET'],
                                       produto_id, conteudo)
    with session_scope() as db:
        resultado = produto_service.editar_produto(db, {'produto_id': produto_id, 'url_imagem': url})
    return jsonify(status='ok', url_imagem=url, produto=resultado['produto'])
