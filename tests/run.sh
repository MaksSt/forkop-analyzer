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

printf 'All unit tests passed.\n'
