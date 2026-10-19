"""Fase 4: caracterização das funções grandes antes e depois de divididas.

Fixam mensagens, códigos, status, efeitos e ordem de locks, que não podem mudar.
"""
import re
from decimal import Decimal
from unittest.mock import Mock
from uuid import UUID, uuid4

import pytest
from sqlalchemy import event, text

from app.core.errors import ApiError
from app.features.vendas.admin_service import alterar_venda
from app.features.vendas.service import processar_venda, registrar_pagamento_divida
from app.models import Caixa, ItemVenda, Membro, MovimentacaoMembro, Produto, Venda
from test_admin_finance_postgres import criar, edicao
from test_extrato_membros import historico  # noqa: F401 (fixture)
from test_finance_postgres import payment, sale

pytestmark = pytest.mark.postgres


def erro(funcao, *args, **kwargs):
    with pytest.raises(ApiError) as capturado:
        funcao(*args, **kwargs)
    return capturado.value.code, capturado.value.status_code, capturado.value.message


class Locks:
    """Registra, em ordem, as tabelas bloqueadas com FOR UPDATE e o advisory lock."""

    def __init__(self, pg):
        self.engine = pg.kw['bind']
        self.ordem = []

    def _registrar(self, conn, cursor, statement, parameters, context, executemany):
        if 'pg_advisory_xact_lock' in statement:
            self.ordem.append('advisory')
        elif 'FOR UPDATE' in statement:
            self.ordem.append(re.search(r'\bFROM (\w+)', statement)[1])

    def __enter__(self):
        event.listen(self.engine, 'before_cursor_execute', self._registrar)
        return self

    def __exit__(self, *exc):
        event.remove(self.engine, 'before_cursor_execute', self._registrar)


# ─── Etapa 14: alterar_venda ───

def test_alterar_venda_inexistente(pg, seed):
    with pg() as db:
        assert erro(alterar_venda, db, uuid4(), {'versao': 1}, excluir=True) == (
            'VENDA_NAO_ENCONTRADA', 404, 'Venda não encontrada.')


def test_alterar_venda_valida_itens_e_metodo(pg, seed):
    with pg() as db:
        id, _ = criar(db, seed)
        dados = edicao(db, id)
        repetido = {**dados, 'itens': dados['itens'] * 2}
        mensagem_itens = ('ITENS_INVALIDOS', 422, 'Envie cada item da venda uma vez; quantidade zero remove o item.')
        assert erro(alterar_venda, db, id, repetido) == mensagem_itens
        assert erro(alterar_venda, db, id, {**dados, 'itens': []}) == mensagem_itens
        mensagem_metodo = ('METODO_INVALIDO', 422, 'Método incompatível com o tipo da venda.')
        assert erro(alterar_venda, db, id, {**dados, 'metodo_pagamento': 'fiado'}) == mensagem_metodo
        # Itens inválidos têm precedência sobre o método.
        assert erro(alterar_venda, db, id, {**repetido, 'metodo_pagamento': 'fiado'}) == mensagem_itens
        assert erro(alterar_venda, db, id, edicao(db, id, quantidade=0)) == (
            'VENDA_SEM_ITENS', 422, 'Mantenha um item ou exclua a venda.')
        fiado, _ = criar(db, seed, metodo='fiado', membro_id=seed['member'])
        assert erro(alterar_venda, db, fiado, edicao(db, fiado, metodo_pagamento='pix')) == mensagem_metodo
        assert db.get(Produto, seed['product']).estoque_bar == 6


def test_alterar_recebimento_exige_valor_e_atualiza_movimento(pg, seed):
    with pg() as db:
        criar(db, seed, metodo='fiado', membro_id=seed['member'])
        recibo = UUID(registrar_pagamento_divida(db, payment(seed, saldo_esperado='20', valor='8'))['venda_id'])
        assert erro(alterar_venda, db, recibo, edicao(db, recibo)) == (
            'VALOR_OBRIGATORIO', 422, 'Informe o valor do recebimento ou ajuste.')
        resultado = alterar_venda(db, recibo, edicao(db, recibo, valor_total='5', metodo_pagamento='dinheiro',
                                                     nome_cliente='Cliente', observacoes='obs'))
        assert resultado == {'status': 'ok', 'mensagem': 'Venda atualizada; estoque e valores recalculados.'}
        venda = db.get(Venda, recibo)
        assert (venda.valor_total, venda.metodo_pagamento, venda.nome_cliente, venda.observacoes, venda.versao,
                venda.payload_hash) == (5, 'dinheiro', 'Cliente', 'obs', 2, None)
        movimento = db.query(MovimentacaoMembro).filter_by(venda_id=recibo).one()
        assert (movimento.valor, movimento.versao) == (5, 2)
        assert db.get(Membro, seed['member']).saldo_devedor == 15


