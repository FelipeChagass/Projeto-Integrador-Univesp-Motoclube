"""Listagem paginada e sem carregamentos lazy por venda."""
from datetime import datetime, time, timedelta
from flask import jsonify, request
from sqlalchemy.orm import joinedload, selectinload
from app.features.admin.routes import bp
from app.features.auth.middleware import requer_admin
from app.core.database import session_scope
from app.models.venda import Venda
from app.features.vendas.schemas import FiltroVendas
from app.features.relatorios.service import FUSO
from app.core.errors import ApiError, json_object
from app.features.vendas.admin_service import alterar_venda


@bp.route('/vendas/<uuid:venda_id>', methods=['GET', 'PUT', 'DELETE'])
@requer_admin
def administrar_venda(venda_id):
    with session_scope() as db:
        if request.method == 'GET':
            venda = db.get(Venda, venda_id)
            if not venda:
                raise ApiError('VENDA_NAO_ENCONTRADA', 'Venda não encontrada.', 404)
            return jsonify({'status': 'ok', 'venda': venda.to_dict()})
        return jsonify(alterar_venda(db, venda_id, json_object(), excluir=request.method == 'DELETE'))


@bp.route('/vendas', methods=['GET'])
@requer_admin
def listar_vendas():
    filtros = FiltroVendas.model_validate({k: v for k, v in request.args.items() if v != ''})
    with session_scope() as db:
        query = db.query(Venda).options(joinedload(Venda.usuario), selectinload(Venda.itens))
        if filtros.data_inicio:
            query = query.filter(Venda.criado_em >= datetime.combine(filtros.data_inicio, time.min, FUSO))
        if filtros.data_fim:
            query = query.filter(Venda.criado_em < datetime.combine(filtros.data_fim + timedelta(days=1), time.min, FUSO))
        if filtros.tipo_venda:
            query = query.filter(Venda.tipo_venda == filtros.tipo_venda)
        vendas = query.order_by(Venda.criado_em.desc(), Venda.id.desc()).offset(filtros.offset).limit(filtros.limite + 1).all()
        return jsonify({
            'status': 'ok', 'vendas': [v.to_dict() for v in vendas[:filtros.limite]],
            'total': min(len(vendas), filtros.limite),
            'paginacao': {'limite': filtros.limite, 'offset': filtros.offset, 'tem_mais': len(vendas) > filtros.limite},
        })
