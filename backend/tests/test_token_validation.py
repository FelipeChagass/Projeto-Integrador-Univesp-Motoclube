from types import SimpleNamespace
import time
from uuid import uuid4

import jwt
import pytest
from app.features.auth import middleware as auth
from app.core.errors import ApiError


def test_bounded_cache_uses_digest_and_only_verified_identity(monkeypatch):
    auth._token_cache.clear()
    calls = []
    user = SimpleNamespace(id=str(uuid4()), email='synthetic@example.test', user_metadata={})
    def get_user(token):
        calls.append(token)
        return SimpleNamespace(user=user)
    monkeypatch.setattr(auth, '_get_supabase_client', lambda: SimpleNamespace(auth=SimpleNamespace(get_user=get_user)))
    token = jwt.encode({'exp': time.time() + 60}, 'test-only-signing-key-of-sufficient-length', algorithm='HS256')
    assert auth._validar_token(token)['id'] == user.id
    assert auth._validar_token(token)['id'] == user.id
    assert len(calls) == 1
    assert token not in auth._token_cache
    assert auth._token_cache.maxsize == 1024
    expired = jwt.encode({'exp': time.time() - 60}, 'test-only-signing-key-of-sufficient-length', algorithm='HS256')
    assert auth._validar_token(expired) is None
    auth._token_cache.clear()


def test_unavailable_external_auth_is_retryable_and_safe(monkeypatch):
    def failed():
        raise RuntimeError('private provider internals')
    monkeypatch.setattr(auth, '_get_supabase_client', failed)
    with pytest.raises(ApiError) as error:
        auth._validar_token('synthetic-uncached')
    assert error.value.status_code == 503
    assert error.value.retryable
    assert 'private' not in error.value.message
