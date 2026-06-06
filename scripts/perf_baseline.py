# -*- coding: utf-8 -*-
"""Hit top API endpoints and print timing summary (p50/p95). Requires running API."""
from __future__ import annotations

import argparse
import statistics
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

try:
    import httpx
except ImportError:
    print("Install httpx: pip install httpx", file=sys.stderr)
    raise SystemExit(1)

DEFAULT_ENDPOINTS = [
    ("GET", "/api/health"),
    ("GET", "/api/analytics/daily-expenditure/week?anchor_date=2026-05-31&phase=cut"),
    ("GET", "/api/nutrition/cut/deficit-control?lookback_days=15"),
    ("GET", "/api/strength/sessions?limit=50&offset=0"),
    ("GET", "/api/strength/hr-analytics/overview?sessions_limit=50"),
    ("GET", "/api/sync/health-connect/hub"),
    ("GET", "/api/food/entries/week?anchor_date=2026-05-31&phase=cut"),
]


def _percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    sorted_v = sorted(values)
    k = (len(sorted_v) - 1) * pct / 100.0
    f = int(k)
    c = min(f + 1, len(sorted_v) - 1)
    if f == c:
        return sorted_v[f]
    return sorted_v[f] + (sorted_v[c] - sorted_v[f]) * (k - f)


def main() -> int:
    parser = argparse.ArgumentParser(description="Performance baseline for top endpoints")
    parser.add_argument("--base", default="http://127.0.0.1:8000", help="API base URL")
    parser.add_argument("--user-id", default="1", help="X-User-ID header")
    parser.add_argument("--runs", type=int, default=3, help="Repeats per endpoint")
    args = parser.parse_args()

    base = args.base.rstrip("/")
    headers = {"X-User-ID": str(args.user_id), "Accept": "application/json"}
    rows: list[tuple[str, str, float, int]] = []

    with httpx.Client(timeout=120.0, headers=headers) as client:
        for method, path in DEFAULT_ENDPOINTS:
            times: list[float] = []
            status = 0
            for _ in range(max(1, args.runs)):
                start = time.perf_counter()
                resp = client.request(method, f"{base}{path}")
                elapsed_ms = (time.perf_counter() - start) * 1000
                times.append(elapsed_ms)
                status = resp.status_code
            rows.append(
                (
                    method,
                    path.split("?")[0],
                    _percentile(times, 50),
                    status,
                )
            )
            print(
                f"{method} {path} -> {status} "
                f"p50={_percentile(times, 50):.0f}ms p95={_percentile(times, 95):.0f}ms"
            )

    print("\n| Method | Path | p50 ms | Status |")
    print("|--------|------|--------|--------|")
    for method, path, p50, status in rows:
        print(f"| {method} | {path} | {p50:.0f} | {status} |")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
