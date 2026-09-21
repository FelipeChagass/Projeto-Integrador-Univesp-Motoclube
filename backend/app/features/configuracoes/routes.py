"""Configuração global: entrada validada e transação única."""
from flask import jsonify
from app.features.admin.routes import bp
from app.features.auth.middleware import requer_admin
from app.core.database import session_scope, unit_of_work
from app.core.errors import json_object
from app.models.configuracao import ConfiguracaoSistema
from app.features.configuracoes.schemas import ConfigPayload


@bp.route('/config', methods=['GET'])
@requer_admin
def get_config():
    with session_scope() as db:
        config = db.get(ConfiguracaoSistema, 1)
        return jsonify({'status': 'ok', 'config': config.to_dict() if config else {
            'url_logo': '', 'imprimir_automatico': True, 'largura_impressao': 'ticket-80mm'}})


@bp.route('/config', methods=['PUT'])
@requer_admin
def update_config():
    dados = ConfigPayload.model_validate(json_object())
    with session_scope() as db, unit_of_work(db):
        config = db.query(ConfiguracaoSistema).filter_by(id=1).with_for_update().first()
        if not config:
            config = ConfiguracaoSistema(id=1)
            db.add(config)
        for campo, valor in dados.model_dump(exclude_unset=True, exclude_none=True).items():
            setattr(config, campo, valor)
        db.flush()
        result = {'status': 'ok', 'mensagem': 'Configurações salvas.', 'config': config.to_dict()}
    return jsonify(result)
