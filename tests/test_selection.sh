#!/bin/sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
mkdir -p "$ROOT/tmp"
TMP_DIR="$(mktemp -d "$ROOT/tmp/selection-test.XXXXXX")"
trap 'case "$TMP_DIR" in "$ROOT"/tmp/selection-test.*) rm -rf -- "$TMP_DIR" ;; esac' EXIT
# Exercise the production launch function with isolated command boundaries.
sed '/^case "$1" in/,$d' "$ROOT/forkop-analyzer/files/usr/libexec/forkop-analyzer" > "$TMP_DIR/functions.sh"
. "$TMP_DIR/functions.sh"
RUNTIME_DIR="$TMP_DIR/run"
RESULTS_DIR="$TMP_DIR/results"
TMP_ROOT="$TMP_DIR/plans"
WORKER='/usr/bin/true'
recover_stale_job() { :; }
active_job() { return 1; }
worker_is_active() { return 0; }
uci() {
 case "$*" in
  *main.enabled) echo 1 ;;
  *main.selector) echo configured-group ;;
  *main.full_max_nodes) echo 15 ;;
 esac
}
jsonfilter() { echo true; }
adapter() {
 case "$1" in
  capabilities) echo '{}' ;;
  current-node) echo '{}' ;;
  benchmark-nodes-lines)
   printf '%s' "$2" > "$TMP_DIR/selector"
   printf '%s' "$3" > "$TMP_DIR/tags"
   [ "$3" != 'invalid' ] || return 1
   count=45
   [ "$3" != '["node-30","node-44"]' ] || count=2
   i=0; while [ "$i" -lt "$count" ]; do i=$((i+1)); printf 'node-%s\tvless\tServer %s\n' "$i" "$i"; done ;;
 esac
}
store() { [ "$1" != init ] || { touch "$2" "$3"; }; }
run_case() {
 start_benchmark "$@" > "$TMP_DIR/response"
 plan="$(find "$TMP_ROOT" -name '*.nodes.tsv' | head -n 1)"
 [ "$(wc -l < "$plan" | tr -d ' ')" = "$EXPECTED" ]
 grep -q "\"total\":$EXPECTED}" "$TMP_DIR/response"
 rm -f "$plan" "$RUNTIME_DIR/active_job"
 rmdir "$RUNTIME_DIR/active.lock"
}
EXPECTED=15 run_case full '' '' '' ''
[ "$(cat "$TMP_DIR/selector")" = configured-group ]
EXPECTED=45 run_case full '' '["all-fixture"]' 0 46080
[ ! -s "$TMP_DIR/selector" ]
EXPECTED=2 run_case full '' '["node-30","node-44"]' 0 2048
[ "$(cat "$TMP_DIR/tags")" = '["node-30","node-44"]' ]
EXPECTED=3 run_case full group '' 3 3072
EXPECTED=45 run_case gaming '' '' '' ''
for bad in -1 abc 1001; do
 if start_benchmark full '' '' "$bad" '' > "$TMP_DIR/response"; then exit 1; fi
 grep -q INVALID_ARGUMENT "$TMP_DIR/response"
done
for bad in 0 -1 abc 51201; do
 if start_benchmark full '' '' 0 "$bad" > "$TMP_DIR/response"; then exit 1; fi
 grep -q INVALID_ARGUMENT "$TMP_DIR/response"
done
if start_benchmark full '' invalid 0 46080 > "$TMP_DIR/response"; then exit 1; fi
[ ! -d "$RUNTIME_DIR/active.lock" ]
printf 'Selection launch tests passed: legacy 15, all 45, subset, cap, validation and plan totals.\n'

if command -v ucode >/dev/null 2>&1; then
 mkdir -p "$TMP_DIR/modules"
 cat > "$TMP_DIR/modules/forkop_adapter.uc" <<'UCODE'
return { get_benchmark_nodes: function(selector) {
 let nodes = [];
 for (let i = 1; i <= 45; i++)
  push(nodes, { tag: 'node-' + i, type: 'vless', display_name: 'Server ' + i });
 return nodes;
} };
UCODE
 adapter_cli="$ROOT/forkop-analyzer/files/usr/lib/forkop-analyzer/adapter_cli.uc"
 ucode -L "$TMP_DIR/modules/*.uc" "$adapter_cli" benchmark-nodes-lines '' '["node-30","node-44","node-30"]' > "$TMP_DIR/selected"
 [ "$(wc -l < "$TMP_DIR/selected" | tr -d ' ')" = 2 ]
 [ "$(cut -f1 "$TMP_DIR/selected" | tr '\n' ' ')" = 'node-30 node-44 ' ]
 for invalid in '[]' '["missing"]' '[1]' '{}' 'bad-json'; do
  if ucode -L "$TMP_DIR/modules/*.uc" "$adapter_cli" benchmark-nodes-lines '' "$invalid" > "$TMP_DIR/rejected"; then exit 1; fi
  [ ! -s "$TMP_DIR/rejected" ]
 done
 printf 'Adapter selection tests passed.\n'
else
 printf 'SKIP: adapter selection execution requires ucode.\n'
fi
