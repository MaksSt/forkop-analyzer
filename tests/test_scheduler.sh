#!/bin/sh
set -eu

ROOT="$(unset CDPATH; cd -- "$(dirname -- "$0")/.." && pwd)"
SCHEDULER="$ROOT/forkop-analyzer/files/usr/bin/forkop-analyzer-scheduler"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf -- "$TMP_DIR"' EXIT INT TERM

FAKE_BIN="$TMP_DIR/bin"
RUNTIME_DIR="$TMP_DIR/run"
STATE_DIR="$TMP_DIR/state"
COUNT_FILE="$TMP_DIR/start-count"
mkdir -p "$FAKE_BIN"
printf '0\n' > "$COUNT_FILE"

cat > "$FAKE_BIN/uci" <<'EOF'
#!/bin/sh
case "$*" in
	*schedule_enabled) printf '1\n' ;;
	*schedule_hour) printf '4\n' ;;
	*schedule_profile) printf 'quick\n' ;;
	*) exit 1 ;;
esac
EOF

cat > "$FAKE_BIN/date" <<'EOF'
case "$1" in
	+%H) printf '04\n' ;;
	+%Y-%m-%d) printf '2026-09-04\n' ;;
	*) exit 1 ;;
esac
EOF

cat > "$FAKE_BIN/analyzer" <<'EOF'
#!/bin/sh
count="$(sed -n '1p' "$COUNT_FILE")"
printf '%s\n' "$((count + 1))" > "$COUNT_FILE"
EOF
chmod +x "$FAKE_BIN/uci" "$FAKE_BIN/date" "$FAKE_BIN/analyzer"

run_scheduler_once() {
	PATH="$FAKE_BIN:$PATH" \
	COUNT_FILE="$COUNT_FILE" \
	FORKOP_ANALYZER_RUNTIME_DIR="$RUNTIME_DIR" \
	FORKOP_ANALYZER_STATE_DIR="$STATE_DIR" \
	FORKOP_ANALYZER_BIN="$FAKE_BIN/analyzer" \
	FORKOP_ANALYZER_RUN_ONCE=1 \
		sh "$SCHEDULER"
}

run_scheduler_once
[ "$(sed -n '1p' "$COUNT_FILE")" = '1' ]
[ "$(sed -n '1p' "$STATE_DIR/schedule-day")" = '2026-09-04' ]

# A reboot clears /var/run but must not trigger a second benchmark that day.
rm -rf -- "$RUNTIME_DIR"
run_scheduler_once

[ "$(sed -n '1p' "$COUNT_FILE")" = '1' ]
[ -d "$RUNTIME_DIR" ]
[ "$(stat -c '%a' "$STATE_DIR")" = '700' ]
[ "$(stat -c '%a' "$STATE_DIR/schedule-day")" = '600' ]

printf 'Scheduler persistence tests passed.\n'
