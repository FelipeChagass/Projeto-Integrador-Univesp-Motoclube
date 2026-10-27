"""Serialização JSON com dinheiro exato: Decimal sai como número sem passar por float."""
import simplejson
from flask.json.provider import DefaultJSONProvider


class ProvedorJson(DefaultJSONProvider):
    """Mantém o contrato numérico do frontend; `Decimal('10.10')` vira `10.10`, nunca `10.1000000001`."""

    def dumps(self, obj, **kwargs):
        kwargs.setdefault('default', self.default)
        kwargs.setdefault('ensure_ascii', self.ensure_ascii)
        kwargs.setdefault('sort_keys', self.sort_keys)
        return simplejson.dumps(obj, use_decimal=True, **kwargs)
