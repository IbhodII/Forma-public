# -*- coding: utf-8 -*-
"""Ensure all SQL strings with mq(conn, ...) are f-strings."""
from __future__ import annotations

import re
from pathlib import Path

path = Path(__file__).resolve().parent.parent / "backend" / "services" / "food_service.py"
lines = path.read_text(encoding="utf-8").splitlines(keepends=True)

for i, line in enumerate(lines):
    if "{mq(conn," not in line:
        continue
    for back in range(1, 12):
        if i - back < 0:
            break
        prev = lines[i - back]
        if '"""' in prev and 'f"""' not in prev:
            lines[i - back] = prev.replace('"""', 'f"""', 1)
            break

text = "".join(lines)
# conn.execute(""" without f before mq
for m in list(re.finditer(r'conn\.execute\(\s*\n\s*"""', text)):
    end = text.find("{mq(conn,", m.start())
    if end == -1 or end - m.start() > 800:
        continue
    chunk = text[m.start() : end + 80]
    if 'f"""' not in chunk.split("{mq(conn,")[0]:
        text = text[: m.start()] + text[m.start() :].replace('"""', 'f"""', 1)

path.write_text(text, encoding="utf-8")
left = [n + 1 for n, l in enumerate(text.splitlines()) if "{mq(conn," in l]
print("lines with mq:", len(left))
