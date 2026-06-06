# -*- coding: utf-8 -*-
"""Tests for Health Connect desktop hub API."""
from __future__ import annotations

import sqlite3
from datetime import date

import pytest

from backend.services import health_connect_hub_service as hub
from backend.services.health_connect_routing_rules import build_routing_rules


@pytest.fixture(autouse=True)
def _patch_user(monkeypatch):
    monkeypatch.setattr(hub, "get_current_user_id", lambda: 1)
    monkeypatch.setattr(hub, "get_profile", lambda: {"use_chest_strap_priority": True})


def test_build_routing_rules_has_metrics():
    rules = build_routing_rules(steps_effective="health_connect")
    metrics = {r["metric"] for r in rules}
    assert "steps" in metrics
    assert "workout_calories" in metrics
    assert "hr_workout" in metrics


def test_hub_no_data(monkeypatch):
    monkeypatch.setattr(hub, "_fetch_recent_sync_logs", lambda limit=1: ([], True))
    monkeypatch.setattr(hub, "get_sleep_summary", lambda days=7: {"has_data": False, "days": 7})

    class EmptyConn:
        def execute(self, *args, **kwargs):
            return type("R", (), {"fetchone": lambda self: None, "fetchall": lambda self: []})()

        def close(self):
            pass

    monkeypatch.setattr(hub, "get_db", lambda: EmptyConn())
    monkeypatch.setattr(hub, "_table_exists", lambda conn, name: False)

    data = hub.build_health_connect_hub()
    assert data["overview"]["sync_status"] == "no_data"
    assert data["analytics_connected"] is False
    assert len(data["source_routing"]["rules"]) >= 6


def test_hub_partial_sync_warning(monkeypatch):
    monkeypatch.setattr(
        hub,
        "_fetch_recent_sync_logs",
        lambda limit=1: (
            [
                {
                    "synced_at": "2026-05-30T11:42:00",
                    "days_count": 3,
                    "saved_days": 2,
                    "errors_count": 0,
                    "device_label": "Mi Fitness / Android",
                    "audit": {
                        "saved_totals": {"fields": 10},
                        "skipped_totals": {"total": 2, "by_reason": {"duplicate": 2}},
                        "warnings": ["records_skipped"],
                    },
                    "mobile_audit": {},
                }
            ],
            True,
        ),
    )
    monkeypatch.setattr(hub, "get_sleep_summary", lambda days=7: {"has_data": False, "days": 7})

    class EmptyConn:
        def execute(self, *args, **kwargs):
            return type("R", (), {"fetchone": lambda self: None, "fetchall": lambda self: []})()

        def close(self):
            pass

    monkeypatch.setattr(hub, "get_db", lambda: EmptyConn())
    monkeypatch.setattr(hub, "_table_exists", lambda conn, name: False)

    data = hub.build_health_connect_hub()
    assert data["overview"]["sync_status"] == "partial"
    assert data["overview"]["skipped_records"] == 2
    assert any("Частичная" in w for w in data["overview"]["warnings"])


def test_hub_polar_hc_workout_linking(monkeypatch):
    monkeypatch.setattr(hub, "_fetch_recent_sync_logs", lambda limit=1: ([], True))
    monkeypatch.setattr(hub, "get_sleep_summary", lambda days=7: {"has_data": False, "days": 7})

    hc_row = {
        "id": 5,
        "date": "2026-05-28",
        "type": "бег",
        "duration_sec": 3600,
        "calories": 400,
        "data_source": "health_connect",
        "avg_hr": 140,
        "max_hr": 170,
    }

    class FakeConn:
        def execute(self, sql, params=()):
            sql_l = sql.lower()
            if "from cardio_workouts" in sql_l and "data_source = ?" in sql_l and "limit 30" in sql_l:
                return type("R", (), {"fetchall": lambda self: [hc_row]})()
            if "data_source !=" in sql_l:
                return type("R", (), {
                    "fetchall": lambda self: [
                        {"date": "2026-05-28", "type": "бег", "data_source": "polar_historical"},
                    ],
                })()
            if "workout_heart_rate" in sql_l:
                return type("R", (), {"fetchone": lambda self: (42,)})()
            if "min(avg_hr)" in sql_l:
                return type("R", (), {"fetchone": lambda self: (120, 160, 125)})()
            if "select id from cardio_workouts" in sql_l:
                return type("R", (), {"fetchall": lambda self: [(5,)]})()
            return type("R", (), {"fetchone": lambda self: None, "fetchall": lambda self: []})()

        def close(self):
            pass

    monkeypatch.setattr(hub, "get_db", lambda: FakeConn())
    monkeypatch.setattr(hub, "_table_exists", lambda conn, name: name in ("cardio_workouts", "workout_heart_rate"))

    data = hub.build_health_connect_hub()
    assert data["workouts"]["linked_count"] == 1
    assert data["workouts"]["items"][0]["link_status"] == "linked"
    assert data["workouts"]["items"][0]["linked_source"] == "polar_historical"


