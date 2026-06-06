from supabase import Client, create_client

from app.config import SUPABASE_KEY, SUPABASE_URL

_client: Client | None = None


def get_supabase() -> Client:
    global _client
    if _client is None:
        if not SUPABASE_URL or not SUPABASE_KEY:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env")
        _client = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _client


def get_table(schema: str, table: str):
    """Return a PostgREST query builder for a non-public schema table."""
    return get_supabase().schema(schema).table(table)