@pytest.mark.parametrize(('cenario', 'mensagem'), [
    ('membro_divergente', 'Venda com vínculos de membros inconsistentes.'),
    ('sem_movimento', 'Venda sem uma movimentação financeira correspondente.'),
    ('valor_divergente', 'Movimentação diverge da venda; reconcilie antes de alterar.'),
    ('tipo_divergente', 'Movimentação diverge da venda; reconcilie antes de alterar.'),
])
def test_alterar_venda_recusa_vinculos_inconsistentes(pg, seed, cenario, mensagem):
    with pg() as db:
        if cenario == 'membro_divergente':
            id, _ = criar(db, seed)
            db.add(MovimentacaoMembro(membro_id=seed['member'], venda_id=id, tipo_movimentacao='debito',
                                      origem='venda_fiado', valor=20))
        else:
            id, _ = criar(db, seed, metodo='fiado', membro_id=seed['member'])
            movimento = db.query(MovimentacaoMembro).filter_by(venda_id=id).one()
            if cenario == 'sem_movimento':
                db.delete(movimento)
            elif cenario == 'valor_divergente':
                movimento.valor = 19
            else:
                movimento.tipo_movimentacao = 'credito'
        db.commit()
        assert erro(alterar_venda, db, id, {'versao': 1}, excluir=True) == ('VINCULO_INCONSISTENTE', 409, mensagem)
        assert db.get(Venda, id) is not None


def test_alterar_venda_com_produto_historico_ausente(pg, seed):
    with pg() as db:
        id, _ = criar(db, seed)
        db.execute(text('UPDATE itens_venda SET produto_id = NULL WHERE venda_id = :id'), {'id': id})
        db.commit()
        assert erro(alterar_venda, db, id, {'versao': 1}, excluir=True) == (
            'PRODUTO_AUSENTE', 409, 'Produto histórico ausente; não é possível reconciliar seu estoque.')
        # Sem variação de quantidade o item sem produto pode ser editado (preço).
        alterar_venda(db, id, edicao(db, id, quantidade=2, preco='7.50'))
        assert db.get(Venda, id).valor_total == 15
        assert db.get(Produto, seed['product']).estoque_bar == 8


def test_alterar_venda_remove_item_zerado_e_recalcula(pg, seed):
    with pg() as db:
        payload = sale(seed, itens=[{'id': seed['product'], 'qtd': 4, 'obs': 'A'},
                                    {'id': seed['product'], 'qtd': 3, 'obs': 'B'}])
        id = UUID(processar_venda(db, payload)['venda_id'])
        dados = edicao(db, id)
        primeiro = db.query(ItemVenda).filter_by(venda_id=id, observacoes='A').one().id
        for item in dados['itens']:
            item.update(quantidade=0 if item['id'] == str(primeiro) else 5, preco_unitario='2.00',
                        observacoes='nova')
        alterar_venda(db, id, dados)
        itens = db.query(ItemVenda).filter_by(venda_id=id).all()
        assert [(i.quantidade, i.preco_unitario, i.preco_total, i.observacoes) for i in itens] == [(5, 2, 10, 'nova')]
        assert db.get(Venda, id).valor_total == 10
        assert db.get(Produto, seed['product']).estoque_bar == 5


def test_excluir_venda_fiada_respeita_ordem_de_locks(pg, seed):
    tabelas = {modelo: modelo.__tablename__ for modelo in (Caixa, Venda, Membro, MovimentacaoMembro, Produto)}
    with pg() as db:
        id, _ = criar(db, seed, metodo='fiado', membro_id=seed['member'])
        with Locks(pg) as locks:
            resultado = alterar_venda(db, id, {'versao': 1}, excluir=True)
        assert resultado == {'status': 'ok', 'mensagem': 'Venda excluída.'}
        assert locks.ordem == ['advisory', tabelas[Caixa], tabelas[Venda], tabelas[Membro],
                               tabelas[MovimentacaoMembro], tabelas[Produto]]
        assert db.get(Membro, seed['member']).saldo_devedor == Decimal('0')


# ─── Etapa 15: editar_usuario ───

