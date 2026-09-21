"""Protege a estrutura HTML aprovada das páginas compostas com parciais Jinja.

Ignora comentários/espaçamento, mas preserva tags, atributos e texto. Alterações
intencionais de UI exigem revisar os hashes; não substitui screenshots/E2E.
"""
import hashlib
from html.parser import HTMLParser
import json
import re

import pytest
from app import create_app


class Structure(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.events = []

    def handle_starttag(self, tag, attrs):
        self.events.append(('start', tag, attrs))

    def handle_startendtag(self, tag, attrs):
        self.events.append(('empty', tag, attrs))

    def handle_endtag(self, tag):
        self.events.append(('end', tag))

    def handle_data(self, data):
        data = re.sub(r'\s+', ' ', data).strip()
        if data:
            self.events.append(('text', data))


def structure_digest(html):
    parser = Structure()
    parser.feed(html)
    content = json.dumps(parser.events, ensure_ascii=True)
    return hashlib.sha256(content.encode()).hexdigest()


@pytest.mark.parametrize(('path', 'expected'), [
    ('/', '49b108c813573a0c6c4b159ae61c3d757d6a2b583519627be649e4502d15113c'),
    ('/admin', '06c9194e27e44e120c5e6b03ef0958977c5b3d7cac79212a3a4faa4bc4c5098d'),
])
def test_rendered_structure_matches_approved_contract(path, expected):
    response = create_app({'TESTING': True}).test_client().get(path)
    assert response.status_code == 200
    assert structure_digest(response.get_data(as_text=True)) == expected
