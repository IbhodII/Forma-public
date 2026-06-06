# Strength HR analytics v2 — manual QA checklist (desktop)

- [ ] Polar HR + ordered sets — graph-first overlays + collapsible table
- [ ] No HR — empty state «Нет данных пульса»
- [ ] Legacy session без ordered_sets — blocks_only, no auto mapping
- [ ] Superset / alternating exercises — `superset_detected`, medium confidence, no auto mapping
- [ ] Warmups — distinct styling on chart, excluded from mismatch penalty
- [ ] 23 sets session — blocks ≤ 23 × 1.3 after v2
- [ ] Small valley inside peak — single block, not split
- [ ] Two sets with recovery — two blocks separated
- [ ] High confidence only — auto set labels on chart; medium/low require manual toggle
- [ ] Disclaimer visible for non-high confidence

# Strength HR block editor v3 — manual QA (desktop)

- [ ] «Редактировать разметку» opens edit mode with chart primary
- [ ] Move boundaries via inputs / ±5 / ±15 — overlay updates live
- [ ] Merge two blocks — save — reload persists single block
- [ ] Split block at midpoint — two blocks, assignments cleared
- [ ] Assign block to ordered set — label on chart in edit mode
- [ ] Duplicate set on two blocks — warning shown, still savable
- [ ] Mark block as Отдых / Шум — gray dashed styling, no set match
- [ ] Save → `overrides_applied` badge, analysis uses manual blocks
- [ ] «Сбросить к авторазметке» → DELETE overrides, auto blocks restored
- [ ] Cancel discards unsaved edits