def _usuarios(pg, seed):
    from app.models import Usuario
    with pg() as db:
        return [db.get(Usuario, uid).to_dict() for uid in seed['users']]


@pytest.mark.parametrize(('dados', 'esperado'), [
    ({'perfil': 'gerente'}, ('PERFIL_INVALIDO', 422, 'Perfil deve ser "admin" ou "operador".')),
    ({'nome': '  '}, ('NOME_OBRIGATORIO', 422, 'Nome é obrigatório.')),
    ({'nome': None}, ('NOME_OBRIGATORIO', 422, 'Nome é obrigatório.')),
    ({'email': ' '}, ('EMAIL_OBRIGATORIO', 422, 'Email é obrigatório.')),
    ({'senha': '12345'}, ('SENHA_INVALIDA', 422, 'A senha deve ter pelo menos 6 caracteres.')),
    # Precedência: perfil → ativo → nome → email → senha.
    ({'perfil': 'gerente', 'nome': ' ', 'senha': '1'}, ('PERFIL_INVALIDO', 422, 'Perfil deve ser "admin" ou "operador".')),
    ({'nome': ' ', 'email': ' ', 'senha': '1'}, ('NOME_OBRIGATORIO', 422, 'Nome é obrigatório.')),
    ({'email': ' ', 'senha': '1'}, ('EMAIL_OBRIGATORIO', 422, 'Email é obrigatório.')),
])
def test_editar_usuario_valida_campos(pg, seed, dados, esperado):
    from app.features.usuarios.service import editar_usuario
    auth = Mock()
    with pg() as db:
        assert erro(editar_usuario, db, auth, str(seed['users'][2]), str(seed['users'][0]), dados) == esperado
    auth.auth.admin.update_user_by_id.assert_not_called()
    assert _usuarios(pg, seed)[0]['nome'] == 'Operador 0'


def test_editar_usuario_impede_autoalteracao_e_email_duplicado(pg, seed):
    from app.features.usuarios.service import editar_usuario
    admin, outro = str(seed['users'][2]), str(seed['users'][1])
    email_outro = _usuarios(pg, seed)[1]['email']
    with pg() as db:
        assert erro(editar_usuario, db, Mock(), admin, admin, {'perfil': 'operador'}) == (
            'AUTOALTERACAO_NEGADA', 409, 'Um administrador não pode remover o próprio perfil admin.')
        assert erro(editar_usuario, db, Mock(), admin, admin, {'ativo': False}) == (
            'AUTOALTERACAO_NEGADA', 409, 'Um administrador não pode desativar a própria conta.')
        assert erro(editar_usuario, db, Mock(), admin, str(seed['users'][0]), {'email': email_outro.upper()}) == (
            'EMAIL_EM_USO', 409, 'Já existe outro usuário com este email.')
        # O próprio email atual não conta como duplicado; perfil admin para si mesmo é permitido.
        assert editar_usuario(db, Mock(), admin, outro, {'email': email_outro})['mensagem'] == 'Usuário atualizado.'
        assert editar_usuario(db, Mock(), admin, admin, {'perfil': 'admin', 'ativo': True})['usuario']['perfil'] == 'admin'


def test_editar_usuario_sem_alteracoes_nao_chama_auth(pg, seed):
    from app.features.usuarios.service import editar_usuario
    auth = Mock()
    with pg() as db:
        for dados in ({}, {'senha': '   '}, {'senha': None}):
            resultado = editar_usuario(db, auth, str(seed['users'][2]), str(seed['users'][0]), dados)
            assert resultado['mensagem'] == 'Nenhuma alteração enviada.'
            assert resultado['usuario']['nome'] == 'Operador 0'
    auth.auth.admin.update_user_by_id.assert_not_called()


def test_editar_usuario_envia_ao_auth_somente_campos_de_identidade(pg, seed):
    from app.features.usuarios.service import editar_usuario
    auth = Mock()
    alvo = str(seed['users'][0])
    with pg() as db:
        resultado = editar_usuario(db, auth, str(seed['users'][2]), alvo, {'perfil': 'admin'})
        auth.auth.admin.update_user_by_id.assert_not_called()
        assert resultado['usuario']['perfil'] == 'admin'
        resultado = editar_usuario(db, auth, str(seed['users'][2]), alvo, {
            'perfil': 'operador', 'ativo': False, 'nome': ' Novo Nome ', 'email': ' NOVO@Example.test ',
            'senha': ' segredo1 '})
    auth.auth.admin.update_user_by_id.assert_called_once_with(alvo, {
        'ban_duration': '876000h', 'user_metadata': {'nome': 'Novo Nome'},
        'email': 'novo@example.test', 'password': 'segredo1'})
    assert resultado['mensagem'] == 'Usuário atualizado.'
    usuario = _usuarios(pg, seed)[0]
    assert (usuario['perfil'], usuario['ativo'], usuario['nome'], usuario['email']) == (
        'operador', False, 'Novo Nome', 'novo@example.test')


