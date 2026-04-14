"""
Rotas administrativas — CRUD completo de produtos, membros, usuários,
visualização de vendas, configurações e upload de imagens.

Todos os endpoints (exceto verificar-senha) exigem perfil 'admin'.

Endpoints:
    POST   /api/admin/verificar-senha                → Valida senha do modo estoque/admin

    GET    /api/admin/produtos                       → Lista todos os produtos (incl. inativos)
    POST   /api/admin/produtos                       → Cria produto
    PUT    /api/admin/produtos/<id>                   → Edita produto
    DELETE /api/admin/produtos/<id>                   → Desativa (soft-delete) produto
    POST   /api/admin/produtos/<id>/imagem            → Upload de imagem do produto

    GET    /api/admin/membros                         → Lista todos os membros
    POST   /api/admin/membros                         → Cria membro
    PUT    /api/admin/membros/<id>                     → Edita membro
    DELETE /api/admin/membros/<id>                     → Desativa membro
    GET    /api/admin/membros/<id>/extrato             → Extrato de movimentações
    POST   /api/admin/membros/<id>/ajuste              → Ajuste manual de saldo

    GET    /api/admin/usuarios                        → Lista todos os usuários
    PUT    /api/admin/usuarios/<id>                    → Edita perfil/ativo do usuário

    GET    /api/admin/vendas                          → Lista vendas (com filtros)

    GET    /api/admin/config                          → Lê configurações do sistema
    PUT    /api/admin/config                          → Atualiza configurações
"""

import hmac
import logging
import os
from datetime import datetime

from flask import Blueprint, jsonify, request, current_app, g

from app.auth_middleware import requer_admin, _supabase
from app.database import get_db
from app.models.configuracao import ConfiguracaoSistema
from app.models.venda import Venda
from app.services import produto_service, membro_service, usuario_service

logger = logging.getLogger(__name__)

bp = Blueprint('admin', __name__, url_prefix='/api/admin')

# Pasta onde imagens dos produtos são salvas (relativa à raiz do projeto)
_UPLOAD_DIR_NAME = os.path.join('static', 'uploads', 'produtos')


def _get_upload_dir():
    """Retorna o caminho absoluto da pasta de uploads, criando-a se necessário."""
    frontend_dir = os.path.abspath(os.path.join(
        os.path.dirname(__file__), '..', '..', '..', '..'
    ))
    upload_dir = os.path.join(frontend_dir, _UPLOAD_DIR_NAME)
    os.makedirs(upload_dir, exist_ok=True)
    return upload_dir


# ═══════════════════════════════════════════════════════════
#  SENHA (legada / compat)
# ═══════════════════════════════════════════════════════════

@bp.route('/verificar-senha', methods=['POST'])
def verificar_senha():
    """Valida senha do modo estoque. Mantido por compatibilidade."""
    dados = request.get_json(silent=True) or {}
    senha_informada = (dados.get('senha') or '').encode('utf-8')
    senha_correta = (current_app.config.get('SENHA_ESTOQUE') or '').encode('utf-8')

    if not senha_correta:
        logger.warning('SENHA_ESTOQUE não configurada no .env')
        return jsonify({'status': 'erro', 'mensagem': 'Autenticação não configurada.'}), 500

    if hmac.compare_digest(senha_informada, senha_correta):
        return jsonify({'status': 'ok'})
    return jsonify({'status': 'erro', 'mensagem': 'Senha incorreta.'}), 401


# ═══════════════════════════════════════════════════════════
#  PRODUTOS
# ═══════════════════════════════════════════════════════════

@bp.route('/produtos', methods=['GET'])
@requer_admin
def listar_produtos():
    """Lista TODOS os produtos, incluindo inativos."""
    db = next(get_db())
    try:
        resultado = produto_service.listar_todos_produtos(db)
        return jsonify({'status': 'ok', 'produtos': resultado})
    finally:
        db.close()


