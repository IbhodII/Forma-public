# Data backup and account transfer (forma_backup_v1)

Desktop-only full JSON export/import for moving all user data between Forma accounts on the same machine.

## Settings UI

**Settings → Данные**

- **Export Full Backup** — downloads `forma_backup_v1.json` for the current `X-User-ID`
- **Import Backup** — `merge` (default) or `replace`
- **Developer Tools** (when enabled): remark strength for FormaSync, force cloud DB upload, download cloud `.db` diagnostic

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/backup/export` | JSON attachment |
| POST | `/api/backup/import?mode=merge\|replace` | multipart `file` |
| POST | `/api/backup/admin/remark-strength-sync` | Mark strength rows pending |
| GET | `/api/cloud/backup/download?provider=&filename=` | Download cloud `.db` (no restore) |

## Account transfer recipe

1. Log in as source account (e.g. admin / user 1).
2. Settings → **Данные** → **Export Full Backup**.
3. Log in as target account (Yandex OAuth or local).
4. Settings → **Данные** → Import → **merge** (or **replace** to wipe target user rows first).
5. Check import report table; open Workouts / Body to verify.
6. Optional: connect Yandex and run FormaSync upload after **Пометить силовые для FormaSync**.

## vs FormaSync

| | forma_backup_v1 | FormaSync |
|--|-----------------|-----------|
| Scope | Full user tables + HR meta | Incremental entities |
| Cross-account | Explicit import + userId remap | Same `yandex_uid` folder only |
| Format | Single JSON | ZIP + manifest |

## Multi-user body metrics (v061)

`body_metrics` and `daily_weight` are scoped by `user_id`. This fixes the issue where weight appeared on every account but strength workouts did not.

## Not exported

- `cloud_tokens`, `users`
- Achievements (no table in schema)
- Mobile-only `*_cache` tables (desktop export)

## Manual QA

- [ ] Export shows `strength_workouts` > 0 when workouts exist
- [ ] Import merge on second account shows workouts
- [ ] User 2 does not see user 1 body metrics after v061
- [ ] Replace mode clears target user rows before import

See also [RELEASE_SMOKE.md](RELEASE_SMOKE.md).