def test_editar_usuario_recusa_do_auth_nao_altera_perfil(pg, seed):
    from supabase_auth.errors import AuthApiError
    from app.features.usuarios.service import editar_usuario
    auth = Mock()
    auth.auth.admin.update_user_by_id.side_effect = AuthApiError('recusado', 422, None)
    with pg() as db:
        assert erro(editar_usuario, db, auth, str(seed['users'][2]), str(seed['users'][0]), {'nome': 'Outro'}) == (
            'AUTH_RECUSOU', 400, 'O serviço de autenticação recusou a operação. Verifique os dados informados.')
    assert _usuarios(pg, seed)[0]['nome'] == 'Operador 0'


def test_editar_usuario_falha_local_reverte_o_auth(pg, seed, monkeypatch):
    from app.features.usuarios.service import editar_usuario
    auth = Mock()
    alvo = str(seed['users'][0])
    original = _usuarios(pg, seed)[0]
    with pg() as db:
        monkeypatch.setattr(db, 'commit', Mock(side_effect=RuntimeError('falha sintética')))
        assert erro(editar_usuario, db, auth, str(seed['users'][2]), alvo,
                    {'ativo': False, 'nome': 'Outro', 'email': 'outro@example.test', 'senha': 'segredo1'}) == (
            'USUARIO_NAO_ATUALIZADO', 503,
            'Não foi possível atualizar o usuário. Confirme o estado antes de repetir.')
    assert auth.auth.admin.update_user_by_id.call_args_list[1].args == (alvo, {
        'email': original['email'], 'user_metadata': {'nome': 'Operador 0'}, 'ban_duration': 'none'})
    assert _usuarios(pg, seed)[0] == original


# ─── Etapa 16: gerar_relatorio ───

def _movimento_do_turno(db, seed):
    """Operador 0 (caixa 0): uma venda por método, um fiado e um recebimento; operador 1: uma venda."""
    for metodo in ('dinheiro', 'pix', 'cartao_credito', 'cartao_debito'):
        processar_venda(db, sale(seed, metodo=metodo))
    processar_venda(db, sale(seed, metodo='fiado', membro_id=seed['member'], itens=[{'id': seed['product'], 'qtd': 2}]))
    registrar_pagamento_divida(db, payment(seed, metodo='dinheiro', saldo_esperado='20', valor='5'))
    processar_venda(db, sale(seed, 1, metodo='pix'))


def _historico(db, filtros):
    from app.core.tempo import FUSO
    vendas = db.query(Venda).filter(*filtros).order_by(Venda.criado_em, Venda.id).all()
    return [(str(v.id), v.criado_em.astimezone(FUSO).strftime('%d/%m %H:%M')) for v in vendas]


def test_relatorio_de_turno_completo(pg, seed):
    from app.features.relatorios.service import gerar_relatorio
    with pg() as db:
        _movimento_do_turno(db, seed)
        resultado = gerar_relatorio(db, 'TURNO', {'operador_id': str(seed['users'][0]), 'caixa_id': str(seed['boxes'][0])})
        ids = _historico(db, [Venda.caixa_id == seed['boxes'][0]])
    linhas = [('1x Água', 10.0, 'DINHEIRO', 'VENDA'), ('1x Água', 10.0, 'PIX', 'VENDA'),
              ('1x Água', 10.0, 'CARTAO_CREDITO', 'VENDA'), ('1x Água', 10.0, 'CARTAO_DEBITO', 'VENDA'),
              ('2x Água', 20.0, 'FIADO', 'FIADO'),
              ('RECEBIMENTO CONTA - Membro sintético', 5.0, 'DINHEIRO', 'RECEBIMENTO')]
    assert resultado == {
        'status': 'ok', 'dinheiro': 15.0, 'pix': 10.0, 'cartao': 20.0, 'vendasFiado': 20.0,
        'recebimentoDivida': 5.0, 'totalEntradas': 45.0, 'abertura': 100.0, 'totalGeral': 145.0,
        'periodo': f"Turno: {seed['boxes'][0]}", 'produtosVendidos': {'Água': 6},
        'historico': [{'id': id, 'hora': hora, 'descricao': d, 'valor': v, 'metodo': m, 'tipo': t}
                      for (id, hora), (d, v, m, t) in zip(ids, linhas)],
        'historico_truncado': False, 'paginacao': {'limite': 500, 'offset': 0, 'tem_mais': False},
    }


