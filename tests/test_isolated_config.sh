#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
ADAPTER="$ROOT/forkop-analyzer/files/usr/lib/forkop-analyzer/forkop_adapter.uc"

grep -Fq 'function collect_outbound_dependencies' "$ADAPTER"
grep -Fq "as_string(server.type) != 'tailscale'" "$ADAPTER"
grep -Fq 'delete bootstrap_copy.detour' "$ADAPTER"
grep -Fq 'primary_copy.detour = outbound_tag' "$ADAPTER"
grep -Fq 'config.outbounds = outbounds.values' "$ADAPTER"
grep -Fq 'delete config.endpoints' "$ADAPTER"
grep -Fq 'delete config.services' "$ADAPTER"
grep -Fq 'delete config.experimental' "$ADAPTER"

if grep -Fq 'ENDPOINTS_UNSUPPORTED' "$ADAPTER"; then
	printf 'FAIL: blanket endpoint rejection is still present.\n' >&2
	exit 1
fi

printf 'Isolated config contract tests passed.\n'
