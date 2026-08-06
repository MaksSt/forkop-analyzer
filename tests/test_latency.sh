#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
. "$ROOT/forkop-analyzer/files/usr/lib/forkop-analyzer/latency.sh"

assert_valid() {
	latency_sample_is_valid "$1" "$2" || {
		printf 'FAIL: expected valid latency sample: %s (timeout %s)\n' "$1" "$2" >&2
		exit 1
	}
}

assert_invalid() {
	if latency_sample_is_valid "$1" "$2"; then
		printf 'FAIL: accepted invalid latency sample: %s (timeout %s)\n' "$1" "$2" >&2
		exit 1
	fi
}

assert_valid 1 5000
assert_valid 42.5 5000
assert_valid 5000 5000

assert_invalid '' 5000
assert_invalid 0 5000
assert_invalid 0.0 5000
assert_invalid -1 5000
assert_invalid . 5000
assert_invalid 1.2.3 5000
assert_invalid timeout 5000
assert_invalid 5000.1 5000
assert_invalid 20 0

samples="${TMPDIR:-/tmp}/forkop-analyzer-latency-$$.txt"
trap 'rm -f "$samples"' EXIT
printf '15\n20.5\n35\n' > "$samples"

[ "$(latency_sample_count "$samples")" = '3' ]
[ "$(latency_success_percentage 3 3)" = '100.00' ]
[ "$(latency_success_percentage 2 3)" = '66.67' ]
[ "$(latency_success_percentage 0 3)" = '0.00' ]

printf 'Latency sample tests passed.\n'