def test_relatorio_pagina_o_historico_sem_afetar_totais(pg, seed):
    from app.features.relatorios.service import gerar_relatorio
    with pg() as db:
        _movimento_do_turno(db, seed)
        filtro = {'operador_id': str(seed['users'][0]), 'caixa_id': str(seed['boxes'][0])}
        pagina = gerar_relatorio(db, 'TURNO', {**filtro, 'limite': '2', 'offset': '4'})
        primeira = gerar_relatorio(db, 'TURNO', {**filtro, 'limite': '2'})
        ids = [id for id, _ in _historico(db, [Venda.caixa_id == seed['boxes'][0]])]
    assert [h['id'] for h in pagina['historico']] == ids[4:6]
    assert (pagina['historico_truncado'], pagina['paginacao']) == (True, {'limite': 2, 'offset': 4, 'tem_mais': False})
    assert (primeira['historico_truncado'], primeira['paginacao']) == (True, {'limite': 2, 'offset': 0, 'tem_mais': True})
    assert (pagina['totalGeral'], pagina['produtosVendidos']) == (145.0, {'Água': 6})


@pytest.mark.parametrize('tipo', ['DIA', 'PERIODO'])
def test_relatorio_por_data_filtra_operador_e_abertura(pg, seed, tipo):
    from datetime import datetime
    from app.core.tempo import FUSO
    from app.features.relatorios.service import gerar_relatorio
    hoje = datetime.now(FUSO).date()
    filtro = {'inicio': hoje.isoformat(), 'fim': hoje.isoformat()} if tipo == 'PERIODO' else {}
    with pg() as db:
        _movimento_do_turno(db, seed)
        operador = gerar_relatorio(db, tipo, {**filtro, 'operador_id': str(seed['users'][1])})
        admin = gerar_relatorio(db, tipo, {**filtro, 'operador_id': str(seed['users'][2]), 'perfil': 'admin'})
    assert (operador['pix'], operador['totalEntradas'], operador['abertura'], operador['totalGeral']) == (10.0, 10.0, 100.0, 110.0)
    assert [h['metodo'] for h in operador['historico']] == ['PIX']
    assert (admin['pix'], admin['totalEntradas'], admin['abertura'], admin['totalGeral']) == (20.0, 55.0, 200.0, 255.0)
    assert admin['produtosVendidos'] == {'Água': 7} and len(admin['historico']) == 7
    if tipo == 'PERIODO':
        assert admin['periodo'] == f'Período: {hoje:%d/%m/%Y} até {hoje:%d/%m/%Y}'
    else:
        assert admin['periodo'].startswith('Dia (Operação): ')


def test_relatorio_de_turno_respeita_dono_do_caixa(pg, seed):
    from app.features.relatorios.service import gerar_relatorio
    with pg() as db:
        filtro = {'operador_id': str(seed['users'][1]), 'caixa_id': str(seed['boxes'][0])}
        assert erro(gerar_relatorio, db, 'TURNO', filtro) == ('CAIXA_NAO_AUTORIZADO', 403, 'Caixa pertence a outro operador.')
        assert gerar_relatorio(db, 'TURNO', {**filtro, 'perfil': 'admin'})['abertura'] == 100.0


OPERADOR = 'operador-do-seed'


