"""Caracterização de autenticação e administração de usuários antes e depois de dividir as funções."""
import hashlib
import time
from types import SimpleNamespace
from unittest.mock import Mock
from uuid import uuid4

import jwt
import pytest
from sqlalchemy import text
from supabase_auth.errors import AuthApiError

from app.core.errors import ApiError
from app.features.auth import middleware as auth
from app.models import AjusteEstoque, Caixa, MovimentacaoMembro, Usuario, Venda

CHAVE = 'test-only-signing-key-of-sufficient-length'


def erro(funcao, *args, **kwargs):
    with pytest.raises(ApiError) as capturado:
        funcao(*args, **kwargs)
    e = capturado.value
    return e.code, e.status_code, e.message


# ─── _validar_token ───

@pytest.fixture
def supabase(monkeypatch):
    """Client falso: `resposta` é devolvida (ou levantada) por get_user; `chamadas` registra os tokens."""
    estado = SimpleNamespace(chamadas=[], resposta=None)

    def get_user(token):
        estado.chamadas.append(token)
        if isinstance(estado.resposta, Exception):
            raise estado.resposta
        return estado.resposta
    monkeypatch.setattr(auth, '_get_supabase_client', lambda: SimpleNamespace(auth=SimpleNamespace(get_user=get_user)))
    auth._token_cache.clear()
    yield estado
    auth._token_cache.clear()


def _resposta(id=None, email='pessoa@example.test', metadata=None):
    return SimpleNamespace(user=SimpleNamespace(id=id or str(uuid4()), email=email, user_metadata=metadata))


def _token(segundos):
    return jwt.encode({'exp': time.time() + segundos}, CHAVE, algorithm='HS256')


@pytest.mark.parametrize('status', [400, 401, 403, 404, 422])
def test_token_recusado_pelo_auth_e_invalido(supabase, status):
    supabase.resposta = AuthApiError('recusado', status, None)
    assert auth._validar_token(_token(60)) is None


@pytest.mark.parametrize('falha', [AuthApiError('falha', 500, None), AuthApiError('falha', 429, None), RuntimeError('x')])
def test_falha_do_auth_e_indisponibilidade(supabase, falha):
    supabase.resposta = falha
    with pytest.raises(ApiError) as capturado:
        auth._validar_token(_token(60))
    assert (capturado.value.code, capturado.value.status_code, capturado.value.retryable,
            capturado.value.message) == ('AUTH_INDISPONIVEL', 503, True, 'Autenticação temporariamente indisponível.')


@pytest.mark.parametrize('resposta', [
    None, SimpleNamespace(user=None), _resposta(id='nao-e-uuid'),
    SimpleNamespace(user=SimpleNamespace(id=None, email='', user_metadata=None)),
])
def test_resposta_sem_usuario_valido_e_invalida(supabase, resposta):
    supabase.resposta = resposta
    assert auth._validar_token(_token(60)) is None
    assert len(auth._token_cache) == 0


def test_usuario_normalizado_e_cache_limitado_ao_ttl(supabase):
    uid = uuid4()
    supabase.resposta = _resposta(id=str(uid).upper(), email=None, metadata=None)
    token = _token(3600)
    antes = time.time()
    assert auth._validar_token(token) == {'id': str(uid), 'email': '', 'metadata': {}}
    (entrada,) = auth._token_cache.values()
    assert antes + auth.TOKEN_CACHE_TTL <= entrada['exp'] <= time.time() + auth.TOKEN_CACHE_TTL
    curto = _token(30)
    auth._validar_token(curto)
    assert auth._token_cache[hashlib.sha256(curto.encode()).hexdigest()]['exp'] < antes + 31


def test_token_sem_exp_nao_e_cacheado(supabase):
    supabase.resposta = _resposta(metadata={'nome': 'X'})
    for token in ('nao-e-jwt', jwt.encode({'sub': 'x'}, CHAVE, algorithm='HS256')):
        assert auth._validar_token(token)['metadata'] == {'nome': 'X'}
        assert auth._validar_token(token)['metadata'] == {'nome': 'X'}
    assert len(supabase.chamadas) == 4 and len(auth._token_cache) == 0


