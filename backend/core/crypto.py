"""Subscriber access code hashing (HMAC-SHA256 + pepper). Legacy plain SHA-256 verified for upgrade."""

from __future__ import annotations

import hashlib
import hmac
import secrets

# Short human-facing subscriber codes; only the HMAC digest is stored.
SUBSCRIBER_SECRET_LENGTH = 9
# Uppercase + digits, excluding ambiguous 0/O/1/I/L.
SUBSCRIBER_SECRET_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"


def generate_subscriber_secret(length: int | None = None) -> str:
    """Return a random subscriber-facing secret (default length ``SUBSCRIBER_SECRET_LENGTH``)."""
    n = SUBSCRIBER_SECRET_LENGTH if length is None else int(length)
    if n < 6:
        raise ValueError("subscriber secret length must be at least 6")
    return "".join(secrets.choice(SUBSCRIBER_SECRET_ALPHABET) for _ in range(n))


def legacy_sha256_hex(raw: str) -> str:
    """Pre-pepper storage format (hex of SHA-256 UTF-8)."""
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def hmac_sha256_hex(raw: str, pepper: bytes) -> str:
    """Current storage format: HMAC-SHA256(pepper, secret) hex digest."""
    return hmac.new(pepper, raw.encode("utf-8"), hashlib.sha256).hexdigest()


def digest_for_storage(raw: str, pepper: bytes) -> str:
    return hmac_sha256_hex(raw, pepper)


def get_subscriber_pepper() -> bytes:
    """Pepper bytes for HMAC. DEBUG without SUBSCRIBER_TOKEN_PEPPER falls back to SECRET_KEY (dev only)."""
    from django.conf import settings
    from django.core.exceptions import ImproperlyConfigured

    p = (getattr(settings, "SUBSCRIBER_TOKEN_PEPPER", None) or "").strip()
    if p:
        return p.encode("utf-8")
    if settings.DEBUG:
        return settings.SECRET_KEY.encode("utf-8")
    raise ImproperlyConfigured(
        "Set SUBSCRIBER_TOKEN_PEPPER in the environment when DEBUG=False (long random secret, not in git)."
    )


def find_active_subscriber_token(raw: str, pepper: bytes):
    """Lookup by HMAC digest; on legacy SHA-256 match, upgrade row to HMAC in-place. Returns SubscriberToken or None."""
    from core.models import SubscriberToken

    trimmed = (raw or "").strip()
    if not trimmed:
        return None

    new_digest = digest_for_storage(trimmed, pepper)
    try:
        return SubscriberToken.objects.get(token_hash=new_digest, is_active=True)
    except SubscriberToken.DoesNotExist:
        pass

    # Dev-only: tokens may have been hashed with SECRET_KEY as pepper before
    # SUBSCRIBER_TOKEN_PEPPER was added; rehash to the canonical pepper on match.
    from django.conf import settings as dj_settings

    if dj_settings.DEBUG:
        sk_pepper = dj_settings.SECRET_KEY.encode("utf-8")
        if sk_pepper != pepper:
            alt_digest = digest_for_storage(trimmed, sk_pepper)
            try:
                st = SubscriberToken.objects.get(
                    token_hash=alt_digest, is_active=True
                )
            except SubscriberToken.DoesNotExist:
                pass
            else:
                st.token_hash = new_digest
                st.save(update_fields=["token_hash"])
                return st

    old_digest = legacy_sha256_hex(trimmed)
    try:
        st = SubscriberToken.objects.get(token_hash=old_digest, is_active=True)
    except SubscriberToken.DoesNotExist:
        return None

    st.token_hash = new_digest
    st.save(update_fields=["token_hash"])
    return st
