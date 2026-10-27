"""Correções da revisão: senha do estoque, nome único, dinheiro exato, relatório por produto,
fotos órfãs, cartão ambíguo, sessão por requisição, JWT local e logs."""
import logging
import re
import time
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from io import BytesIO
from types import SimpleNamespace
from uuid import uuid4

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from PIL import Image
from sqlalchemy import event, inspect, text

from app import create_app
from app.core.errors import ApiError
from app.features.auth import middleware
from app.features.membros.service import criar_membro
from app.features.produtos import admin_routes, images
from app.features.produtos import service as produto_service
from app.features.produtos.service import editar_produto
from app.features.relatorios.service import gerar_relatorio
from app.features.vendas.schemas import normalizar_metodo
from app.features.vendas.service import processar_venda
from app.models import Produto, TentativaSenhaEstoque
from conftest import migrate
from test_auth_postgres import client, headers  # noqa: F401 (fixture)
from test_finance_postgres import concurrent, sale
from test_migrations import isolated_schema

URL_SENHA = '/api/produtos/estoque/verificar-senha'


@pytest.mark.postgres
def test_senha_do_estoque_bloqueia_apos_cinco_erros_seguidos(pg, seed, client):
    operador = headers(seed['users'][0])
    for _ in range(4):
        assert client.post(URL_SENHA, headers=operador, json={'senha': 'errada'}).status_code == 403
    assert client.post(URL_SENHA, headers=operador, json={'senha': 'senha-teste'}).status_code == 200  # acerto zera
    for _ in range(5):
        assert client.post(URL_SENHA, headers=operador, json={'senha': 'errada'}).status_code == 403
    bloqueado = client.post(URL_SENHA, headers=operador, json={'senha': 'senha-teste'})
    assert bloqueado.status_code == 429 and bloqueado.get_json()['code'] == 'SENHA_ESTOQUE_BLOQUEADA'
    assert bloqueado.get_json()['details']['tentar_em_segundos'] > 0
    # O ajuste com senha passa pelo mesmo bloqueio; força bruta não troca de rota.
    ajuste = client.put('/api/produtos/estoque', headers=operador,
                        json={'produto_id': seed['product'], 'senha_estoque': 'senha-teste', 'delta_bar': 1})
    assert ajuste.status_code == 429
    assert client.post(URL_SENHA, headers=headers(seed['users'][1]), json={'senha': 'senha-teste'}).status_code == 200
    with pg() as db:
        db.get(TentativaSenhaEstoque, seed['users'][0]).bloqueado_ate = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.commit()
    assert client.post(URL_SENHA, headers=operador, json={'senha': 'senha-teste'}).status_code == 200
    with pg() as db:
        assert db.get(TentativaSenhaEstoque, seed['users'][0]) is None


@pytest.mark.postgres
@pytest.mark.concurrency
def test_dois_cadastros_simultaneos_com_o_mesmo_nome(pg, seed):
    resultados = concurrent(pg, [lambda db: criar_membro(db, {'nome': 'Zé da Harley'})['status'],
                                 lambda db: criar_membro(db, {'nome': 'zé da harley'})['status']])
    assert sorted(resultados) == ['MEMBRO_DUPLICADO', 'ok']


@pytest.mark.postgres
def test_migracao_recusa_nomes_de_membro_repetidos_sem_alterar_dados(pg):
    engine, schema = isolated_schema(pg)
    with engine.begin() as conn:
        conn.execute(text(f'SET LOCAL search_path TO "{schema}"'))
        migrate(conn, '0004_combos')
        conn.execute(text("INSERT INTO membros(nome) VALUES ('Lobo'), ('LOBO')"))
    with pytest.raises(RuntimeError, match='mesmo nome'):
        with engine.begin() as conn:
            conn.execute(text(f'SET LOCAL search_path TO "{schema}"'))
            migrate(conn)
    with engine.connect() as conn:
        conn.execute(text(f'SET LOCAL search_path TO "{schema}"'))
        assert conn.execute(text('SELECT count(*) FROM membros')).scalar() == 2
        assert conn.execute(text('SELECT version_num FROM alembic_version')).scalar() == '0004_combos'


