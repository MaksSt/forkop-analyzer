# Проверки

## Локально

```sh
scripts/check-version.sh
scripts/validate.sh
tests/run.sh
```

Проверяются shell syntax, JSON, JavaScript syntax при наличии Node.js, ucode compile при наличии host tool, package contract, secret patterns и production scoring implementation.

## SDK

Основная integration check выполняется `.github/workflows/build-openwrt-apk.yml` на official OpenWrt 25.12.4 SDK. Workflow проверяет SHA-256 SDK, pin Forkop, наличие двух APK, contents, `.PKGINFO` dependencies и deterministic release names.

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