def test_entrada_vencida_do_cache_e_revalidada(supabase):
    supabase.resposta = _resposta()
    token = _token(60)
    auth._validar_token(token)
    for entrada in auth._token_cache.values():
        entrada['exp'] = time.time() - 1
    supabase.resposta = None
    assert auth._validar_token(token) is None
    assert len(supabase.chamadas) == 2 and len(auth._token_cache) == 0


# ─── sincronizar_perfil ───

def _identidade(pg, uid=None):
    uid = uid or uuid4()
    with pg.begin() as db:
        db.execute(text('INSERT INTO auth.users(id) VALUES (:id)'), {'id': uid})
    return uid


@pytest.mark.postgres
@pytest.mark.parametrize(('nome', 'uid', 'email', 'esperado'), [
    ('  ', 'x', '', ('NOME_OBRIGATORIO', 422, 'Nome é obrigatório.')),
    (None, 'x', '', ('NOME_OBRIGATORIO', 422, 'Nome é obrigatório.')),
    ('Nome', 'x', '', ('ID_USUARIO_INVALIDO', 422, 'ID de usuário inválido.')),
    ('Nome', None, '', ('ID_USUARIO_INVALIDO', 422, 'ID de usuário inválido.')),
    ('Nome', 'valido', ' ', ('EMAIL_OBRIGATORIO', 422, 'Email é obrigatório.')),
    ('Nome', 'valido', None, ('EMAIL_OBRIGATORIO', 422, 'Email é obrigatório.')),
])
def test_sincronizar_perfil_valida_entrada(pg, seed, nome, uid, email, esperado):
    from app.features.usuarios.service import sincronizar_perfil
    with pg() as db:
        assert erro(sincronizar_perfil, db, str(uuid4()) if uid == 'valido' else uid, email, nome) == esperado


@pytest.mark.postgres
def test_sincronizar_perfil_cria_e_atualiza(pg, seed):
    from app.features.usuarios.service import sincronizar_perfil
    uid = _identidade(pg)
    with pg() as db:
        criado = sincronizar_perfil(db, str(uid), ' Pessoa@Example.TEST ', ' Pessoa ', perfil='admin')
    assert criado == {'status': 'ok', 'usuario': {**criado['usuario'], 'id': str(uid), 'nome': 'Pessoa',
                                                  'email': 'pessoa@example.test', 'perfil': 'admin', 'ativo': True}}
    with pg() as db:
        igual = sincronizar_perfil(db, uid, 'pessoa@example.test', 'Pessoa', perfil='operador')
        assert igual['usuario']['perfil'] == 'admin'
        mudou = sincronizar_perfil(db, str(uid), 'nova@example.test', 'Pessoa Nova')
    assert (mudou['usuario']['nome'], mudou['usuario']['email'], mudou['usuario']['perfil']) == (
        'Pessoa Nova', 'nova@example.test', 'admin')
    with pg() as db:
        assert db.get(Usuario, uid).email == 'nova@example.test'


@pytest.mark.postgres
def test_sincronizar_perfil_falha_de_banco(pg, seed):
    from app.features.usuarios.service import sincronizar_perfil
    with pg() as db:
        # Sem identidade em auth.users a FK recusa o perfil.
        with pytest.raises(ApiError) as capturado:
            sincronizar_perfil(db, str(uuid4()), 'a@example.test', 'A')
        assert (capturado.value.code, capturado.value.status_code, capturado.value.retryable) == (
            'PERFIL_NAO_SALVO', 503, True)
        assert db.query(Usuario).count() == 3


# ─── criar_usuario_admin ───

def _auth_que_cria(pg, uid=None, registrar=True):
    """Mock do client admin: create_user devolve `uid` (e o insere em auth.users se `registrar`)."""
    uid = uid or uuid4()
    cliente = Mock()

    def create_user(dados):
        if registrar:
            _identidade(pg, uid)
        return SimpleNamespace(user=SimpleNamespace(id=uid))
    cliente.auth.admin.create_user.side_effect = create_user
    return cliente, uid


