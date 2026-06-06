# -*- coding: utf-8 -*-
"""
Polar AccessLink: OAuth и загрузка новых тренировок в polar_pending_workouts.

Запуск:
    .\\venv\\Scripts\\python.exe sync_polar.py              # авторизация
    .\\venv\\Scripts\\python.exe sync_polar.py --fetch       # новые тренировки
    .\\venv\\Scripts\\python.exe sync_polar.py --code CODE
"""
from __future__ import annotations

import argparse
import json
import os
import re
import secrets
import sqlite3
import sys
import time
import webbrowser
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlencode, urlparse

import requests
from authlib.integrations.base_client.errors import OAuthError
from authlib.integrations.requests_client import OAuth2Session

PROJECT_ROOT = Path(__file__).resolve().parent
ENV_PATH = PROJECT_ROOT / ".env"

POLAR_AUTH_URL = "https://flow.polar.com/oauth2/authorization"
POLAR_TOKEN_URL = "https://polarremote.com/v2/oauth2/token"
POLAR_REGISTER_USER_URL = "https://www.polaraccesslink.com/v3/users"
POLAR_API_BASE = "https://www.polaraccesslink.com"
META_LAST_POLAR_SYNC_PREFIX = "last_polar_sync"
DEFAULT_REDIRECT_URI = "http://localhost:8080/callback"
# Пустой scope = не передаём в URL (как в официальном примере Polar). При ошибке на сайте
# не задавайте POLAR_SCOPE в .env или укажите accesslink.read_all после настройки клиента.
DEFAULT_SCOPE = ""


def _load_dotenv(path: Path | None = None) -> None:
    """Читает KEY=VALUE из .env в os.environ (не перезаписывает уже заданные переменные)."""
    env_file = path or ENV_PATH
    if not env_file.is_file():
        return
    for raw_line in env_file.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def _normalize_auth_code(raw: str) -> str:
    """
    Извлекает authorization code: только значение code=… или весь ввод, если это короткий код.
    """
    text = raw.strip()
    if not text:
        return ""

    if "code=" in text:
        parsed = urlparse(text if "://" in text else f"http://dummy?{text.lstrip('?')}")
        params = parse_qs(parsed.query)
        codes = params.get("code") or []
        if codes and codes[0].strip():
            return codes[0].strip()

    if re.search(r"[\\/]|\.exe|python\.exe|sync_polar", text, re.I):
        raise ValueError(
            "Похоже, вставлена не ссылка с кодом, а команда или путь. "
            "После входа в Polar скопируйте только значение параметра code из адресной строки, "
            "например: http://localhost:8080/callback?code=AbCdEf123"
        )

    if len(text) > 512 or " " in text:
        raise ValueError(
            "Слишком длинный или некорректный код. Нужен только параметр code из redirect URL."
        )

    return text


def _require_env(name: str) -> str:
    value = (os.environ.get(name) or "").strip()
    if not value:
        raise ValueError(
            f"Не задана переменная {name}. "
            f"Добавьте её в {ENV_PATH.name} (см. .env.example)."
        )
    return value


def _parse_redirect_uri(redirect_uri: str) -> tuple[str, int, str]:
    parsed = urlparse(redirect_uri)
    host = parsed.hostname or "localhost"
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    path = parsed.path or "/callback"
    return host, port, path


def _print_polar_setup_checklist(redirect_uri: str, client_id: str) -> None:
    print("[Polar] Проверьте в https://admin.polaraccesslink.com:")
    print(f"  • Redirect URL = {redirect_uri!r} (полностью: http, localhost, порт, путь)")
    print("  • Этот URL отмечен как Default (если redirect не передаётся)")
    print(f"  • Client ID совпадает с .env (начало: {client_id[:8]}…)")
    print("  • Войдите в Polar Flow тем же аккаунтом, что создавал приложение")
    print()


