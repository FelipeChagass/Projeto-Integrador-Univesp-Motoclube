"""Contratos HTTP das operações financeiras; identidade vem sempre do JWT."""
from flask import Blueprint, g, jsonify

from app.features.auth.middleware import requer_login
from app.core.database import session_scope
from app.core.errors import json_object
from app.features.vendas.schemas import VendaNormalPayload
from app.features.vendas.schemas import PagamentoDividaPayload
from app.features.vendas import service as venda_service

bp = Blueprint('vendas', __name__, url_prefix='/api/vendas')


@bp.route('', methods=['POST'])
@requer_login
def processar_venda():
    payload = json_object()
    payload['usuario_id'] = g.usuario_id
    dados = VendaNormalPayload.model_validate(payload)
    with session_scope() as db:
        return jsonify(venda_service.processar_venda(db, dados))


@bp.route('/pagamento', methods=['POST'])
@requer_login
def registrar_pagamento():
    payload = json_object()
    payload['usuario_id'] = g.usuario_id
    dados = PagamentoDividaPayload.model_validate(payload)
    with session_scope() as db:
        return jsonify(venda_service.registrar_pagamento_divida(db, dados))
