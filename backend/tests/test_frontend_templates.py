"""Protege a estrutura HTML aprovada das páginas compostas com parciais Jinja.

Ignora comentários/espaçamento, mas preserva tags, atributos e texto. Alterações
intencionais de UI exigem revisar os hashes; não substitui screenshots/E2E.
Revisão de utilities Bootstrap: plans/utilities-bootstrap.md (25/09/2026).
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
    ('/', '4aa9e5b8e05ab2ddf6442dc19332828115969ff609f0936d525c280e62e6f56f'),
    ('/admin', 'f7281d6be5658ca73db0db5871533794d2121afafac2b576c8472e819236a5e4'),
])
def test_rendered_structure_matches_approved_contract(path, expected):
    response = create_app({'TESTING': True}).test_client().get(path)
    assert response.status_code == 200
    assert structure_digest(response.get_data(as_text=True)) == expected