def wait_for_callback_code(redirect_uri: str, *, timeout_sec: int = 300) -> tuple[str | None, str | None]:
    """Локальный сервер на redirect_uri; возвращает (code, error)."""
    host, port, path = _parse_redirect_uri(redirect_uri)
    bind_host = "127.0.0.1" if host in ("localhost", "127.0.0.1", "::1") else host
    result: dict[str, str | None] = {"code": None, "error": None}

    class CallbackHandler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            parsed = urlparse(self.path)
            if parsed.path != path:
                self.send_error(404)
                return
            params = parse_qs(parsed.query)
            if params.get("code"):
                result["code"] = params["code"][0]
                body = (
                    "<html><body><h2>Polar: OK</h2>"
                    "<p>Авторизация прошла. Закройте вкладку.</p></body></html>"
                ).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            elif params.get("error"):
                result["error"] = params["error"][0]
                desc = (params.get("error_description") or [""])[0]
                body = (
                    f"<html><body><h2>Ошибка: {result['error']}</h2>"
                    f"<p>{desc}</p></body></html>"
                ).encode("utf-8")
                self.send_response(400)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                self.wfile.write(body)
            else:
                self.send_error(400)

        def log_message(self, _format: str, *_args: Any) -> None:
            return

    httpd = HTTPServer((bind_host, port), CallbackHandler)
    httpd.timeout = 1
    deadline = time.time() + timeout_sec
    print(f"[Polar] Ожидаю redirect на {redirect_uri} (сервер {bind_host}:{port})…")
    while time.time() < deadline and not result["code"] and not result["error"]:
        httpd.handle_request()
    httpd.server_close()
    return result["code"], result["error"]


def register_polar_user(access_token: str, member_id: str) -> None:
    """
    Регистрирует пользователя в AccessLink (POST /v3/users).
    409 Conflict — пользователь уже зарегистрирован, ошибку игнорируем.
    """
    response = requests.post(
        POLAR_REGISTER_USER_URL,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        json={"member-id": str(member_id)},
        timeout=30,
    )
    if response.status_code == 409:
        return
    try:
        response.raise_for_status()
    except requests.HTTPError as exc:
        detail = response.text.strip() or response.reason
        raise RuntimeError(
            f"Не удалось зарегистрировать пользователя Polar ({response.status_code}): {detail}"
        ) from exc


class PolarAuth:
    """OAuth2 Authorization Code для Polar AccessLink (authlib OAuth2Session)."""

    def __init__(
        self,
        client_id: str,
        client_secret: str,
        *,
        redirect_uri: str = DEFAULT_REDIRECT_URI,
        scope: str = DEFAULT_SCOPE,
    ) -> None:
        self.client_id = client_id.strip()
        self.client_secret = client_secret.strip()
        self.redirect_uri = redirect_uri.strip()
        self.scope = scope.strip()
        self._oauth: OAuth2Session | None = None
        self._oauth_state: str | None = None
        self._token_payload: dict[str, Any] | None = None

    @classmethod
    def from_env(cls) -> PolarAuth:
        _load_dotenv()
        return cls(
            client_id=_require_env("POLAR_CLIENT_ID"),
            client_secret=_require_env("POLAR_CLIENT_SECRET"),
            redirect_uri=os.environ.get("POLAR_REDIRECT_URI", DEFAULT_REDIRECT_URI).strip(),
            scope=os.environ.get("POLAR_SCOPE", DEFAULT_SCOPE).strip(),
        )

    def _session(self) -> OAuth2Session:
        if self._oauth is None:
            kwargs: dict[str, Any] = {
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "redirect_uri": self.redirect_uri or None,
            }
            if self.scope:
                kwargs["scope"] = self.scope
            self._oauth = OAuth2Session(**kwargs)
        return self._oauth

    def get_authorization_url(self, state_override: str | None = None) -> str:
        """Ссылка для входа в Polar Flow (как в официальном accesslink-example-python)."""
        params: dict[str, str] = {
            "response_type": "code",
            "client_id": self.client_id,
        }
        if self.redirect_uri:
            params["redirect_uri"] = self.redirect_uri
        if self.scope:
            params["scope"] = self.scope
        self._oauth_state = state_override or secrets.token_urlsafe(24)
        params["state"] = self._oauth_state
        return f"{POLAR_AUTH_URL}?{urlencode(params)}"

    def exchange_code_for_token(self, auth_code: str) -> dict[str, Any]:
        """Обмен authorization code на access token (и refresh, если Polar вернёт)."""
        code = _normalize_auth_code(auth_code)
        if not code:
            raise ValueError("Пустой authorization code.")

        oauth = self._session()
        try:
            token = oauth.fetch_token(
                POLAR_TOKEN_URL,
                authorization_response=f"{self.redirect_uri}?code={code}",
            )
        except OAuthError as exc:
            raise RuntimeError(
                "Polar отклонил код (invalid_request). Чаще всего: "
                "вставлен не тот текст, код уже использован или redirect URI не совпадает с "
                f"настройками клиента ({self.redirect_uri}). "
                f"Детали: {exc.error}: {exc.description or ''}".strip()
            ) from exc
        payload = dict(token)
        if not payload.get("access_token"):
            raise RuntimeError(f"Polar не вернул access_token: {payload}")

        self._token_payload = payload
        return payload

    @property
    def token_payload(self) -> dict[str, Any]:
        if self._token_payload is None:
            raise RuntimeError("Сначала вызовите exchange_code_for_token().")
        return self._token_payload

    def save_tokens(self, local_user_id: int = 1, conn: sqlite3.Connection | None = None) -> None:
        """Сохраняет access/refresh token и polar user_id для локального пользователя."""
        payload = self.token_payload
        x_user_id = payload.get("x_user_id")
        if x_user_id is None:
            raise RuntimeError("Polar не вернул x_user_id в ответе token endpoint.")

        from backend.services.polar_token_service import save_polar_tokens

        save_polar_tokens(
            int(local_user_id),
            access_token=str(payload["access_token"]),
            refresh_token=payload.get("refresh_token"),
            polar_user_id=str(x_user_id),
            expires_in=payload.get("expires_in"),
        )


