"""
Rotas: Caixa
POST /api/caixa/abrir     → Abre um novo caixa
POST /api/caixa/fechar    → Fecha o caixa aberto
GET  /api/caixa/aberto    → Retorna caixa aberto

O operador é identificado pelo JWT do Supabase (header Authorization).
"""

from flask import Blueprint, request, jsonify, g
from app.database import get_db
from app.services import caixa_service
from app.auth_middleware import requer_login

bp = Blueprint('caixa', __name__, url_prefix='/api/caixa')


@bp.route('/abrir', methods=['POST'])
@requer_login
def abrir():
    """
    Abre um novo caixa.

    Body JSON:
    {
        "valor_abertura": 100.00
    }
    """
    db = next(get_db())
    try:
        dados = request.get_json() or {}
        # Injeta usuario_id do JWT
        dados['usuario_id'] = g.usuario_id

        resultado = caixa_service.abrir_caixa(db, dados)

        if resultado['status'] == 'ok':
            return jsonify(resultado)
        else:
            return jsonify(resultado), 400
    finally:
        db.close()


@bp.route('/fechar', methods=['POST'])
@requer_login
def fechar():
    """
    Fecha o caixa aberto.

    Body JSON:
    {
        "caixa_id": "uuid",
        "valor_fechamento": 500.00,
        "observacoes": "Tudo certo"
    }
    """
    db = next(get_db())
    try:
        dados = request.get_json() or {}
        # Injeta usuario_id do JWT
        dados['usuario_id'] = g.usuario_id

        resultado = caixa_service.fechar_caixa(db, dados)

        if resultado['status'] == 'ok':
            return jsonify(resultado)
        else:
            return jsonify(resultado), 400
    finally:
        db.close()


@bp.route('/aberto', methods=['GET'])
@requer_login
def caixa_aberto():
    """
    Retorna o caixa aberto.
    Aceita query param: caixa_id
    Se não informado, busca pelo usuário autenticado.
    """
    db = next(get_db())
    try:
        caixa_id = request.args.get('caixa_id', '')

        resultado = caixa_service.obter_caixa_aberto(
            db,
            usuario_id=g.usuario_id,
            caixa_id=caixa_id,
        )
        return jsonify(resultado)
    finally:
        db.close()