@pytest.mark.parametrize(('tipo', 'filtro', 'esperado'), [
    ('DIA', {}, ('OPERADOR_INVALIDO', 422, 'Operador não identificado.')),
    ('DIA', {'operador_id': 'x'}, ('OPERADOR_INVALIDO', 422, 'Operador não identificado.')),
    ('TURNO', {'operador_id': 'x', 'caixa_id': 'x'}, ('OPERADOR_INVALIDO', 422, 'Operador não identificado.')),
    ('TURNO', {'operador_id': OPERADOR}, ('CAIXA_OBRIGATORIO', 422, 'Informe o caixa do turno.')),
    ('TURNO', {'operador_id': OPERADOR, 'caixa_id': 'x', 'limite': 0}, ('CAIXA_INVALIDO', 422, 'Identificador de caixa inválido.')),
    ('TURNO', {'operador_id': OPERADOR, 'caixa_id': str(UUID(int=1))}, ('CAIXA_NAO_ENCONTRADO', 404, 'Caixa não encontrado.')),
    ('PERIODO', {'operador_id': OPERADOR, 'inicio': '2025-01-01'}, ('PERIODO_INVALIDO', 422, 'Informe datas no formato AAAA-MM-DD.')),
    ('PERIODO', {'operador_id': OPERADOR, 'inicio': '01/01/2025', 'fim': '2025-01-02'}, ('PERIODO_INVALIDO', 422, 'Informe datas no formato AAAA-MM-DD.')),
    ('PERIODO', {'operador_id': OPERADOR, 'inicio': '2025-01-02', 'fim': '2025-01-01'}, ('PERIODO_INVALIDO', 422, 'Use um período ordenado de até 367 dias.')),
    ('PERIODO', {'operador_id': OPERADOR, 'inicio': '2024-01-01', 'fim': '2025-01-02'}, ('PERIODO_INVALIDO', 422, 'Use um período ordenado de até 367 dias.')),
    ('PERIODO', {'operador_id': OPERADOR, 'inicio': 'x', 'limite': 0}, ('PERIODO_INVALIDO', 422, 'Informe datas no formato AAAA-MM-DD.')),
    ('SEMANA', {'operador_id': OPERADOR, 'limite': 0}, ('TIPO_INVALIDO', 422, 'Tipo de relatório inválido.')),
    ('DIA', {'operador_id': OPERADOR, 'limite': 'x'}, ('PAGINACAO_INVALIDA', 422, 'Paginação inválida.')),
    ('DIA', {'operador_id': OPERADOR, 'limite': 0}, ('PAGINACAO_INVALIDA', 422, 'Paginação inválida.')),
    ('DIA', {'operador_id': OPERADOR, 'limite': 501}, ('PAGINACAO_INVALIDA', 422, 'Paginação inválida.')),
    ('DIA', {'operador_id': OPERADOR, 'offset': -1}, ('PAGINACAO_INVALIDA', 422, 'Paginação inválida.')),
])
def test_relatorio_erros_e_precedencia(pg, seed, tipo, filtro, esperado):
    from app.features.relatorios.service import gerar_relatorio
    dados = {k: str(seed['users'][0]) if v == OPERADOR else v for k, v in filtro.items()}
    with pg() as db:
        assert erro(gerar_relatorio, db, tipo, dados) == esperado


# ─── Etapa 17: consultar_extrato ───

AVISO_EXTRATO = ('O histórico não corresponde ao saldo atual. Não é possível atribuir quitação aos lançamentos; '
                 'confira os registros com o administrador.')


def _linha(data, descricao, tipo, origem, valor, aberto, situacao):
    return {'data': data, 'tipo': tipo, 'origem': origem, 'descricao': descricao, 'valor': valor, 'versao': 1,
            'venda_id': None, 'valor_aberto': aberto,
            'valor_abatido': valor - aberto if aberto is not None else None, 'situacao': situacao}


def test_extrato_completo_com_fifo(pg, historico):
    from app.features.membros.service import buscar_extrato_membro
    with pg() as db:
        resultado = buscar_extrato_membro(db, str(historico))
        membro = db.get(Membro, historico).to_dict()
    for item in resultado['itens']:
        UUID(item.pop('id'))
    assert resultado == {
        'membro': membro, 'total': 150.0,
        'itens': [
            _linha('11/03/2026 12:00', '2026-03-11T12:00', 'credito', 'ajuste_manual', 20.0, None, 'credito'),
            _linha('10/03/2026 12:00', '2026-03-10T12:00', 'credito', 'pagamento', 180.0, None, 'pagamento'),
            _linha('01/03/2026 00:00', '2026-03-01T00:00', 'debito', 'venda_fiado', 50.0, 50.0, 'em_aberto'),
            _linha('01/02/2026 00:00', '2026-02-01T00:00', 'debito', 'venda_fiado', 200.0, 100.0, 'parcial'),
            _linha('15/01/2026 12:00', '2026-01-15T12:00', 'debito', 'venda_fiado', 100.0, 0.0, 'quitado'),
        ],
        'periodo': {'inicio': None, 'fim': None},
        'resumo': {'total_periodo': 350.0, 'total_pago_periodo': 180.0, 'total_creditos_ajuste_periodo': 20.0,
                   'total_aberto_periodo': 150.0, 'total_abatido_periodo': 200.0, 'divida_total_atual': 150.0},
        'criterio_quitacao': 'fifo_informativo', 'aviso': None,
        'paginacao': {'limite': 100, 'offset': 0, 'tem_mais': False, 'total': 5},
    }


