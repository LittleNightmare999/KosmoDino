"""Модульные тесты: хеширование паролей, JWT и правила жизненного цикла статьи."""
import pytest

from app.models import ArticleStatus as S
from app.models import Role
from app.security import create_access_token, decode_access_token, hash_password, verify_password
from app.services.articles import can_transition


def test_password_hash_roundtrip():
    h = hash_password("password123")
    assert h.startswith("pbkdf2_sha256$")
    assert verify_password("password123", h)
    assert not verify_password("wrong", h)


def test_same_password_gives_different_hashes():
    assert hash_password("x" * 10) != hash_password("x" * 10)


def test_malformed_hash_rejected():
    assert not verify_password("password123", "garbage")


def test_token_roundtrip():
    payload = decode_access_token(create_access_token(42, "admin"))
    assert payload["sub"] == "42" and payload["role"] == "admin"


def test_tampered_token_rejected():
    token = create_access_token(1, "reader")
    assert decode_access_token(token[:-2] + "xx") is None


@pytest.mark.parametrize(
    "src,dst,role,allowed",
    [
        (S.DRAFT, S.PENDING, Role.EDITOR, True),
        (S.DRAFT, S.PUBLISHED, Role.EDITOR, False),
        (S.PENDING, S.PUBLISHED, Role.EDITOR, False),
        (S.PENDING, S.PUBLISHED, Role.ADMIN, True),
        (S.PENDING, S.REJECTED, Role.ADMIN, True),
        (S.REJECTED, S.PENDING, Role.EDITOR, True),
        (S.PUBLISHED, S.ARCHIVED, Role.ADMIN, True),
        (S.PUBLISHED, S.ARCHIVED, Role.EDITOR, False),
        (S.ARCHIVED, S.PUBLISHED, Role.ADMIN, True),
        (S.DRAFT, S.PENDING, Role.READER, False),
        (S.PUBLISHED, S.DRAFT, Role.ADMIN, False),
    ],
)
def test_lifecycle_transitions(src, dst, role, allowed):
    assert can_transition(src, dst, role) is allowed
