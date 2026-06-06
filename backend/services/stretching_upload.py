# -*- coding: utf-8 -*-
"""Загрузка изображений для упражнений растяжки."""
from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile

UPLOAD_ROOT = Path(__file__).resolve().parent.parent / "uploads" / "stretching"
MAX_BYTES = 5 * 1024 * 1024
ALLOWED_SUFFIXES = frozenset({".jpg", ".jpeg", ".png", ".gif", ".webp"})
ALLOWED_CONTENT = frozenset(
    {
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
    }
)


def ensure_upload_dir() -> Path:
    UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
    return UPLOAD_ROOT


async def save_stretching_image(file: UploadFile) -> dict[str, str]:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Файл не выбран")

    suffix = Path(file.filename).suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        raise HTTPException(
            status_code=400,
            detail="Допустимые форматы: jpg, png, gif, webp",
        )

    content_type = (file.content_type or "").split(";")[0].strip().lower()
    if content_type and content_type not in ALLOWED_CONTENT:
        raise HTTPException(status_code=400, detail="Недопустимый тип файла")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Пустой файл")
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=400, detail="Максимальный размер файла — 5 МБ")

    ensure_upload_dir()
    name = f"{uuid.uuid4().hex}{suffix}"
    dest = UPLOAD_ROOT / name
    dest.write_bytes(data)

    return {"path": f"/uploads/stretching/{name}"}