@pytest.mark.postgres
@pytest.mark.parametrize(('dados', 'esperado'), [
    ({}, ('DADOS_OBRIGATORIOS', 422, 'Nome, email e senha são obrigatórios.')),
    ({'nome': 'A', 'email': 'a@example.test', 'senha': '  '}, ('DADOS_OBRIGATORIOS', 422, 'Nome, email e senha são obrigatórios.')),
    ({'nome': ' ', 'email': 'a@example.test', 'senha': '123456'}, ('DADOS_OBRIGATORIOS', 422, 'Nome, email e senha são obrigatórios.')),
    ({'nome': 'A', 'email': 'a@example.test', 'senha': '12345', 'perfil': 'x'}, ('SENHA_INVALIDA', 422, 'A senha deve ter pelo menos 6 caracteres.')),
    ({'nome': 'A', 'email': 'a@example.test', 'senha': '123456', 'perfil': 'x'}, ('PERFIL_INVALIDO', 422, 'Perfil inválido.')),
])
def test_criar_usuario_valida_antes_do_auth(pg, seed, dados, esperado):
    from app.features.usuarios.service import criar_usuario_admin
    cliente = Mock()
    with pg() as db:
        assert erro(criar_usuario_admin, db, cliente, dados) == esperado
    cliente.auth.admin.create_user.assert_not_called()


@pytest.mark.postgres
def test_criar_usuario_registra_auth_e_perfil(pg, seed):
    from app.features.usuarios.service import criar_usuario_admin
    cliente, uid = _auth_que_cria(pg)
    with pg() as db:
        resultado = criar_usuario_admin(db, cliente, {'nome': ' Nova ', 'email': ' NOVA@example.test ', 'senha': ' 123456 '})
    cliente.auth.admin.create_user.assert_called_once_with({
        'email': 'nova@example.test', 'password': '123456', 'email_confirm': True, 'user_metadata': {'nome': 'Nova'}})
    assert resultado['status'] == 'ok'
    assert {k: resultado['usuario'][k] for k in ('id', 'nome', 'email', 'perfil', 'ativo')} == {
        'id': str(uid), 'nome': 'Nova', 'email': 'nova@example.test', 'perfil': 'operador', 'ativo': True}
    cliente.auth.admin.delete_user.assert_not_called()


@pytest.mark.postgres
@pytest.mark.parametrize(('falha', 'esperado'), [
    (AuthApiError('recusado', 422, None), ('AUTH_RECUSOU', 400, 'O serviço de autenticação recusou a operação. Verifique os dados informados.')),
    (RuntimeError('rede'), ('USUARIO_NAO_CRIADO', 503, 'Não foi possível criar o usuário. Confirme o estado antes de repetir.')),
    (SimpleNamespace(user=None), ('AUTH_SEM_USUARIO', 503, 'O serviço de autenticação não criou o usuário.')),
    (None, ('AUTH_SEM_USUARIO', 503, 'O serviço de autenticação não criou o usuário.')),
])
def test_criar_usuario_falha_no_auth_nao_compensa(pg, seed, falha, esperado):
    from app.features.usuarios.service import criar_usuario_admin
    cliente = Mock()
    if isinstance(falha, Exception):
        cliente.auth.admin.create_user.side_effect = falha
    else:
        cliente.auth.admin.create_user.return_value = falha
    with pg() as db:
        assert erro(criar_usuario_admin, db, cliente, {'nome': 'A', 'email': 'a@example.test', 'senha': '123456'}) == esperado
    cliente.auth.admin.delete_user.assert_not_called()


@pytest.mark.postgres
@pytest.mark.parametrize('delete_falha', [False, True])
def test_criar_usuario_falha_local_remove_identidade(pg, seed, delete_falha):
    from app.features.usuarios.service import criar_usuario_admin
    cliente, uid = _auth_que_cria(pg, registrar=False)
    if delete_falha:
        cliente.auth.admin.delete_user.side_effect = RuntimeError('rede')
    with pg() as db:
        with pytest.raises(ApiError) as capturado:
            criar_usuario_admin(db, cliente, {'nome': 'A', 'email': 'a@example.test', 'senha': '123456', 'perfil': 'admin'})
        assert (capturado.value.code, capturado.value.status_code) == ('PERFIL_NAO_SALVO', 503)
        assert db.get(Usuario, uid) is None
    cliente.auth.admin.delete_user.assert_called_once_with(str(uid))


# ─── excluir_usuario_admin ───

def _usuario_novo(pg):
    uid = _identidade(pg)
    with pg.begin() as db:
        db.add(Usuario(id=uid, nome='Excluível', email=f'{uid}@example.test', perfil='operador'))
    return uid


