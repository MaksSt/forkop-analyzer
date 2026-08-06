# Исследование upstream Forkop

Дата проверки: 2026-08-06.

## Зафиксированные источники

### ushan0v/forkop

```text
git rev-parse HEAD:      dd483297be0ac4e52bb8f482e2640238b75af532
git branch --show-current: main
git log -1 --oneline:   dd483297 Remove SourceForge migration workflow
git describe:           1.0.5-2-gdd483297
```

### MaksSt/luci-app-cloudflareapi

```text
git rev-parse HEAD:      6bcbec79690b864c3f0f670f24bb68f255169cb6
git branch --show-current: main
git log -1 --oneline:   6bcbec7 fix: исправил начальное состояние чекбоксов
git describe:           v1.0.0-7-g6bcbec7
```

Reference-клоны использованы только для исследования и не входят в Git history forkop-analyzer.

## Изученные Forkop-файлы

- `forkop/Makefile`;
- `forkop/files/etc/config/forkop`;
- `forkop/files/etc/init.d/forkop`;
- `forkop/files/usr/bin/forkop`;
- `forkop/files/usr/lib/core/constants.uc`;
- `forkop/files/usr/lib/config/connections.uc`;
- `forkop/files/usr/lib/subscription/cache.uc`;
- `forkop/files/usr/lib/singbox/{constants,generator,runtime,subscription,urltest}.uc`;
- `forkop/files/usr/lib/diagnostics/runtime.uc`;
- `forkop/files/usr/lib/service/{state,reload,ui}.uc`;
- LuCI menu, ACL и frontend shell methods.

## Подтверждённый contract

1. Основная UCI package — `forkop`.
2. Runtime config path хранится в `forkop.settings.config_path`; default upstream сейчас `/etc/sing-box/config.json`, но adapter не дублирует default.
3. Subscription sources представлены UCI sections типа `subscription_url`; URL и request profile могут содержать чувствительные данные.
4. Runtime outbounds уже сформированы Forkop parser/generator и находятся в sing-box JSON.
5. Section selector tag вычисляется generator, но adapter всегда читает фактический `outbound.tag`.
6. URLTest и priority groups имеют отдельные runtime tags; их нельзя конструировать в Analyzer по имени.
7. Forkop CLI предоставляет:
   - `show_version`;
   - `show_sing_box_version`;
   - `get_status`;
   - `get_outbound_metadata SECTION`;
   - `get_subscription_metadata SECTION`;
   - `clash_api get_proxies`;
   - `clash_api get_proxy_latency TAG TIMEOUT`;
   - `clash_api set_group_proxy GROUP TAG`;
   - `reload REASON`.
8. Clash controller генерируется Forkop в sing-box experimental config; текущий generator использует port 9090 и локальный service address. Analyzer не жёстко вызывает port и ходит через Forkop CLI.
9. `set_group_proxy` — production mutation. Analyzer вызывает её только отдельным explicit RPC/CLI action.

## Отличия от предположений ТЗ

### Нет отдельного Forkop ubus API для selector/metadata

Upstream LuCI разрешает execute `/usr/bin/forkop` через rpcd file ACL и вызывает CLI. Поэтому compatibility adapter использует подтверждённый CLI, а собственный ubus object `forkop-analyzer` принадлежит только этому проекту.

### Нет upstream temporary benchmark API

Forkop не предоставляет отдельный temporary sing-box lifecycle для стороннего benchmark. Full создаёт производный config в `/tmp`, заменяет только inbound и route rules, удаляет Clash/cache collision points и запускает второй process. Production config не записывается.

### Selector tags сложнее одного шаблона

Section selector обычно заканчивается `-out`, URLTest и priority tags создаются отдельными функциями, subscription может содержать собственные groups. Adapter перечисляет готовые runtime objects и рекурсивно разворачивает только их фактические members.

### sing-box compatibility

Forkop constants указывают базовый minimum 1.12.0, а текущая diagnostics UI считает совместимой версию 1.12.4+. Analyzer выбрал более строгий minimum 1.12.4 для isolated mode.

## Способ интеграции

- UCI и runtime config читаются только в `forkop_adapter.uc`.
- Subscription URLs, server addresses, credentials, TLS keys и Clash secret отбрасываются.
- Quick/Gaming повторно используют Forkop `clash_api get_proxy_latency`.
- Full использует готовые outbounds из runtime config; протокольные URI не парсятся.
- Adapter capability detection прекращает работу с понятной ошибкой при несовместимости.
- Upstream-файлы не изменяются и patches не требуются.