def _polar_api_headers(access_token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json",
    }


def _load_polar_tokens(conn: sqlite3.Connection, local_user_id: int) -> tuple[str, str]:
    row = conn.execute(
        """
        SELECT access_token, user_id
        FROM polar_tokens
        WHERE local_user_id = ?
        ORDER BY id DESC
        LIMIT 1
        """,
        (int(local_user_id),),
    ).fetchone()
    if row is None or not row["access_token"] or not row["user_id"]:
        raise RuntimeError(
            "Нет сохранённых токенов Polar. Подключите аккаунт в настройках → Интеграции."
        )
    expires = conn.execute(
        """
        SELECT expires_at FROM polar_tokens
        WHERE local_user_id = ?
        ORDER BY id DESC LIMIT 1
        """,
        (int(local_user_id),),
    ).fetchone()
    if expires and expires["expires_at"]:
        try:
            if int(expires["expires_at"]) <= int(time.time()):
                raise RuntimeError(
                    "Access token Polar истёк. Переподключите аккаунт в настройках."
                )
        except (TypeError, ValueError):
            pass
    return str(row["access_token"]), str(row["user_id"])


def _last_sync_meta_key(local_user_id: int) -> str:
    return f"{META_LAST_POLAR_SYNC_PREFIX}:{int(local_user_id)}"