def test_extrato_com_movimento_sem_direcao_nao_atribui_quitacao(pg, historico):
    from datetime import datetime
    from app.core.tempo import FUSO
    from app.features.membros.service import buscar_extrato_membro
    with pg.begin() as db:
        db.add(MovimentacaoMembro(membro_id=historico, tipo_movimentacao='ajuste', origem='ajuste_manual',
                                  valor=Decimal('5'), descricao='legado',
                                  criado_em=datetime(2026, 3, 12, 9, 30, tzinfo=FUSO)))
    with pg() as db:
        resultado = buscar_extrato_membro(db, str(historico), data_inicio='2026-03-01', data_fim='2026-03-31', limite=2)
    assert [(i['tipo'], i['situacao'], i['valor_aberto'], i['valor_abatido']) for i in resultado['itens']] == [
        ('ajuste', 'nao_identificado', None, None), ('credito', 'credito', None, None)]
    assert resultado['aviso'] == AVISO_EXTRATO
    assert resultado['periodo'] == {'inicio': '2026-03-01', 'fim': '2026-03-31'}
    assert resultado['resumo'] == {
        'total_periodo': 50.0, 'total_pago_periodo': 180.0, 'total_creditos_ajuste_periodo': 20.0,
        'total_aberto_periodo': None, 'total_abatido_periodo': None, 'divida_total_atual': 150.0}
    assert resultado['paginacao'] == {'limite': 2, 'offset': 0, 'tem_mais': True, 'total': 4}
    with pg() as db:
        debitos = buscar_extrato_membro(db, str(historico), data_inicio='2026-01-01', data_fim='2026-02-28')
    assert [i['situacao'] for i in debitos['itens']] == ['nao_identificado', 'nao_identificado']


# ─── Etapa 18: _criar_venda ───

def test_criar_venda_fiada_grava_registros_e_respeita_ordem_de_locks(pg, seed):
    tabelas = {modelo: modelo.__tablename__ for modelo in (Caixa, Membro, Produto)}
    with pg() as db:
        segundo = Produto(nome='Cerveja', preco_atual='7.005', estoque_bar=5, estoque_deposito=0)
        db.add(segundo)
        db.commit()
        payload = sale(seed, metodo='fiado', membro_id=seed['member'], cliente='Ignorado', itens=[
            {'id': segundo.id, 'qtd': 2, 'obs': 'gelada', 'nome': 'nome do cliente'},
            {'id': seed['product'], 'qtd': 1},
            {'id': segundo.id, 'qtd': 1}])
        with Locks(pg) as locks:
            resultado = processar_venda(db, payload)
        assert locks.ordem == ['advisory', tabelas[Caixa], tabelas[Membro], tabelas[Produto]]
        venda = db.get(Venda, UUID(resultado['venda_id']))
        assert resultado == {
            'status': 'ok', 'id_externo': payload.id_externo, 'venda_id': str(venda.id),
            'caixa_id': str(seed['boxes'][0]), 'usuario_id': str(seed['users'][0]),
            'total_calculado': 31.03, 'mensagem': 'Operação confirmada.'}
        assert (venda.tipo_venda, venda.metodo_pagamento, venda.nome_cliente, venda.membro_id, venda.valor_total) == (
            'fiado', 'fiado', 'Membro sintético', seed['member'], Decimal('31.03'))
        itens = sorted((i.nome_produto, i.quantidade, i.preco_unitario, i.preco_total, i.observacoes) for i in venda.itens)
        assert itens == [('Cerveja', 1, Decimal('7.01'), Decimal('7.01'), ''),
                         ('Cerveja', 2, Decimal('7.01'), Decimal('14.02'), 'gelada'),
                         ('Água', 1, Decimal('10.00'), Decimal('10.00'), '')]
        assert (db.get(Produto, segundo.id).estoque_bar, db.get(Produto, seed['product']).estoque_bar) == (2, 9)
        movimento = db.query(MovimentacaoMembro).filter_by(venda_id=venda.id).one()
        assert (movimento.tipo_movimentacao, movimento.origem, movimento.descricao, movimento.valor,
                movimento.usuario_id) == ('debito', 'venda_fiado', 'Venda fiado', Decimal('31.03'), seed['users'][0])
        assert db.get(Membro, seed['member']).saldo_devedor == Decimal('31.03')