def test_hub_stale_sleep_warning(monkeypatch):
    monkeypatch.setattr(hub, "_fetch_recent_sync_logs", lambda limit=1: ([], True))
    monkeypatch.setattr(
        hub,
        "get_sleep_summary",
        lambda days=7: {
            "has_data": True,
            "last_night_date": "2026-05-20",
            "last_night_hours": 7.5,
            "avg_hours": 7.0,
            "consistency_score": 80,
            "source": "health_connect",
            "nights_count": 3,
        },
    )

    class FakeConn:
        def execute(self, sql, params=()):
            if "sleep_data" in sql.lower():
                return type("R", (), {
                    "fetchall": lambda self: [
                        {
                            "date": "2026-05-20",
                            "start_time": "2026-05-20T23:00:00",
                            "end_time": "2026-05-21T07:00:00",
                            "duration_seconds": 28800,
                            "source": "health_connect",
                        }
                    ]
                })()
            return type("R", (), {"fetchone": lambda self: None, "fetchall": lambda self: []})()

        def close(self):
            pass

    monkeypatch.setattr(hub, "get_db", lambda: FakeConn())
    monkeypatch.setattr(hub, "_table_exists", lambda conn, name: name == "sleep_data")

    data = hub.build_health_connect_hub()
    assert data["sleep"]["freshness"] == "stale"
    assert data["sleep"]["stale_warning"] is not None


def test_hub_analytics_connected_when_steps_enabled(monkeypatch):
    from backend.services import hc_analytics_service as hc_svc

    monkeypatch.setattr(hub, "_fetch_recent_sync_logs", lambda limit=1: ([], True))
    monkeypatch.setattr(
        hub,
        "get_sleep_summary",
        lambda days=7: {"has_data": False, "days": 7, "freshness": "missing"},
    )
    monkeypatch.setattr(
        hc_svc,
        "get_hc_analytics_prefs",
        lambda user_id=None: {**hc_svc.DEFAULT_HC_ANALYTICS_PREFS, "steps": True},
    )
    monkeypatch.setattr(
        hc_svc,
        "check_freshness",
        lambda metric, user_id=None: {"enabled": True, "fresh": True, "stale_warning": None},
    )

    class StepsConn:
        def execute(self, sql, params=()):
            sql_l = sql.lower()
            today = date.today().isoformat()
            if "from steps_history" in sql_l and "user_id" in sql_l and "date >=" in sql_l:
                return type("R", (), {
                    "fetchall": lambda self: [
                        {"date": today, "steps": 8000, "source": "health_connect"},
                    ],
                })()
            if "min(date)" in sql_l and "steps_history" in sql_l and "user_id" in sql_l:
                return type("R", (), {"fetchone": lambda self: (today, today)})()
            return type("R", (), {"fetchone": lambda self: None, "fetchall": lambda self: []})()

        def close(self):
            pass

    monkeypatch.setattr(hub, "get_db", lambda: StepsConn())
    monkeypatch.setattr(hub, "_table_exists", lambda conn, name: name == "steps_history")

    data = hub.build_health_connect_hub()
    assert data["analytics_connected"] is True