@bp.route('/produtos', methods=['POST'])
@requer_admin
def criar_produto():
    """Cria um novo produto."""
    dados = request.get_json(silent=True) or {}
    db = next(get_db())
    try:
        resultado = produto_service.criar_produto(db, dados)
        status_code = 201 if resultado.get('status') == 'ok' else 400
        return jsonify(resultado), status_code
    finally:
        db.close()


@bp.route('/produtos/<int:produto_id>', methods=['PUT'])
@requer_admin
def editar_produto(produto_id):
    """Edita um produto existente."""
    dados = request.get_json(silent=True) or {}
    dados['produto_id'] = produto_id
    db = next(get_db())
    try:
        resultado = produto_service.editar_produto(db, dados)
        status_code = 200 if resultado.get('status') == 'ok' else 400
        return jsonify(resultado), status_code
    finally:
        db.close()


@bp.route('/produtos/<int:produto_id>', methods=['DELETE'])
@requer_admin
def deletar_produto(produto_id):
    """Desativa (soft-delete) um produto."""
    db = next(get_db())
    try:
        resultado = produto_service.deletar_produto(db, produto_id)
        status_code = 200 if resultado.get('status') == 'ok' else 400
        return jsonify(resultado), status_code
    finally:
        db.close()


@bp.route('/produtos/<int:produto_id>/estoque', methods=['POST'])
@requer_admin
def ajustar_estoque(produto_id):
    """Ajusta estoque do produto e gera registro de auditoria."""
    dados = request.get_json(silent=True) or {}
    dados['produto_id'] = produto_id
    if hasattr(g, 'usuario_id'):
        dados['usuario_id'] = str(g.usuario_id)
        
    db = next(get_db())
    try:
        resultado = produto_service.atualizar_estoque(db, dados)
        status_code = 200 if resultado.get('status') == 'ok' else 400
        return jsonify(resultado), status_code
    finally:
        db.close()

# ─── Upload de Imagem ───

EXTENSOES_PERMITIDAS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}


def _extensao_permitida(filename: str) -> bool:
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in EXTENSOES_PERMITIDAS


@bp.route('/produtos/<int:produto_id>/imagem', methods=['POST'])
@requer_admin
def upload_imagem(produto_id):
    """Upload de imagem do produto via disco local (fallback do Supabase Storage)."""
    if 'imagem' not in request.files:
        return jsonify({'status': 'erro', 'mensagem': 'Nenhum arquivo enviado.'}), 400

    arquivo = request.files['imagem']

    if arquivo.filename == '':
        return jsonify({'status': 'erro', 'mensagem': 'Nome de arquivo vazio.'}), 400

    if not _extensao_permitida(arquivo.filename):
        return jsonify({
            'status': 'erro',
            'mensagem': f'Extensão não permitida. Use: {", ".join(EXTENSOES_PERMITIDAS)}'
        }), 400

    db = next(get_db())
    try:
        produto = produto_service.buscar_produto_por_id(db, produto_id)
        if not produto:
            return jsonify({'status': 'erro', 'mensagem': 'Produto não encontrado.'}), 404

        ext = arquivo.filename.rsplit('.', 1)[1].lower()
        nome_arquivo = f'{produto_id}.{ext}'
        upload_dir = _get_upload_dir()
        caminho = os.path.join(upload_dir, nome_arquivo)
        arquivo.save(caminho)

        url_relativa = f'/static/uploads/produtos/{nome_arquivo}'
        resultado = produto_service.editar_produto(db, {
            'produto_id': produto_id,
            'url_imagem': url_relativa,
        })

        return jsonify({
            'status': 'ok',
            'mensagem': 'Imagem salva com sucesso.',
            'url_imagem': url_relativa,
            'produto': resultado.get('produto'),
        })

    except Exception as e:
        logger.exception('Erro no upload de imagem para produto %s', produto_id)
        return jsonify({'status': 'erro', 'mensagem': f'Erro ao salvar imagem: {str(e)}'}), 500
    finally:
        db.close()


