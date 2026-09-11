# Проверки

## Локально

```sh
scripts/check-version.sh
scripts/validate.sh
tests/run.sh
```

Проверяются shell syntax, JSON, JavaScript syntax при наличии Node.js, ucode compile при наличии host tool, package contract, secret patterns и production scoring implementation.

Тесты мониторинга выполняют production `buildModel` (разрывы, серии ошибок, переходы, границы периода и пропуски сбора) и ucode adapter/collector/store (полный сбор измерения, вложенные live-группы, ошибки API, смена сервера во время пробы, ограничение истории). Backend-тест требует host `ucode`; при его отсутствии явно выводится SKIP.

## Проверки интерфейса и роутера

Для текущего интерфейса выполнены браузерные проверки светлой/тёмной темы и ширин 320–1680 px: график, подсказка около курсора, клавиатурная навигация, история, запуск/отмена, подтверждение выбора узла и экспорт на RPC-стенде. Вкладки настроек, Save/Reset и сохранение оформления проверены с настоящими модулями LuCI form/view. Эти проверки используют тестовые ответы API и не подтверждают переключение production-сервера или реальную загрузку Full.

На работающем OpenWrt 25.12.5 / Forkop 1.0.5 / sing-box 1.12.17 отдельно проверены фоновый сбор и RPC мониторинга, ограничение истории и сохранение имён при повторном использовании runtime tag. `tests/test_monitor.uc` также выполнен нативным ucode с изолированной UCI-фикстурой и подменёнными внешними командами. Чистая установка/удаление APK и весь цикл Full остаются отдельными интеграционными проверками ниже.

## SDK

Основная integration check выполняется `.github/workflows/build-openwrt-apk.yml` на official OpenWrt 25.12.4 SDK. Workflow проверяет SHA-256 SDK, pin Forkop, наличие двух APK, APK v3 metadata/dependencies через штатный `apk adbdump`, contents через `apk extract` и deterministic release names.

## Live OpenWrt checklist

Эти проверки нельзя считать выполненными без router/VM:

1. install обоих APK на чистом OpenWrt 25.12.4;
2. `ubus -v list forkop-analyzer` и ACL под LuCI session;
3. procd start/stop/restart;
4. Quick на активной subscription;
5. Gaming cancellation во время samples;
6. Full temporary port/process/config cleanup;
7. production selector до/после;
8. JSON/CSV export;
9. uninstall без изменений Forkop/sing-box.
