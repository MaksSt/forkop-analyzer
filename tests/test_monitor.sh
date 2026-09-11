#!/bin/sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
if command -v node >/dev/null 2>&1; then
	node "$ROOT/tests/test_monitor.js"
else
	printf 'SKIP: monitor UI tests require Node.js.\n'
fi
if command -v ucode >/dev/null 2>&1; then
	ucode -L "$ROOT/tests/fixtures/monitor/*.uc" -L "$ROOT/forkop-analyzer/files/usr/lib/forkop-analyzer/*.uc" "$ROOT/tests/test_monitor.uc"
else
	printf 'SKIP: monitor backend tests require ucode.\n'
fi
