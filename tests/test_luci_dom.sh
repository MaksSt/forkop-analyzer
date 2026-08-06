#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
VIEWS="$ROOT/luci-app-forkop-analyzer/htdocs/luci-static/resources/view/forkop-analyzer"

if grep -n -E '^[[:space:]]+(rows|warnings),?[[:space:]]*$' \
	"$VIEWS/overview.js" "$VIEWS/results.js"; then
	printf 'FAIL: LuCI child list contains a nested DOM-node array.\n' >&2
	exit 1
fi

overview_tables="$(grep -c ']\.concat(rows)' "$VIEWS/overview.js")"
results_tables="$(grep -c ']\.concat(rows)' "$VIEWS/results.js")"

if [ "$overview_tables" -ne 1 ] || [ "$results_tables" -ne 2 ]; then
	printf 'FAIL: expected flattened row lists in all three LuCI tables.\n' >&2
	exit 1
fi

printf 'LuCI DOM contract tests passed.\n'
