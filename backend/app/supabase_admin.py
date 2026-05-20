from functools import lru_cache
 
from supabase import Client, create_client
 
from app.config import Config
 
 
def _build_client_options():
    try:
        from supabase.client import ClientOptions
        return ClientOptions(auto_refresh_token=False, persist_session=False)
    except (ImportError, TypeError):
        pass
    try:
        from supabase.lib.client_options import ClientOptions  
        return ClientOptions(auto_refresh_token=False, persist_session=False)
    except (ImportError, TypeError):
        pass
 
    return None
 
 
@lru_cache(maxsize=1)
def get_supabase_admin_client() -> Client:
    """Retorna um client exclusivo para operacoes administrativas no Supabase Auth."""
    if not Config.SUPABASE_URL or not Config.SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError(
            'SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY devem estar configuradas no backend.'
        )
 
    options = _build_client_options()
 
    if options is not None:
        return create_client(
            Config.SUPABASE_URL,
            Config.SUPABASE_SERVICE_ROLE_KEY,
            options=options,
        )
 
    return create_client(
        Config.SUPABASE_URL,
        Config.SUPABASE_SERVICE_ROLE_KEY,
        options=ClientOptions(
            auto_refresh_token=False,
            persist_session=False,
        ),
    )