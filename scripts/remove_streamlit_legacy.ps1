# MyHealthDashboard — удаление legacy Streamlit UI
# Справочный скрипт: что было убрано из проекта (2026-05).
# Запуск не обязателен — изменения уже применены в репозитории.

Write-Host "Streamlit legacy removal checklist" -ForegroundColor Cyan
Write-Host ""
Write-Host "Удалённые файлы (если ещё есть на диске — удалить вручную):" -ForegroundColor Yellow
@(
  "app.py",
  "ui/",
  "database/dashboard_cache.py",
  "database/data_access.py",
  "backup.py",
  "docs/CACHE_MIGRATION.md",
  "scripts/run_streamlit.bat",
  ".streamlit/"
) | ForEach-Object { Write-Host "  - $_" }

Write-Host ""
Write-Host "Зависимости Python (venv, опционально переустановить):" -ForegroundColor Yellow
Write-Host "  pip uninstall streamlit streamlit-folium plotly folium -y"
Write-Host "  pip install -r requirements.txt -r backend/requirements.txt"

Write-Host ""
Write-Host "БД: при старте API migrations.py вызывает _drop_legacy_streamlit_cache:" -ForegroundColor Yellow
Write-Host "  DROP cached_strength_sessions, cached_exercise_progress"
Write-Host "  DELETE dashboard_cache_* keys from app_meta (таблица app_meta сохранена)"

Write-Host ""
Write-Host "Запуск только React + API:" -ForegroundColor Green
Write-Host "  .\start.ps1"
