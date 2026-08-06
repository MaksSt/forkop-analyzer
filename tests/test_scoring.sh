#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
. "$ROOT/forkop-analyzer/files/usr/lib/forkop-analyzer/scoring.sh"

assert_equal() {
	actual="$1"
	expected="$2"
	message="$3"
	if [ "$actual" != "$expected" ]; then
		printf 'FAIL: %s: expected %s, got %s\n' "$message" "$expected" "$actual" >&2
		exit 1
	fi
}

assert_equal "$(score_profile quick 20 0 100 0 100)" 100 'quick best case'
assert_equal "$(score_profile gaming 300 100 0 0 100)" 0 'gaming worst threshold'
assert_equal "$(score_profile full 20 0 100 100 100)" 100 'full target case'
assert_equal "$(score_profile quick 160 50 50 0 100)" 50 'quick midpoint'
assert_equal "$(score_profile full 20 0 100 50 100)" 78 'full half throughput'

if score_profile unknown 20 0 100 0 100 >/dev/null 2>&1; then
	printf 'FAIL: unknown profile was accepted\n' >&2
	exit 1
fi

printf 'Scoring tests passed.\n'