def _ensure_app_meta(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS app_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
        """
    )


def _get_last_sync_at(conn: sqlite3.Connection, local_user_id: int) -> str | None:
    _ensure_app_meta(conn)
    row = conn.execute(
        "SELECT value FROM app_meta WHERE key = ?",
        (_last_sync_meta_key(local_user_id),),
    ).fetchone()
    return str(row["value"]) if row and row["value"] else None


def _set_last_sync_at(conn: sqlite3.Connection, local_user_id: int, value: str) -> None:
    _ensure_app_meta(conn)
    conn.execute(
        """
        INSERT INTO app_meta (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
        """,
        (_last_sync_meta_key(local_user_id), value),
    )


def _parse_transaction_ids_payload(payload: Any) -> list[str]:
    """Разбор ответа GET …/exercise-transactions (список transaction_id)."""
    if payload is None:
        return []
    if isinstance(payload, list):
        ids: list[str] = []
        for item in payload:
            if isinstance(item, (str, int)):
                ids.append(str(item))
            elif isinstance(item, dict):
                tid = item.get("transaction-id") or item.get("transaction_id") or item.get("id")
                if tid is not None:
                    ids.append(str(tid))
        return ids
    if isinstance(payload, dict):
        for key in (
            "transaction-ids",
            "transaction_ids",
            "transactions",
            "exercise-transactions",
            "exercise_transactions",
        ):
            if key in payload and isinstance(payload[key], list):
                return _parse_transaction_ids_payload(payload[key])
        tid = payload.get("transaction-id") or payload.get("transaction_id")
        if tid is not None:
            return [str(tid)]
    return []


def _fetch_exercise_transaction_ids(
    access_token: str,
    user_id: str,
    after: str | None,
) -> list[str]:
    """
    Список transaction_id для загрузки упражнений.
    Сначала GET …/exercise-transactions (?after=), иначе стандартный Polar POST-цикл.
    """
    url = f"{POLAR_API_BASE}/v3/users/{user_id}/exercise-transactions"
    headers = _polar_api_headers(access_token)
    params: dict[str, str] = {}
    if after:
        params["after"] = after

    response = requests.get(url, headers=headers, params=params, timeout=60)
    if response.status_code == 200:
        ids = _parse_transaction_ids_payload(response.json())
        if ids:
            return ids

    transaction_ids: list[str] = []
    while True:
        create = requests.post(url, headers=headers, timeout=60)
        if create.status_code == 204:
            break
        if create.status_code not in (200, 201):
            create.raise_for_status()
        body = create.json()
        tid = body.get("transaction-id") or body.get("transaction_id")
        if tid is None:
            break
        transaction_ids.append(str(tid))
    return transaction_ids


def _list_exercises_in_transaction(
    access_token: str,
    user_id: str,
    transaction_id: str,
) -> list[str]:
    url = (
        f"{POLAR_API_BASE}/v3/users/{user_id}/exercise-transactions/{transaction_id}"
    )
    response = requests.get(url, headers=_polar_api_headers(access_token), timeout=60)
    if response.status_code == 204:
        return []
    response.raise_for_status()
    payload = response.json()
    exercises = payload.get("exercises") if isinstance(payload, dict) else None
    if not isinstance(exercises, list):
        return []
    return [str(item) for item in exercises if item]


def _parse_exercise_link(url: str, fallback_transaction_id: str) -> tuple[str, str]:
    parts = url.rstrip("/").split("/")
    transaction_id = fallback_transaction_id
    exercise_id = parts[-1]
    if "exercise-transactions" in parts:
        idx = parts.index("exercise-transactions")
        if idx + 1 < len(parts):
            transaction_id = parts[idx + 1]
    if "exercises" in parts:
        idx = parts.index("exercises")
        if idx + 1 < len(parts):
            exercise_id = parts[idx + 1]
    return transaction_id, exercise_id


HR_SAMPLE_TYPE_IDS = ("1", "0")


def _is_hr_sample_block(block: dict[str, Any]) -> bool:
    sample_type = str(
        block.get("sample-type") or block.get("sample_type") or block.get("type") or ""
    ).upper()
    if sample_type in ("1", "HEART_RATE", "HEART RATE"):
        return True
    raw = block.get("data")
    return isinstance(raw, str) and bool(raw.strip())


def _detail_has_inline_hr_samples(data: dict[str, Any]) -> bool:
    """True only when extract_hr_samples can parse HR points from inline data."""
    from backend.services.polar_attach_service import extract_hr_samples

    return bool(extract_hr_samples(data))


def _parse_sample_type_ids_from_list_payload(payload: Any) -> list[str]:
    """type-id из ответа GET .../exercises/{id}/samples (ссылки или объекты)."""
    if not isinstance(payload, dict):
        return []
    items = payload.get("samples")
    if not isinstance(items, list):
        return []
    type_ids: list[str] = []
    for item in items:
        if isinstance(item, str) and "/samples/" in item:
            type_ids.append(item.rstrip("/").split("/")[-1])
        elif isinstance(item, dict):
            tid = item.get("sample-type") or item.get("sample_type") or item.get("type")
            if tid is not None:
                type_ids.append(str(tid))
    return type_ids


def _fetch_exercise_sample_block(
    access_token: str,
    user_id: str,
    transaction_id: str,
    exercise_id: str,
    type_id: str,
) -> dict[str, Any] | None:
    url = (
        f"{POLAR_API_BASE}/v3/users/{user_id}/exercise-transactions/"
        f"{transaction_id}/exercises/{exercise_id}/samples/{type_id}"
    )
    response = requests.get(
        url, headers=_polar_api_headers(access_token), timeout=60
    )
    if response.status_code == 204:
        return None
    if response.status_code != 200:
        return None
    data = response.json()
    return data if isinstance(data, dict) else None


def _list_exercise_sample_type_ids(
    access_token: str,
    user_id: str,
    transaction_id: str,
    exercise_id: str,
) -> list[str]:
    url = (
        f"{POLAR_API_BASE}/v3/users/{user_id}/exercise-transactions/"
        f"{transaction_id}/exercises/{exercise_id}/samples"
    )
    response = requests.get(
        url, headers=_polar_api_headers(access_token), timeout=60
    )
    if response.status_code == 204:
        return []
    if response.status_code != 200:
        return []
    return _parse_sample_type_ids_from_list_payload(response.json())


def _merge_hr_sample_blocks(
    data: dict[str, Any], blocks: list[dict[str, Any]]
) -> dict[str, Any]:
    if not blocks:
        return data
    merged = dict(data)
    existing = merged.get("samples")
    sample_list: list[Any] = []
    if isinstance(existing, list):
        sample_list.extend(existing)
    elif existing is not None:
        sample_list.append(existing)
    for block in blocks:
        if block not in sample_list:
            sample_list.append(block)
    merged["samples"] = sample_list
    return merged


def ensure_polar_exercise_hr_samples(
    access_token: str,
    user_id: str,
    transaction_id: str,
    exercise_id: str,
    data: dict[str, Any],
) -> dict[str, Any]:
    """
    AccessLink часто не вкладывает samples в ответ упражнения (даже с ?samples=true).
    Догружаем пульс через GET .../exercises/{id}/samples/{type-id}.
    """
    if _detail_has_inline_hr_samples(data):
        return data

    tx_id = str(
        data.get("transaction-id") or data.get("transaction_id") or transaction_id
    )
    ex_id = str(data.get("id") or data.get("exercise-id") or data.get("exercise_id") or exercise_id)

    type_ids = _list_exercise_sample_type_ids(access_token, user_id, tx_id, ex_id)
    if not type_ids:
        type_ids = list(HR_SAMPLE_TYPE_IDS)

    hr_blocks: list[dict[str, Any]] = []
    for type_id in type_ids:
        block = _fetch_exercise_sample_block(
            access_token, user_id, tx_id, ex_id, str(type_id)
        )
        if block and _is_hr_sample_block(block):
            hr_blocks.append(block)

    if not hr_blocks:
        for type_id in HR_SAMPLE_TYPE_IDS:
            if str(type_id) in {str(t) for t in type_ids}:
                continue
            block = _fetch_exercise_sample_block(
                access_token, user_id, tx_id, ex_id, str(type_id)
            )
            if block and _is_hr_sample_block(block):
                hr_blocks.append(block)

    return _merge_hr_sample_blocks(data, hr_blocks)


def _get_exercise_detail(
    access_token: str,
    user_id: str,
    transaction_id: str,
    exercise_id: str,
) -> dict[str, Any]:
    headers = _polar_api_headers(access_token)
    params = {"samples": "true", "route": "true", "zones": "true"}
    urls = (
        f"{POLAR_API_BASE}/v3/users/{user_id}/exercise-transactions/"
        f"{transaction_id}/exercises/{exercise_id}",
        f"{POLAR_API_BASE}/v3/users/{user_id}/exercises/{exercise_id}",
        f"{POLAR_API_BASE}/v3/exercises/{exercise_id}",
    )
    last_response: requests.Response | None = None
    for url in urls:
        response = requests.get(url, headers=headers, params=params, timeout=60)
        last_response = response
        if response.status_code == 200:
            data = response.json()
            if isinstance(data, dict):
                return ensure_polar_exercise_hr_samples(
                    access_token, user_id, transaction_id, exercise_id, data
                )
    if last_response is not None:
        last_response.raise_for_status()
    raise RuntimeError(f"Не удалось загрузить упражнение {exercise_id}")


def _commit_exercise_transaction(
    access_token: str,
    user_id: str,
    transaction_id: str,
) -> None:
    url = (
        f"{POLAR_API_BASE}/v3/users/{user_id}/exercise-transactions/{transaction_id}"
    )
    response = requests.put(
        url,
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=60,
    )
    if response.status_code not in (200, 204):
        response.raise_for_status()


def _parse_iso8601_duration(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return int(value)
    text = str(value).strip()
    if not text:
        return None
    if text.isdigit():
        return int(text)
    match = re.match(
        r"^PT(?:(?P<hours>\d+)H)?(?:(?P<minutes>\d+)M)?(?:(?P<seconds>\d+(?:\.\d+)?)S)?$",
        text,
        re.I,
    )
    if not match:
        return None
    hours = int(match.group("hours") or 0)
    minutes = int(match.group("minutes") or 0)
    seconds = float(match.group("seconds") or 0)
    return int(hours * 3600 + minutes * 60 + seconds)


def _pick_field(data: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in data and data[key] is not None:
            return data[key]
    return None


def _map_polar_sport_type(data: dict[str, Any]) -> str:
    detailed = str(
        _pick_field(data, "detailed-sport-info", "detailed_sport_info") or ""
    ).upper()
    sport = _pick_field(data, "sport", "detailed-sport-info", "detailed_sport_info")
    sport_text = ""
    if isinstance(sport, dict):
        sport_text = str(
            sport.get("value") or sport.get("name") or sport.get("id") or ""
        ).upper()
    else:
        sport_text = str(sport or "").upper()

    combined = f"{detailed} {sport_text}"
    if any(k in combined for k in ("STRENGTH", "GYM", "WEIGHT", "CROSSFIT", "FLEX")):
        return "силовая"
    if "RUN" in combined or "JOG" in combined or sport_text in ("RUNNING", "ROAD_RUNNING"):
        return "бег"
    if any(k in combined for k in ("CYCL", "BIKE", "BMX")):
        return "вело"
    if any(k in combined for k in ("SWIM", "POOL")):
        return "бассейн"
    if sport_text:
        return sport_text.lower()
    return "другое"


def _parse_exercise_datetime(data: dict[str, Any]) -> datetime | None:
    raw = _pick_field(data, "start-time", "start_time", "upload-time", "upload_time")
    if raw is None:
        return None
    text = str(raw).strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        if len(text) >= 10:
            try:
                return datetime.fromisoformat(text[:10]).replace(tzinfo=timezone.utc)
            except ValueError:
                return None
    return None


def _is_exercise_after_sync(data: dict[str, Any], last_sync_at: str | None) -> bool:
    if not last_sync_at:
        return True
    exercise_dt = _parse_exercise_datetime(data)
    if exercise_dt is None:
        return True
    if exercise_dt.tzinfo is None:
        exercise_dt = exercise_dt.replace(tzinfo=timezone.utc)
    try:
        sync_text = last_sync_at.strip()
        if sync_text.endswith("Z"):
            sync_text = sync_text[:-1] + "+00:00"
        sync_dt = datetime.fromisoformat(sync_text)
        if sync_dt.tzinfo is None:
            sync_dt = sync_dt.replace(tzinfo=timezone.utc)
    except ValueError:
        return True
    return exercise_dt >= sync_dt


def _extract_pending_workout_fields(data: dict[str, Any]) -> dict[str, Any]:
    start = _pick_field(data, "start-time", "start_time", "upload-time", "upload_time")
    date = str(start)[:10] if start else None

    distance_raw = _pick_field(data, "distance", "distance-meters", "distance_meters")
    distance_km: float | None
    if distance_raw is None:
        distance_km = None
    else:
        distance_km = round(float(distance_raw) / 1000.0, 3)

    from backend.services.polar_hr_utils import polar_avg_max_hr_from_data

    avg_hr, max_hr = polar_avg_max_hr_from_data(data)

    calories = _pick_field(data, "calories")
    duration_sec = _parse_iso8601_duration(_pick_field(data, "duration"))

    if avg_hr is None:
        try:
            from backend.services.polar_attach_service import (
                _avg_hr_from_samples,
                extract_hr_samples,
            )

            hr_samples = extract_hr_samples(data)
            if hr_samples:
                avg_hr = _avg_hr_from_samples(hr_samples)
                if max_hr is None:
                    vals = [hr for _, hr in hr_samples if hr]
                    max_hr = max(vals) if vals else None
        except Exception:
            pass

    exercise_id = _pick_field(data, "id", "exercise-id", "exercise_id")
    if exercise_id is None:
        exercise_id = _pick_field(data, "transaction-id", "transaction_id")

    return {
        "polar_transaction_id": str(exercise_id),
        "date": date,
        "type": _map_polar_sport_type(data),
        "duration_sec": duration_sec,
        "distance_km": distance_km,
        "calories": int(calories) if calories is not None else None,
        "avg_hr": int(avg_hr) if avg_hr is not None else None,
        "max_hr": int(max_hr) if max_hr is not None else None,
        "raw_data": json.dumps(data, ensure_ascii=False),
    }


def sync_new_workouts(local_user_id: int | None = None) -> int:
    """
    Загружает новые тренировки Polar в polar_pending_workouts (imported=0).
    Возвращает количество новых записей.
    """
    from database.connection import open_db
    from database.migrations import ensure_db_schema

    if local_user_id is None:
        from backend.database.db_utils import get_current_user_id

        local_user_id = get_current_user_id()

    uid = int(local_user_id)
    ensure_db_schema()
    conn = open_db(attach=False)
    new_count = 0
    sync_started_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    try:
        access_token, user_id = _load_polar_tokens(conn, uid)
        last_sync_at = _get_last_sync_at(conn, uid)

        transaction_ids = _fetch_exercise_transaction_ids(
            access_token, user_id, last_sync_at
        )
        if not transaction_ids:
            print(f"[Polar] user={uid}: новых транзакций упражнений нет.")
            _set_last_sync_at(conn, uid, sync_started_at)
            conn.commit()
            return 0

        for transaction_id in transaction_ids:
            exercise_links = _list_exercises_in_transaction(
                access_token, user_id, transaction_id
            )
            for link in exercise_links:
                tx_id, exercise_id = _parse_exercise_link(link, transaction_id)
                detail = _get_exercise_detail(
                    access_token, user_id, tx_id, exercise_id
                )
                if not _is_exercise_after_sync(detail, last_sync_at):
                    continue

                fields = _extract_pending_workout_fields(detail)
                polar_id = fields["polar_transaction_id"]
                if not polar_id:
                    continue

                exists = conn.execute(
                    """
                    SELECT 1 FROM polar_pending_workouts
                    WHERE polar_transaction_id = ? AND local_user_id = ?
                    """,
                    (polar_id, uid),
                ).fetchone()
                if exists:
                    continue

                conn.execute(
                    """
                    INSERT INTO polar_pending_workouts (
                        local_user_id, polar_transaction_id, date, type, duration_sec,
                        distance_km, calories, avg_hr, max_hr, raw_data, imported
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
                    """,
                    (
                        uid,
                        polar_id,
                        fields["date"],
                        fields["type"],
                        fields["duration_sec"],
                        fields["distance_km"],
                        fields["calories"],
                        fields["avg_hr"],
                        fields["max_hr"],
                        fields["raw_data"],
                    ),
                )
                new_count += 1

            _commit_exercise_transaction(access_token, user_id, transaction_id)

        _set_last_sync_at(conn, uid, sync_started_at)
        conn.commit()
        return new_count
    finally:
        conn.close()


def sync_new_workouts_all_users() -> list[dict[str, Any]]:
    """Фоновая синхронизация: все локальные пользователи с токенами Polar."""
    from backend.services.polar_token_service import list_local_users_with_polar_tokens

    results: list[dict[str, Any]] = []
    for uid in list_local_users_with_polar_tokens():
        try:
            count = sync_new_workouts(uid)
            results.append({"local_user_id": uid, "new_count": count, "status": "ok"})
        except Exception as exc:
            results.append(
                {
                    "local_user_id": uid,
                    "new_count": 0,
                    "status": "error",
                    "message": str(exc),
                }
            )
    return results


def run_auth_flow(
    *,
    auth_code: str | None = None,
    open_browser: bool = True,
    use_callback_server: bool = True,
) -> int:
    auth = PolarAuth.from_env()
    if not auth.redirect_uri:
        print(
            "[Polar] POLAR_REDIRECT_URI не задан — в URL redirect не передаётся, "
            "будет использован Default URL из Polar Admin.",
            file=sys.stderr,
        )
        return 1

    _print_polar_setup_checklist(auth.redirect_uri, auth.client_id)
    authorization_url = auth.get_authorization_url()

    print("1) Откройте ссылку (без scope, если не задан POLAR_SCOPE):")
    print(authorization_url)
    print()

    code = (auth_code or "").strip()

    if not code and use_callback_server:
        try:
            if open_browser:
                webbrowser.open(authorization_url)
            print("2) Войдите в Polar Flow и нажмите «Разрешить»")
            code, oauth_error = wait_for_callback_code(auth.redirect_uri)
            if oauth_error:
                print(
                    f"[Polar] Polar вернул ошибку в redirect: {oauth_error}. "
                    "Сверьте Redirect URL в admin.polaraccesslink.com.",
                    file=sys.stderr,
                )
                return 1
            if not code:
                print("[Polar] Таймаут: redirect не получен.", file=sys.stderr)
                return 1
            print("[Polar] Код получен через localhost.")
        except OSError as exc:
            print(
                f"[Polar] Не удалось поднять сервер на {auth.redirect_uri}: {exc}\n"
                "Закройте другие программы на порту 8080 или запустите: "
                "sync_polar.py --manual",
                file=sys.stderr,
            )
            return 1
    elif not code:
        if open_browser:
            webbrowser.open(authorization_url)
        print("2) Разрешите доступ и скопируйте код из адресной строки")
        print(f"   (redirect: {auth.redirect_uri}?code=...)")
        code = input("3) Вставьте код или полный redirect URL: ").strip()
        if not code:
            print("[Polar] Код не введён.", file=sys.stderr)
            return 1

    print("[Polar] Обмен code на token…")
    try:
        auth.exchange_code_for_token(code)
    except ValueError as exc:
        print(f"[Polar] {exc}", file=sys.stderr)
        return 1

    print("[Polar] Сохранение токенов в БД (local_user_id=1)…")
    auth.save_tokens(local_user_id=1)

    member_id = "1"
    print("[Polar] Регистрация пользователя в AccessLink…")
    register_polar_user(str(auth.token_payload["access_token"]), member_id)

    print("✅ Polar авторизация пройдена успешно!")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Polar AccessLink: OAuth и загрузка новых тренировок"
    )
    parser.add_argument(
        "--fetch",
        action="store_true",
        help="Загрузить новые тренировки в polar_pending_workouts",
    )
    parser.add_argument(
        "--code",
        dest="auth_code",
        metavar="CODE",
        help="Authorization code (если не указан — запрос в консоли)",
    )
    parser.add_argument(
        "--no-browser",
        action="store_true",
        help="Не открывать браузер автоматически",
    )
    parser.add_argument(
        "--manual",
        action="store_true",
        help="Без локального сервера: вручную вставить code из адресной строки",
    )
    args = parser.parse_args()
    try:
        if args.fetch:
            count = sync_new_workouts(1)
            print(f"[Polar] Новых тренировок: {count}")
            return 0
        return run_auth_flow(
            auth_code=args.auth_code,
            open_browser=not args.no_browser,
            use_callback_server=not args.manual and not args.auth_code,
        )
    except (ValueError, RuntimeError, OAuthError, requests.RequestException) as exc:
        print(f"[Polar] Ошибка: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