# ═══════════════════════════════════════════════════════════
#  MEMBROS
# ═══════════════════════════════════════════════════════════

@bp.route('/membros', methods=['GET'])
@requer_admin
def listar_membros():
    """Lista TODOS os membros (ativos + inativos) com saldo devedor."""
    db = next(get_db())
    try:
        membros = membro_service.listar_todos_membros(db)
        return jsonify({'status': 'ok', 'membros': membros})
    finally:
        db.close()


@bp.route('/membros', methods=['POST'])
@requer_admin
def criar_membro():
    """Cria um novo membro."""
    dados = request.get_json(silent=True) or {}
    db = next(get_db())
    try:
        resultado = membro_service.criar_membro(db, dados)
        status_code = 201 if resultado.get('status') == 'ok' else 400
        return jsonify(resultado), status_code
    finally:
        db.close()


@bp.route('/membros/<membro_id>', methods=['PUT'])
@requer_admin
def editar_membro(membro_id):
    """Edita nome e/ou status ativo de um membro."""
    dados = request.get_json(silent=True) or {}
    db = next(get_db())
    try:
        resultado = membro_service.editar_membro(db, membro_id, dados)
        status_code = 200 if resultado.get('status') == 'ok' else 400
        return jsonify(resultado), status_code
    finally:
        db.close()


@bp.route('/membros/<membro_id>', methods=['DELETE'])
@requer_admin
def desativar_membro(membro_id):
    """Desativa membro (soft-delete)."""
    db = next(get_db())
    try:
        resultado = membro_service.desativar_membro(db, membro_id)
        status_code = 200 if resultado.get('status') == 'ok' else 400
        return jsonify(resultado), status_code
    finally:
        db.close()


@bp.route('/membros/<membro_id>/extrato', methods=['GET'])
@requer_admin
def extrato_membro(membro_id):
    """Extrato completo de movimentações de um membro."""
    db = next(get_db())
    try:
        resultado = membro_service.buscar_extrato_membro(db, membro_id=membro_id)
        return jsonify({'status': 'ok', **resultado})
    finally:
        db.close()


@bp.route('/membros/<membro_id>/ajuste', methods=['POST'])
@requer_admin
def ajustar_saldo_membro(membro_id):
    """
    Ajuste manual de saldo devedor de um membro.
    Body: { valor: float, tipo: 'credito'|'debito', descricao?: str }
    """
    dados = request.get_json(silent=True) or {}
    valor = dados.get('valor', 0)
    tipo = dados.get('tipo', '')
    descricao = dados.get('descricao', '')

    db = next(get_db())
    try:
        resultado = membro_service.ajustar_saldo(
            db, membro_id, valor, tipo, descricao,
            usuario_id=str(g.usuario_id)
        )
        status_code = 200 if resultado.get('status') == 'ok' else 400
        return jsonify(resultado), status_code
    finally:
        db.close()


# ═══════════════════════════════════════════════════════════
#  USUÁRIOS
# ═══════════════════════════════════════════════════════════

@bp.route('/usuarios', methods=['GET'])
@requer_admin
def listar_usuarios():
    """Lista todos os usuários (ativos + inativos)."""
    db = next(get_db())
    try:
        usuarios = usuario_service.listar_todos(db)
        return jsonify({'status': 'ok', 'usuarios': usuarios})
    finally:
        db.close()


@bp.route('/usuarios', methods=['POST'])
@requer_admin
def criar_usuario():
    """Cria um usuário via admin (Supabase Admin API) sem verificação de email."""
    dados = request.get_json(silent=True) or {}
    db = next(get_db())
    try:
        resultado = usuario_service.criar_usuario_admin(db, _supabase, dados)
        status_code = 201 if resultado.get('status') == 'ok' else 400
        return jsonify(resultado), status_code
    finally:
        db.close()

