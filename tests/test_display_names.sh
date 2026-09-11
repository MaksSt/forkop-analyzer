#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
ADAPTER="$ROOT/forkop-analyzer/files/usr/lib/forkop-analyzer/forkop_adapter.uc"
CLI="$ROOT/forkop-analyzer/files/usr/lib/forkop-analyzer/adapter_cli.uc"
WORKER="$ROOT/forkop-analyzer/files/usr/libexec/forkop-analyzer-worker"
STORE="$ROOT/forkop-analyzer/files/usr/lib/forkop-analyzer/result_store.uc"
OVERVIEW="$ROOT/luci-app-forkop-analyzer/htdocs/luci-static/resources/view/forkop-analyzer/overview-v5.js"
RESULTS="$ROOT/luci-app-forkop-analyzer/htdocs/luci-static/resources/view/forkop-analyzer/results-v3.js"
MENU="$ROOT/luci-app-forkop-analyzer/root/usr/share/luci/menu.d/luci-app-forkop-analyzer.json"

grep -Fq "SECTION_CACHE_DIR = '/var/run/forkop/section-cache'" "$ADAPTER"
grep -Fq 'outboundMetadata' "$ADAPTER"
grep -Fq 'display_name: item.display_name' "$ADAPTER"
grep -Fq "print(tag, '\\t', outbound_type, '\\t', display_name" "$CLI"
grep -Fq 'NODE_DISPLAY_NAME' "$WORKER"
grep -Fq 'display_name: as_string' "$STORE"
grep -Fq 'tag,display_name,type' "$STORE"

UI="$ROOT/luci-app-forkop-analyzer/htdocs/luci-static/resources/forkop-analyzer/ui-v1.js"
grep -Fq 'function nodeDisplayName(item, nodes)' "$UI"
grep -Fq 'nodes[i].display_name || tag' "$UI"
for view in "$OVERVIEW" "$RESULTS"; do
	grep -Fq 'presentation.nodeDisplayName' "$view"
done

grep -Fq "callNodes('')" "$RESULTS"
grep -Fq 'forkop-analyzer/overview-v5' "$MENU"
grep -Fq 'forkop-analyzer/results-v3' "$MENU"

printf 'Display name contract tests passed.\n'