def test_criar_venda_normal_usa_cliente_e_nao_bloqueia_membro(pg, seed):
    with pg() as db:
        with Locks(pg) as locks:
            resultado = processar_venda(db, sale(seed, cliente='Mesa 4', metodo='pix'))
        assert locks.ordem == ['advisory', Caixa.__tablename__, Produto.__tablename__]
        venda = db.get(Venda, UUID(resultado['venda_id']))
        assert (venda.tipo_venda, venda.nome_cliente, venda.membro_id) == ('normal', 'Mesa 4', None)
        assert db.query(MovimentacaoMembro).count() == 0


@pytest.mark.parametrize(('ajuste', 'itens', 'esperado'), [
    ('nenhum', [{'id': 999999, 'qtd': 1}],
     ('PRODUTO_NAO_ENCONTRADO', 404, 'Produto não encontrado.', {'produto_id': 999999})),
    ('inativo', [{'id': 'seed', 'qtd': 1}],
     ('PRODUTO_INATIVO', 409, 'Produto inativo.', {'produto_id': 'seed'})),
    ('nenhum', [{'id': 'seed', 'qtd': 6}, {'id': 'seed', 'qtd': 5}],
     ('ESTOQUE_INSUFICIENTE', 409, 'Estoque insuficiente.', {'produto_id': 'seed', 'disponivel': 10, 'solicitado': 11})),
    # Validação segue a ordem dos itens enviados.
    ('inativo', [{'id': 999999, 'qtd': 1}, {'id': 'seed', 'qtd': 1}],
     ('PRODUTO_NAO_ENCONTRADO', 404, 'Produto não encontrado.', {'produto_id': 999999})),
    ('inativo', [{'id': 'seed', 'qtd': 1}, {'id': 999999, 'qtd': 1}],
     ('PRODUTO_INATIVO', 409, 'Produto inativo.', {'produto_id': 'seed'})),
])
def test_criar_venda_valida_produtos(pg, seed, ajuste, itens, esperado):
    trocar = lambda v: seed['product'] if v == 'seed' else v
    with pg() as db:
        if ajuste == 'inativo':
            db.get(Produto, seed['product']).ativo = False
            db.commit()
        payload = sale(seed, itens=[{**i, 'id': trocar(i['id'])} for i in itens])
        with pytest.raises(ApiError) as capturado:
            processar_venda(db, payload)
        e = capturado.value
        code, status, mensagem, detalhes = esperado
        assert (e.code, e.status_code, e.message, e.details) == (
            code, status, mensagem, {k: trocar(v) for k, v in detalhes.items()})
        assert db.query(Venda).count() == 0 and db.get(Produto, seed['product']).estoque_bar == 10


@pytest.mark.parametrize(('ativo', 'esperado'), [
    (False, ('MEMBRO_INATIVO', 409, 'Membro inativo.')),
    (None, ('MEMBRO_NAO_ENCONTRADO', 404, 'Membro não encontrado.')),
])
def test_criar_venda_fiada_exige_membro_ativo(pg, seed, ativo, esperado):
    with pg() as db:
        membro_id = seed['member'] if ativo is not None else uuid4()
        if ativo is not None:
            db.get(Membro, seed['member']).ativo = ativo
            db.commit()
        # Membro é validado antes dos produtos.
        payload = sale(seed, metodo='fiado', membro_id=membro_id, itens=[{'id': 999999, 'qtd': 1}])
        assert erro(processar_venda, db, payload) == esperado


def test_criar_venda_valida_caixa_antes_do_membro(pg, seed):
    with pg() as db:
        payload = sale(seed, caixa_id=seed['boxes'][1], metodo='fiado', membro_id=uuid4())
        assert erro(processar_venda, db, payload) == ('CAIXA_NAO_AUTORIZADO', 403, 'Caixa pertence a outro operador.')


def test_criar_venda_duplicada_devolve_confirmacao_sem_novos_efeitos(pg, seed):
    with pg() as db:
        payload = sale(seed)
        original = processar_venda(db, payload)
        with Locks(pg) as locks:
            duplicado = processar_venda(db, payload)
        assert locks.ordem == ['advisory']
        assert duplicado == {**original, 'status': 'duplicado', 'mensagem': 'Operação já confirmada.'}
        assert db.get(Produto, seed['product']).estoque_bar == 9
