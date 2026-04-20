"""
Rotas: Vendas
POST /api/vendas               → Processa uma venda (normal ou fiado)
POST /api/vendas/pagamento     → Registra pagamento de dívida

O operador é identificado pelo JWT do Supabase (header Authorization).
"""

from flask import Blueprint, request, jsonify, g
from pydantic import ValidationError

from app.database import get_db
from app.services import venda_service
from app.schemas.venda_schemas import VendaFiadoPayload, PagamentoDividaPayload
from app.auth_middleware import requer_login

bp = Blueprint('vendas', __name__, url_prefix='/api/vendas')


@bp.route('', methods=['POST'])
@requer_login
def processar_venda():
    """
    Processa uma venda completa (normal ou fiado).

    Body JSON:
    {
        "id": "1234567890123",
        "itens": [
            { "id": 1, "nome": "Cerveja", "preco": 10.00, "qtd": 2, "obs": "" }
        ],
        "total": 20.00,
        "metodo": "DINHEIRO",
        "cliente": "BALCÃO",
        "caixa_id": "uuid-do-caixa"
    }
    """
    db = next(get_db())
    try:
        dados_raw = request.get_json()
        if not dados_raw:
            return jsonify({'status': 'erro', 'mensagem': 'Dados inválidos.'}), 400

        # Mapeia chave 'id' do frontend para 'id_externo' do schema interno
        payload_dict = {
            'id_externo': dados_raw.get('id'),
            'itens': dados_raw.get('itens', []),
            'metodo': dados_raw.get('metodo', 'DINHEIRO'),
            'cliente': dados_raw.get('cliente', 'BALCÃO'),
            'usuario_id': g.usuario_id,
            'caixa_id': dados_raw.get('caixa_id'),
            'membro_id': dados_raw.get('membro_id'),
        }

        # Valida e tipifica a entrada via Pydantic
        dados = VendaFiadoPayload.model_validate(payload_dict)
        resultado = venda_service.processar_venda(db, dados)

        if resultado['status'] == 'ok':
            return jsonify(resultado)
        elif resultado['status'] == 'duplicado':
            return jsonify(resultado)
        else:
            return jsonify(resultado), 400

    except ValidationError as e:
        return jsonify({'status': 'erro', 'mensagem': 'Payload inválido.', 'detalhes': e.errors()}), 422

    finally:
        db.close()


@bp.route('/pagamento', methods=['POST'])
@requer_login
def registrar_pagamento():
    """
    Registra pagamento de dívida de um membro.

    Body JSON:
    {
        "nome_membro": "João",
        "metodo": "DINHEIRO",
        "caixa_id": "uuid-do-caixa"
    }
    """
    db = next(get_db())
    try:
        dados_raw = request.get_json()
        if not dados_raw:
            return jsonify({'status': 'erro', 'mensagem': 'Dados inválidos.'}), 400

        # Injeta usuario_id do JWT e valida via Pydantic
        dados_raw['usuario_id'] = g.usuario_id
        dados = PagamentoDividaPayload.model_validate(dados_raw)

        resultado = venda_service.registrar_pagamento_divida(db, dados)

        if resultado['status'] == 'ok':
            return jsonify(resultado)
        else:
            return jsonify(resultado), 400

    except ValidationError as e:
        return jsonify({'status': 'erro', 'mensagem': 'Payload inválido.', 'detalhes': e.errors()}), 422

    finally:
        db.close()
