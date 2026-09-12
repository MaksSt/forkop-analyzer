#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"

"$ROOT/tests/test_scoring.sh"
"$ROOT/tests/test_latency.sh"
"$ROOT/tests/test_scheduler.sh"
"$ROOT/tests/test_loss_contract.sh"
"$ROOT/tests/test_display_names.sh"
"$ROOT/tests/test_isolated_config.sh"
"$ROOT/tests/test_throughput_contract.sh"
"$ROOT/tests/test_package_contract.sh"
"$ROOT/tests/test_luci_dom.sh"
sh "$ROOT/tests/test_monitor.sh"
sh "$ROOT/tests/test_selection.sh"

if command -v ucode >/dev/null 2>&1 && command -v python3 >/dev/null 2>&1; then
	python3 "$ROOT/tests/test_cancellation.py"
	python3 "$ROOT/tests/test_sites.py"
	python3 "$ROOT/tests/test_history.py"
else
	printf 'SKIP: cancellation integration tests require ucode and Python 3.\n'
fi

printf 'All unit tests passed.\n'
