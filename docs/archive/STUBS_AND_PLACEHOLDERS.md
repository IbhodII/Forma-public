# Заглушки и нереализованные функции

Краткий реестр **оставшихся** заглушек. Закрытые пункты перенесены в [CHANGELOG.md](./CHANGELOG.md).

---

## CLI — Mi / Xiaomi (заглушки)

| Компонент | Файл | Поведение |
|-----------|------|-----------|
| **Mi Fitness** | `sync_mi_fitness.py` | Сообщение «Заглушка», exit 0; импорт не реализован |
| **Xiaomi Home** | `sync_xiaomi_home.py` | Аналогично |
| **`sync_all.py`** | корень | Может вызывать Mi/Xiaomi без реальных данных |

**Реализовано:** `fit_importer.py`, `sync_polar.py`, Polar OAuth/API, `background_sync.py`, `import_polar_historical.py`.

---

## UI — частичные placeholder

| Элемент | Где | Статус |
|---------|-----|--------|
| **Единый облачный аккаунт (email)** | `AccountPlaceholder.tsx` | OAuth Yandex/Google уже в «Синхронизация»; единый email-login — нет |
| **Автосинхронизация профиля между устройствами** | `AccountPlaceholder` | Не реализован |
| **Ручной CdA** | Настройки велосипеда | Только авторасчёт — [BIKE.md](./BIKE.md) |

---

## Снято с заглушек (не дублировать здесь)

Polar AccessLink, микронутриенты, клетчатка, Open Food Facts, группировка подходов (`order_index`), оценка мощности advanced/basic, облачный бэкап, Health Connect, десктоп Forma, очистка дня питания, weekly meal schedule, Polar strength attach overwrite — см. [CHANGELOG.md](./CHANGELOG.md).

---

## Связанные документы

- [KNOWN_ISSUES.md](./KNOWN_ISSUES.md)
- [../SYNC.md](../SYNC.md)
