#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"

"$ROOT/tests/test_scoring.sh"
"$ROOT/tests/test_package_contract.sh"

printf 'All unit tests passed.\n'
