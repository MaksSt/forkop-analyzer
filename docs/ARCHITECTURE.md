# Архитектура forkop-analyzer

## Пакеты

`forkop-analyzer` содержит UCI config, procd scheduler, CLI, async worker, scoring, result store, rpcd ucode plugin и Forkop adapter.

`luci-app-forkop-analyzer` зависит от backend и содержит JavaScript views, menu, ACL, CSS и локализацию. Оба пакета `all`, потому что содержат только shell, ucode, JavaScript, JSON и UCI.

## Границы ответственности

- Forkop остаётся source of truth для subscriptions, parsing, outbounds, tags, runtime config и Clash API.
- Adapter возвращает только безопасные metadata.
- Worker отвечает за samples, scoring, traffic budget, cancellation и temporary process.
- rpcd методы короткие: start создаёт background worker, status читает state.
- LuCI не имеет file-exec ACL к Forkop или worker.

## Job lifecycle

1. CLI проверяет single-job lock.
2. Adapter перечисляет leaf outbounds выбранного selector.
3. Result store атомарно создаёт runtime и persistent state.
4. Worker запускается с redirected stdin/stdout/stderr.
5. На каждом узле пишется progress и result.
6. TERM/cancel очищает temporary sing-box и помечает job `cancelled`.
7. Finish сравнивает current selector с исходным и освобождает lock.

## Full isolation

Adapter читает актуальный runtime JSON и создаёт копию в job tmp directory:

- единственный mixed inbound на `127.0.0.1`;
- единственное route rule на выбранный leaf outbound;
- исходные outbounds и DNS остаются для dependency resolution;
- `experimental.clash_api`, `experimental.cache_file` и `ntp` удаляются;
- production file, UCI и selector не меняются.

Если runtime содержит `endpoints`, Full запрещён. Это сознательная fail-closed политика: endpoint lifecycle может конфликтовать со вторым process.

## Данные

- runtime: `/var/run/forkop-analyzer`;
- temporary configs/logs: `/tmp/forkop-analyzer/<job>`;
- persistent results: `/var/lib/forkop-analyzer/results/<job>.json`;
- UCI conffile: `/etc/config/forkop-analyzer`.

Result writes используют temporary file + rename. Job IDs и paths валидируются, PID перед сигналом сверяется с `/proc/<pid>/cmdline`.
