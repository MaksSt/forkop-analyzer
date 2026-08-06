#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"

required_files='
forkop-analyzer/Makefile
forkop-analyzer/files/etc/config/forkop-analyzer
forkop-analyzer/files/etc/init.d/forkop-analyzer
forkop-analyzer/files/usr/bin/forkop-analyzer
forkop-analyzer/files/usr/libexec/forkop-analyzer
forkop-analyzer/files/usr/libexec/forkop-analyzer-worker
forkop-analyzer/files/usr/lib/forkop-analyzer/forkop_adapter.uc
forkop-analyzer/files/usr/lib/forkop-analyzer/latency.sh
forkop-analyzer/files/usr/share/rpcd/ucode/forkop-analyzer
luci-app-forkop-analyzer/Makefile
luci-app-forkop-analyzer/root/usr/share/luci/menu.d/luci-app-forkop-analyzer.json
luci-app-forkop-analyzer/root/usr/share/rpcd/acl.d/luci-app-forkop-analyzer.json
luci-app-forkop-analyzer/htdocs/luci-static/resources/view/forkop-analyzer/overview.js
.github/workflows/build-openwrt-apk.yml
install.sh
README.md
LICENSE'

printf '%s\n' "$required_files" | while IFS= read -r path; do
	[ -n "$path" ] || continue
	if [ ! -f "$ROOT/$path" ]; then
		printf 'Missing required file: %s\n' "$path" >&2
		exit 1
	fi
done

grep -q '^\s*PKG_VERSION:=0.1.4$' "$ROOT/forkop-analyzer/Makefile"
grep -q '^\s*PKG_RELEASE:=1$' "$ROOT/forkop-analyzer/Makefile"
grep -q '^\s*PKG_VERSION:=0.1.4$' "$ROOT/luci-app-forkop-analyzer/Makefile"
grep -q '^\s*PKG_RELEASE:=1$' "$ROOT/luci-app-forkop-analyzer/Makefile"
grep -q 'LUCI_DEPENDS:=+forkop-analyzer' "$ROOT/luci-app-forkop-analyzer/Makefile"
grep -q 'PKGARCH:=all' "$ROOT/forkop-analyzer/Makefile"
grep -q 'LUCI_PKGARCH:=all' "$ROOT/luci-app-forkop-analyzer/Makefile"

if grep -R -n -E 'vless://|hysteria2://|trojan://|Authorization: Bearer [A-Za-z0-9]' \
	"$ROOT/forkop-analyzer" "$ROOT/luci-app-forkop-analyzer" >/dev/null 2>&1; then
	printf 'Potential embedded subscription or bearer secret found.\n' >&2
	exit 1
fi

printf 'Package contract tests passed.\n'