@bp.route('/usuarios/<user_id>', methods=['PUT'])
@requer_admin
def editar_usuario(user_id):
    """Edita perfil e/ou status ativo de um usuário."""
    dados = request.get_json(silent=True) or {}
    db = next(get_db())
    try:
        resultado = usuario_service.editar_usuario(db, user_id, dados)
        status_code = 200 if resultado.get('status') == 'ok' else 400
        return jsonify(resultado), status_code
    finally:
        db.close()


# ═══════════════════════════════════════════════════════════
#  VENDAS (somente leitura)
# ═══════════════════════════════════════════════════════════

@bp.route('/vendas', methods=['GET'])
@requer_admin
def listar_vendas():
    """
    Lista vendas com filtros opcionais.
    Query params:
        data_inicio: YYYY-MM-DD
        data_fim: YYYY-MM-DD
        tipo_venda: 'normal', 'fiado', 'recebimento_divida'
        limite: int (default 100)
    """

    db = next(get_db())
    try:
        query = db.query(Venda).order_by(Venda.criado_em.desc())

        # Filtro por data
        data_inicio = request.args.get('data_inicio')
        data_fim = request.args.get('data_fim')
        if data_inicio:
            try:
                dt = datetime.strptime(data_inicio, '%Y-%m-%d')
                query = query.filter(Venda.criado_em >= dt)
            except ValueError:
                pass
        if data_fim:
            try:
                dt = datetime.strptime(data_fim, '%Y-%m-%d').replace(hour=23, minute=59, second=59)
                query = query.filter(Venda.criado_em <= dt)
            except ValueError:
                pass

        # Filtro por tipo
        tipo_venda = request.args.get('tipo_venda')
        if tipo_venda:
            query = query.filter(Venda.tipo_venda == tipo_venda)

        # Limite
        limite = min(int(request.args.get('limite', 100)), 500)
        vendas = query.limit(limite).all()

        return jsonify({
            'status': 'ok',
            'vendas': [v.to_dict() for v in vendas],
            'total': len(vendas),
        })
    except Exception as e:
        logger.exception('Erro ao listar vendas')
        return jsonify({'status': 'erro', 'mensagem': str(e)}), 500
    finally:
        db.close()


# ═══════════════════════════════════════════════════════════
#  CONFIGURAÇÕES DO SISTEMA
# ═══════════════════════════════════════════════════════════

@bp.route('/config', methods=['GET'])
@requer_admin
def get_config():
    """Retorna as configurações atuais do sistema."""

    db = next(get_db())
    try:
        config = db.query(ConfiguracaoSistema).filter_by(id=1).first()
        if not config:
            return jsonify({'status': 'ok', 'config': {
                'url_logo': '', 'imprimir_automatico': True, 'largura_impressao': 'ticket-80mm'
            }})
        return jsonify({'status': 'ok', 'config': config.to_dict()})
    finally:
        db.close()


@bp.route('/config', methods=['PUT'])
@requer_admin
def update_config():
    """Atualiza configurações do sistema."""

    dados = request.get_json(silent=True) or {}
    db = next(get_db())
    try:
        config = db.query(ConfiguracaoSistema).filter_by(id=1).first()
        if not config:
            config = ConfiguracaoSistema(id=1)
            db.add(config)

        if 'url_logo' in dados:
            config.url_logo = dados['url_logo']
        if 'imprimir_automatico' in dados:
            config.imprimir_automatico = bool(dados['imprimir_automatico'])
        if 'largura_impressao' in dados:
            if dados['largura_impressao'] in ('ticket-80mm', 'ticket-58mm'):
                config.largura_impressao = dados['largura_impressao']

        db.commit()
        db.refresh(config)
        return jsonify({'status': 'ok', 'mensagem': 'Configurações salvas.', 'config': config.to_dict()})
    except Exception as e:
        db.rollback()
        logger.exception('Erro ao atualizar config')
        return jsonify({'status': 'erro', 'mensagem': str(e)}), 500
    finally:
        db.close()
