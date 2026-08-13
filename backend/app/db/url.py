"""Normalize Postgres URLs for SQLAlchemy / psycopg."""

from __future__ import annotations

from urllib.parse import parse_qs, urlencode, urlparse, urlunparse


def with_sslmode_require(url: str) -> str:
    """Ensure external Postgres URIs request SSL (Supabase requires it).

    Leaves localhost / 127.0.0.1 alone (no SSL required). Does not override
    an explicit sslmode already in the URL.
    """
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    if host in {"localhost", "127.0.0.1", "::1"}:
        return url

    query = parse_qs(parsed.query, keep_blank_values=True)
    if any(k.lower() == "sslmode" for k in query):
        return url

    query["sslmode"] = ["require"]
    flat = {k: v[0] if len(v) == 1 else v for k, v in query.items()}
    return urlunparse(parsed._replace(query=urlencode(flat, doseq=True)))
