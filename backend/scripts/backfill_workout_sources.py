# -*- coding: utf-8 -*-
"""One-time backfill: workout_source_contributions from existing cardio rows."""
from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.database import get_db
from backend.database.db_utils import get_current_user_id, set_current_user_id
from backend.services.source_resolver_service import register_contribution_from_legacy_row

logger = logging.getLogger(__name__)


def backfill_workout_sources(*, user_id: int = 1, dry_run: bool = False) -> dict[str, int]:
    set_current_user_id(user_id)
    conn = get_db()
    try:
        rows = conn.execute(
            """
            SELECT id FROM cardio_workouts
            WHERE user_id = ?
            ORDER BY id ASC
            """,
            (user_id,),
        ).fetchall()
        processed = 0
        skipped = 0
        for row in rows:
            wid = int(row[0])
            existing = conn.execute(
                """
                SELECT 1 FROM workout_source_contributions
                WHERE user_id = ? AND cardio_workout_id = ?
                LIMIT 1
                """,
                (user_id, wid),
            ).fetchone()
            if existing:
                skipped += 1
                continue
            if dry_run:
                processed += 1
                continue
            register_contribution_from_legacy_row(conn, wid)
            processed += 1
        if not dry_run:
            conn.commit()
    finally:
        conn.close()
    return {"processed": processed, "skipped": skipped, "total": len(rows)}


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill workout source contributions")
    parser.add_argument("--user-id", type=int, default=1)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    stats = backfill_workout_sources(user_id=args.user_id, dry_run=args.dry_run)
    logger.info(
        "Backfill complete: processed=%s skipped=%s total=%s dry_run=%s",
        stats["processed"],
        stats["skipped"],
        stats["total"],
        args.dry_run,
    )


if __name__ == "__main__":
    main()
