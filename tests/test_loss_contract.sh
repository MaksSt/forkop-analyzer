#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
WORKER="$ROOT/forkop-analyzer/files/usr/libexec/forkop-analyzer-worker"
STORE="$ROOT/forkop-analyzer/files/usr/lib/forkop-analyzer/result_store.uc"
CONFIG="$ROOT/forkop-analyzer/files/etc/config/forkop-analyzer"
OVERVIEW="$ROOT/luci-app-forkop-analyzer/htdocs/luci-static/resources/view/forkop-analyzer/overview.js"
RESULTS="$ROOT/luci-app-forkop-analyzer/htdocs/luci-static/resources/view/forkop-analyzer/results.js"
SETTINGS="$ROOT/luci-app-forkop-analyzer/htdocs/luci-static/resources/view/forkop-analyzer/settings.js"

grep -q 'LOSS_PCT="$(latency_loss_percentage' "$WORKER"
grep -q 'LATENCY_P95=' "$WORKER"
grep -q 'LATENCY_SPIKES=' "$WORKER"
grep -q 'loss_pct: as_number' "$STORE"
grep -q 'latency_p95_ms: as_number' "$STORE"
grep -q 'latency_spikes: int' "$STORE"
grep -q 'latency_p95_ms,latency_spikes,success_pct,loss_pct' "$STORE"

grep -q "option gaming_repeats '20'" "$CONFIG"
grep -q "option full_repeats '8'" "$CONFIG"
grep -q "'gaming_repeats'" "$SETTINGS"
grep -q "'full_repeats'" "$SETTINGS"

for view in "$OVERVIEW" "$RESULTS"; do
	grep -q 'loss_pct' "$view"
	grep -q 'latency_p95_ms' "$view"
	grep -q 'latency_spikes' "$view"
	grep -q 'не ICMP/UDP packet loss' "$view"
done

printf 'Loss metric contract tests passed.\n'
