# -*- coding: utf-8 -*-
from backend.services.health_connect_debug_service import _fetch_db_stats, build_health_connect_debug


def test_fetch_db_stats_sleep_params(monkeypatch):
    """Regression: sleep/cardio queries must not pass duplicate uid bindings."""

    class FakeConn:
        def execute(self, sql, params=()):
            assert sql.count("?") == len(params)
            if "COUNT" in sql:
                return type("R", (), {"fetchone": lambda self: (3,)})()
            return type("R", (), {"fetchone": lambda self: ("2026-05-01", "2026-05-28")})()

        def close(self):
            pass

    monkeypatch.setattr(
        "backend.services.health_connect_debug_service.get_db",
        lambda: FakeConn(),
    )
    monkeypatch.setattr(
        "backend.services.health_connect_debug_service._table_exists",
        lambda conn, name: name in ("sleep_data", "cardio_workouts"),
    )
    monkeypatch.setattr(
        "backend.services.health_connect_debug_service.get_current_user_id",
        lambda: 1,
    )

    counts, ranges = _fetch_db_stats()
    assert counts.get("sleep") == 3
    assert counts.get("workouts") == 3


def test_build_debug_includes_last_batch(monkeypatch):
    monkeypatch.setattr(
        "backend.services.health_connect_debug_service._fetch_recent_sync_logs",
        lambda limit=5: (
            [
                {
                    "id": 1,
                    "synced_at": "2026-05-30T12:00:00",
                    "days_count": 2,
                    "saved_days": 2,
                    "errors_count": 0,
                    "payload_preview": [],
                    "device_label": "Android 14",
                    "audit": {"received_totals": {"days": 2}},
                    "mobile_audit": {"raw_summary": []},
                }
            ],
            True,
        ),
    )
    monkeypatch.setattr(
        "backend.services.health_connect_debug_service._fetch_db_stats",
        lambda: ({}, {}),
    )

    data = build_health_connect_debug()
    assert data["last_batch"] is not None
    assert data["last_batch"]["device_label"] == "Android 14"
    assert data["analytics_usage"]
    assert data["saved_by_field"]["layer"] == "backend_saved_cumulative"
