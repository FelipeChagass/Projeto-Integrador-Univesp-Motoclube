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
    ('/', '2328eec9c374af43a65b325bf5b63e8a528656d183359154292bb3da3a02338a'),
    ('/admin', 'c7fe28571a2654c0c3ea180bf8bde1ec98af8921dcaf8b126fbd8c7e67f9eb3b'),
])
def test_rendered_structure_matches_approved_contract(path, expected):
    response = create_app({'TESTING': True}).test_client().get(path)
    assert response.status_code == 200
    assert structure_digest(response.get_data(as_text=True)) == expected
