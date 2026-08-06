# Changelog

## 0.1.3 - 2026-08-06

- Исправлена несовместимая с BusyBox awk агрегация latency samples.
- Реальные latency, min/max и jitter больше не превращаются в нули.
- Агрегация подтверждена live Quick benchmark на OpenWrt 25.12.5.

## 0.1.2 - 2026-08-06

- Нулевые и некорректные Clash delay больше не считаются успешными latency-пробами.
- `success_pct` вычисляется из фактически принятых samples и остаётся согласованным с latency и score.
- Добавлены unit-тесты строгой валидации latency samples.

## 0.1.1 - 2026-08-06

- Исправлено отображение строк таблиц Overview, Results и деталей job в LuCI.
- Устранено преобразование массивов DOM-узлов в `[object HTMLTableRowElement]`.
- Добавлена regression-проверка структуры LuCI child lists.

## 0.1.0 - 2026-08-06

- Первый backend APK с Forkop compatibility adapter, async benchmark engine и JSON/CSV results.
- LuCI views для Quick, Gaming, Full, истории и настроек.
- Isolated Full mode без записи production sing-box config.
- Official OpenWrt SDK workflow и SHA-256-verified installer.
