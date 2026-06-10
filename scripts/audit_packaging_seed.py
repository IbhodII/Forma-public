# -*- coding: utf-8 -*-
"""Audit packaging/seed/*.db for personal data before installer build."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SEED_DIR = ROOT / "packaging" / "seed"

if str(ROOT / "scripts") not in sys.path:
    sys.path.insert(0, str(ROOT / "scripts"))

from packaging_seed_common import audit_packaging_seed_dir


def main() -> int:
    errors = audit_packaging_seed_dir(SEED_DIR)
    if errors:
        print("Packaging seed audit FAILED:", file=sys.stderr)
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        return 1
    print(f"Packaging seed audit OK ({SEED_DIR})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
