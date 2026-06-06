# -*- coding: utf-8 -*-
"""Помощники WHERE user_id для личных таблиц workouts.db."""
from __future__ import annotations

from typing import Any

from backend.database.db_utils import (
    get_current_user_id,
    merge_user_into_where,
    sql_where_from_clauses,
    user_filter,
)

__all__ = [
    "get_current_user_id",
    "user_filter",
    "user_where",
    "prepend_user_clause",
]


def prepend_user_clause(
    clauses: list[str],
    params: list[Any],
    *,
    alias: str = "",
    user_id: int | None = None,
) -> tuple[list[str], list[Any]]:
    return merge_user_into_where(clauses, params, alias=alias, user_id=user_id)


def user_where(
    extra_clauses: list[str] | None = None,
    extra_params: list[Any] | None = None,
    *,
    alias: str = "",
    user_id: int | None = None,
) -> tuple[str, list[Any]]:
    """
    Готовый фрагмент « WHERE … » только по user_id (+ доп. условия).
    Если extra_clauses пуст — только user_id.
    """
    clauses: list[str] = []
    params: list[Any] = []
    if extra_clauses:
        clauses.extend(extra_clauses)
        params.extend(extra_params or [])
    clauses, params = prepend_user_clause(clauses, params, alias=alias, user_id=user_id)
    return sql_where_from_clauses(clauses), params