@pytest.mark.postgres
def test_excluir_usuario_valida_id_autoexclusao_e_existencia(pg, seed):
    from app.features.usuarios.service import excluir_usuario_admin
    admin = str(seed['users'][2])
    cliente = Mock()
    with pg() as db:
        assert erro(excluir_usuario_admin, db, cliente, admin, 'x') == ('ID_USUARIO_INVALIDO', 422, 'ID inválido.')
        assert erro(excluir_usuario_admin, db, cliente, admin, admin) == (
            'AUTOEXCLUSAO_NEGADA', 409, 'Um administrador não pode excluir a própria conta.')
        assert erro(excluir_usuario_admin, db, cliente, admin, str(uuid4())) == (
            'USUARIO_NAO_ENCONTRADO', 404, 'Usuário não encontrado.')
    cliente.auth.admin.delete_user.assert_not_called()


@pytest.mark.postgres
@pytest.mark.parametrize('vinculo', ['caixa_abertura', 'caixa_fechamento', 'venda', 'movimento', 'ajuste_estoque'])
def test_excluir_usuario_com_vinculos(pg, seed, vinculo):
    from app.features.usuarios.service import excluir_usuario_admin
    uid = seed['users'][1] if vinculo == 'caixa_abertura' else _usuario_novo(pg)
    with pg.begin() as db:
        if vinculo == 'caixa_fechamento':
            db.get(Caixa, seed['boxes'][0]).usuario_fechamento_id = uid
        elif vinculo == 'venda':
            db.add(Venda(usuario_id=uid, tipo_venda='normal', metodo_pagamento='pix', valor_total=1))
        elif vinculo == 'movimento':
            db.add(MovimentacaoMembro(membro_id=seed['member'], usuario_id=uid, tipo_movimentacao='debito',
                                      origem='ajuste_manual', valor=1))
        elif vinculo == 'ajuste_estoque':
            db.add(AjusteEstoque(produto_id=seed['product'], usuario_id=uid, estoque_bar_anterior=1, estoque_bar_novo=2,
                                 estoque_deposito_anterior=1, estoque_deposito_novo=1))
    cliente = Mock()
    with pg() as db:
        assert erro(excluir_usuario_admin, db, cliente, str(seed['users'][2]), str(uid)) == (
            'USUARIO_COM_VINCULOS', 409,
            'Usuário vinculado a caixas ou registros operacionais. Sua exclusão exige reconciliar esses registros primeiro.')
        assert db.get(Usuario, uid) is not None
    cliente.auth.admin.delete_user.assert_not_called()


@pytest.mark.postgres
def test_excluir_usuario_ja_ausente_no_auth_conclui(pg, seed):
    from app.features.usuarios.service import excluir_usuario_admin
    uid = _usuario_novo(pg)
    cliente = Mock()
    cliente.auth.admin.delete_user.side_effect = AuthApiError('não existe', 404, None)
    with pg() as db:
        assert excluir_usuario_admin(db, cliente, str(seed['users'][2]), str(uid)) == {
            'status': 'ok', 'mensagem': 'Usuário excluído.'}
    with pg() as db:
        assert db.get(Usuario, uid) is None


@pytest.mark.postgres
@pytest.mark.parametrize(('falha', 'esperado'), [
    (AuthApiError('recusado', 422, None), ('AUTH_RECUSOU', 400, 'O serviço de autenticação recusou a operação. Verifique os dados informados.')),
    (RuntimeError('rede'), ('USUARIO_NAO_EXCLUIDO', 503, 'Não foi possível excluir o usuário. Confirme o estado antes de repetir.')),
])
def test_excluir_usuario_falha_no_auth_restaura_perfil(pg, seed, falha, esperado):
    from app.features.usuarios.service import excluir_usuario_admin
    uid = _usuario_novo(pg)
    with pg() as db:
        antes = db.get(Usuario, uid).to_dict()
    cliente = Mock()
    cliente.auth.admin.delete_user.side_effect = falha
    with pg() as db:
        assert erro(excluir_usuario_admin, db, cliente, str(seed['users'][2]), str(uid)) == esperado
    cliente.auth.admin.delete_user.assert_called_once_with(str(uid), should_soft_delete=False)
    with pg() as db:
        assert db.get(Usuario, uid).to_dict() == antes
