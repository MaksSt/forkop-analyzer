#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
EXPECTED_VERSION='0.1.3'
EXPECTED_RELEASE='1'
EXPECTED_TAG="v$EXPECTED_VERSION"

for makefile in "$ROOT/forkop-analyzer/Makefile" "$ROOT/luci-app-forkop-analyzer/Makefile"; do
	grep -q "^PKG_VERSION:=$EXPECTED_VERSION$" "$makefile"
	grep -q "^PKG_RELEASE:=$EXPECTED_RELEASE$" "$makefile"
done

grep -q "default: $EXPECTED_TAG" "$ROOT/.github/workflows/build-openwrt-apk.yml"
grep -q "forkop-analyzer-$EXPECTED_VERSION-r$EXPECTED_RELEASE.apk" "$ROOT/README.md"
grep -q "luci-app-forkop-analyzer-$EXPECTED_VERSION-r$EXPECTED_RELEASE.apk" "$ROOT/README.md"
grep -q "DEFAULT_VERSION='$EXPECTED_TAG'" "$ROOT/install.sh"

printf 'Version contract %s (r%s) is consistent.\n' "$EXPECTED_VERSION" "$EXPECTED_RELEASE"
