"""Contrato entre as páginas renderizadas e o JS que as controla.

Substitui o snapshot por hash da estrutura HTML (plans/padronizacao-bootstrap.md, F2),
que quebrava a cada ajuste visual sem dizer o quê. Aqui cada falha nomeia o problema:
ID repetido na página, ou ID usado pelo JS que não existe no template nem é criado pelo JS.
"""
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
import re

import pytest
from app import create_app

RAIZ = Path(__file__).resolve().parents[2]
JS = RAIZ / 'static' / 'js'

# Cada página carrega os módulos da sua funcionalidade; shared/ serve a todas.
PAGINAS = {'/': 'features/pdv', '/admin': 'features/admin', '/login': 'features/auth'}


class Ids(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ids = []

    def handle_starttag(self, tag, attrs):
        self.ids += [valor for nome, valor in attrs if nome == 'id' and valor]

    handle_startendtag = handle_starttag


def ids_da_pagina(rota):
    html = create_app({'TESTING': True}).test_client().get(rota).get_data(as_text=True)
    leitor = Ids()
    leitor.feed(html)
    return leitor.ids


def _codigo(pasta):
    return '\n'.join(arquivo.read_text(encoding='utf-8') for arquivo in sorted((JS / pasta).rglob('*.js')))


def ids_usados(codigo):
    """IDs literais buscados pelo JS: getElementById("x") e seletores "#x"."""
    # Só literais completos: getElementById("tab-" + nome) é montado em tempo de execução.
    por_id = re.findall(r'getElementById\(\s*["\']([\w-]+)["\']\s*\)', codigo)
    por_seletor = re.findall(r'querySelector(?:All)?\(\s*["\'`]#([\w-]+)["\'`\s]', codigo)
    return set(por_id) | set(por_seletor)


def ids_criados(codigo):
    """IDs que o próprio JS cria: id="x" em markup gerado ou elemento.id = "x"."""
    return set(re.findall(r'\bid=\\?["\']([\w-]+)', codigo)) | set(re.findall(r'\.id\s*=\s*["\']([\w-]+)', codigo))


@pytest.mark.parametrize('rota', list(PAGINAS))
def test_ids_da_pagina_sao_unicos(rota):
    repetidos = {i: n for i, n in Counter(ids_da_pagina(rota)).items() if n > 1}
    assert repetidos == {}


@pytest.mark.parametrize(('rota', 'pasta'), list(PAGINAS.items()))
def test_ids_usados_pelo_js_da_pagina_existem(rota, pasta):
    codigo = _codigo(pasta)
    disponiveis = set(ids_da_pagina(rota)) | ids_criados(codigo) | ids_criados(_codigo('shared'))
    assert sorted(ids_usados(codigo) - disponiveis) == []


def test_ids_usados_pelo_js_compartilhado_existem_em_alguma_pagina():
    codigo = _codigo('shared')
    disponiveis = set().union(*(ids_da_pagina(rota) for rota in PAGINAS)) | ids_criados(codigo)
    assert sorted(ids_usados(codigo) - disponiveis) == []


def test_login_mostra_a_versao_configurada():
    app = create_app({'TESTING': True, 'VERSAO_APP': '9.9'})
    html = app.test_client().get('/login').get_data(as_text=True)
    assert 'Versão 9.9' in html
    assert create_app({'TESTING': True}).config['VERSAO_APP'] == '2.0'
