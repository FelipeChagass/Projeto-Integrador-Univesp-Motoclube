"""
Rotas: Vendas
POST /api/vendas               → Processa uma venda (normal ou fiado)
POST /api/vendas/pagamento     → Registra pagamento de dívida

O operador é identificado pelo JWT do Supabase (header Authorization).
"""

from flask import Blueprint, request, jsonify, g
from app.database import get_db
from app.services import venda_service
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
        dados = request.get_json()
        if not dados:
            return jsonify({'status': 'erro', 'mensagem': 'Dados inválidos.'}), 400

        dados_servico = {
            'id_externo': dados.get('id'),
            'itens': dados.get('itens', []),
            'total': dados.get('total', 0),
            'metodo': dados.get('metodo', 'DINHEIRO'),
            'cliente': dados.get('cliente', 'BALCÃO'),
            'usuario_id': g.usuario_id,
            'caixa_id': dados.get('caixa_id'),
            'membro_id': dados.get('membro_id'),
        }

        resultado = venda_service.processar_venda(db, dados_servico)

        if resultado['status'] == 'ok':
            return jsonify(resultado)
        elif resultado['status'] == 'duplicado':
            return jsonify(resultado)
        else:
            return jsonify(resultado), 400

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
        dados = request.get_json()
        if not dados:
            return jsonify({'status': 'erro', 'mensagem': 'Dados inválidos.'}), 400

        # Injeta usuario_id do JWT
        dados['usuario_id'] = g.usuario_id

        resultado = venda_service.registrar_pagamento_divida(db, dados)

        if resultado['status'] == 'ok':
            return jsonify(resultado)
        else:
            return jsonify(resultado), 400

    finally:
        db.close()

