# -*- coding: utf-8 -*-
"""RFC 7636 PKCE helpers (S256)."""
from __future__ import annotations

import base64
import hashlib
import secrets
import string

_PKCE_CHARSET = string.ascii_letters + string.digits + "-._~"


def generate_code_verifier(length: int = 64) -> str:
    """43–128 chars per RFC 7636."""
    size = max(43, min(int(length), 128))
    return "".join(secrets.choice(_PKCE_CHARSET) for _ in range(size))


def code_challenge_s256(code_verifier: str) -> str:
    digest = hashlib.sha256(code_verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")


def generate_pkce_pair(length: int = 64) -> tuple[str, str]:
    verifier = generate_code_verifier(length)
    return verifier, code_challenge_s256(verifier)
