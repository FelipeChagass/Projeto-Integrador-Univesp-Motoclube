"""Acesso ao caixa validado pelo serviço dentro da transação."""
from flask import Blueprint, g, jsonify, request

from app.features.auth.middleware import requer_login
from app.core.database import session_scope
from app.core.errors import json_object
from app.features.caixa import service as caixa_service

bp = Blueprint('caixa', __name__, url_prefix='/api/caixa')


@bp.route('/abrir', methods=['POST'])
@requer_login
def abrir():
    dados = json_object()
    dados['usuario_id'] = g.usuario_id
    with session_scope() as db:
        return jsonify(caixa_service.abrir_caixa(db, dados))


@bp.route('/fechar', methods=['POST'])
@requer_login
def fechar():
    dados = json_object()
    dados['usuario_id'] = g.usuario_id
    dados['observacoes'] = dados.get('observacoes') or ''
    with session_scope() as db:
        return jsonify(caixa_service.fechar_caixa(db, dados))


@bp.route('/aberto', methods=['GET'])
@requer_login
def caixa_aberto():
    with session_scope() as db:
        return jsonify(caixa_service.obter_caixa_aberto(
            db, usuario_id=g.usuario_id, caixa_id=request.args.get('caixa_id')))