@pytest.mark.postgres
def test_indices_dos_vinculos_existem(pg):
    with pg.kw['bind'].connect() as conn:
        inspetor = inspect(conn)
        for tabela, coluna in (('vendas', 'membro_id'), ('movimentacoes_membro', 'venda_id'),
                               ('itens_venda', 'produto_id')):
            assert any(i['column_names'][:1] == [coluna] for i in inspetor.get_indexes(tabela)), tabela


@pytest.mark.postgres
def test_dinheiro_sai_exato_no_json(pg, seed, client):
    with pg() as db:
        db.get(Produto, seed['product']).preco_atual = Decimal('10.10')
        db.commit()
    corpo = client.get('/api/produtos', headers=headers(seed['users'][0])).get_data(as_text=True)
    assert re.search(r'"preco_atual":\s*10\.10[,}]', corpo)


@pytest.mark.postgres
def test_relatorio_soma_vendas_do_produto_mesmo_apos_renomear(pg, seed):
    with pg() as db:
        processar_venda(db, sale(seed))
        editar_produto(db, {'produto_id': seed['product'], 'nome': 'Água mineral'})
        processar_venda(db, sale(seed))
        relatorio = gerar_relatorio(db, 'TURNO', {'operador_id': seed['users'][0], 'caixa_id': seed['boxes'][0]})
    assert relatorio['produtosVendidos'] == {'Água mineral': 2}
    assert relatorio['totalEntradas'] == Decimal('20.00')


def test_cartao_sem_tipo_e_recusado():
    with pytest.raises(ValueError, match='débito ou de crédito'):
        normalizar_metodo('cartao')
    assert normalizar_metodo('CARTÃO - CRÉDITO') == 'cartao_credito'
    assert normalizar_metodo('cartão - débito') == 'cartao_debito'


def _png():
    dados = BytesIO()
    Image.new('RGB', (40, 40), 'red').save(dados, format='PNG')
    return dados.getvalue()


@pytest.mark.postgres
def test_fotos_substituidas_ou_nao_gravadas_saem_do_storage(pg, seed, client, monkeypatch):
    removidos = []

    class Bucket:
        def upload(self, caminho, conteudo, opcoes):
            assert opcoes['content-type'] == 'image/webp'

        def get_public_url(self, caminho):
            return f'https://example.test/storage/v1/object/public/produto-imagens/{caminho}'

        def remove(self, caminhos):
            removidos.extend(caminhos)

    falso = SimpleNamespace(storage=SimpleNamespace(from_=lambda bucket: Bucket()))
    monkeypatch.setattr(admin_routes, 'get_supabase_admin_client', lambda: falso)
    monkeypatch.setattr(images, 'get_supabase_admin_client', lambda: falso)
    admin, produto_id = headers(seed['users'][2]), seed['product']
    caminho = lambda url: url.split('/produto-imagens/', 1)[1]

    def enviar():
        return client.post(f'/api/admin/produtos/{produto_id}/imagem', headers=admin,
                           data={'imagem': (BytesIO(_png()), 'foto.png')}, content_type='multipart/form-data')

    primeira = enviar().get_json()['url_imagem']
    assert removidos == []
    segunda = enviar().get_json()['url_imagem']
    assert removidos == [caminho(primeira)]

    def falha(*_args):
        raise ApiError('FALHA_TESTE', 'Falha simulada.', 409)
    monkeypatch.setattr(produto_service, 'trocar_imagem', falha)
    assert enviar().status_code == 409
    assert removidos[-1].startswith(f'produtos/{produto_id}/') and removidos[-1] != caminho(segunda)

    assert client.delete(f'/api/admin/produtos/{produto_id}', headers=admin).status_code == 200
    assert removidos[-1] == caminho(segunda)


