#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
VIEWS="$ROOT/luci-app-forkop-analyzer/htdocs/luci-static/resources/view/forkop-analyzer"
UI="$ROOT/luci-app-forkop-analyzer/htdocs/luci-static/resources/forkop-analyzer/ui-v2.js"

if grep -n -E '^[[:space:]]+(rows|warnings),?[[:space:]]*$' \
	"$VIEWS/overview-v6.js" "$VIEWS/results-v4.js" "$UI"; then
	printf 'FAIL: LuCI child list contains a nested DOM-node array.\n' >&2
	exit 1
fi

for view in "$VIEWS/overview-v6.js" "$VIEWS/results-v4.js"; do
	grep -Fq 'presentation.resultsTable(' "$view"
done
grep -Fq "E('thead'" "$UI"
grep -Fq "E('tbody', {}, rows)" "$UI"
grep -Fq "job.profile === 'full'" "$UI"
grep -q 'Скорость скачивания измеряется только в профиле Full' "$UI"
printf 'LuCI DOM contract tests passed.\n'
