from functools import lru_cache

from supabase import Client, create_client

from app.config import Config

try:
    from supabase.lib.client_options import ClientOptions
except ImportError:  # pragma: no cover - fallback para versoes sem ClientOptions
    ClientOptions = None


@lru_cache(maxsize=1)
def get_supabase_admin_client() -> Client:
    """Retorna um client exclusivo para operacoes administrativas no Supabase Auth."""
    if not Config.SUPABASE_URL or not Config.SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError(
            'SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY devem estar configuradas no backend.'
        )

    if ClientOptions is not None:
        return create_client(
            Config.SUPABASE_URL,
            Config.SUPABASE_SERVICE_ROLE_KEY,
            options=ClientOptions(auto_refresh_token=False, persist_session=False),
        )

    return create_client(
        Config.SUPABASE_URL,
        Config.SUPABASE_SERVICE_ROLE_KEY,
    )