def test_url_fora_do_bucket_ou_de_outro_produto_nao_e_removida():
    base = 'https://example.test/storage/v1/object/public/produto-imagens/'
    assert images.caminho_no_bucket(base + 'produtos/7/a.webp', 'produto-imagens', 7) == 'produtos/7/a.webp'
    assert images.caminho_no_bucket(base + 'produtos/8/a.webp', 'produto-imagens', 7) is None
    assert images.caminho_no_bucket(base + 'produtos/7/../8/a.webp', 'produto-imagens', 7) is None
    assert images.caminho_no_bucket('https://cdn.example/foto.png', 'produto-imagens', 7) is None


@pytest.mark.postgres
def test_requisicao_autenticada_usa_uma_conexao_do_pool(pg, seed, client):
    engine = pg.kw['bind']
    checkouts = []
    ouvinte = lambda *_args: checkouts.append(1)
    event.listen(engine, 'checkout', ouvinte)
    try:
        assert client.get('/api/produtos', headers=headers(seed['users'][0])).status_code == 200
        assert client.post(URL_SENHA, headers=headers(seed['users'][2]), json={}).status_code == 200
    finally:
        event.remove(engine, 'checkout', ouvinte)
    assert len(checkouts) == 2  # Uma por requisição: perfil e rota na mesma conexão.
    assert engine.pool.checkedout() == 0  # O teardown devolve a conexão mesmo sem escopo na rota.


@pytest.fixture
def chave_jwks(monkeypatch):
    middleware._token_cache.clear()
    privada = ec.generate_private_key(ec.SECP256R1())
    publica = jwt.algorithms.ECAlgorithm.to_jwk(privada.public_key(), as_dict=True)
    jwk = jwt.PyJWK({**publica, 'kid': 'chave-1', 'alg': 'ES256'})
    monkeypatch.setattr(middleware, '_cliente_jwks', lambda: SimpleNamespace(get_signing_key=lambda kid: jwk))
    consultas = []
    monkeypatch.setattr(middleware, '_consultar_auth', lambda token: consultas.append(token))
    yield privada, consultas
    middleware._token_cache.clear()


def _token(chave, **extras):
    dados = {'sub': str(uuid4()), 'aud': 'authenticated', 'iss': 'https://example.test/auth/v1',
             'exp': int(time.time()) + 300, 'email': 'operador@example.test', 'user_metadata': {'nome': 'Operador'}}
    dados.update(extras)
    return dados['sub'], jwt.encode(dados, chave, algorithm='ES256', headers={'kid': 'chave-1'})


def test_jwt_assinado_pelo_projeto_e_validado_sem_chamar_o_auth(chave_jwks):
    privada, consultas = chave_jwks
    with create_app({'TESTING': True}).app_context():
        sub, token = _token(privada)
        assert middleware._validar_token(token) == {
            'id': sub, 'email': 'operador@example.test', 'metadata': {'nome': 'Operador'}}
        _, de_outra_chave = _token(ec.generate_private_key(ec.SECP256R1()))
        assert middleware._validar_token(de_outra_chave) is None
        _, vencido = _token(privada, exp=int(time.time()) - 10)
        assert middleware._validar_token(vencido) is None
        _, outro_projeto = _token(privada, iss='https://outro.supabase.co/auth/v1')
        assert middleware._validar_token(outro_projeto) is None
    assert consultas == []


def test_jwt_hs256_continua_sendo_validado_pelo_auth(chave_jwks):
    _, consultas = chave_jwks
    token = jwt.encode({'sub': str(uuid4()), 'exp': int(time.time()) + 300}, 'segredo-legado-de-teste-123456789',
                       algorithm='HS256')
    with create_app({'TESTING': True}).app_context():
        assert middleware._validar_token(token) is None  # O Auth simulado não reconhece o usuário.
    assert consultas == [token]


def test_logs_de_requisicao_aparecem_fora_do_debug():
    app = create_app({'TESTING': True, 'DEBUG': False})
    assert app.logger.getEffectiveLevel() == logging.INFO
