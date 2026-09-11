#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
CONFIG="$ROOT/forkop-analyzer/files/etc/config/forkop-analyzer"
WORKER="$ROOT/forkop-analyzer/files/usr/libexec/forkop-analyzer-worker"
SETTINGS="$ROOT/luci-app-forkop-analyzer/htdocs/luci-static/resources/view/forkop-analyzer/settings-v4.js"

grep -Fq "option download_url 'https://nbg1-speed.hetzner.com/1GB.bin'" "$CONFIG"
grep -Fq "option download_bytes '1073741824'" "$CONFIG"
grep -Fq "option download_chunk_bytes '1073741824'" "$CONFIG"
grep -Fq "option download_timeout_seconds '900'" "$CONFIG"
grep -Fq "option full_max_nodes '15'" "$CONFIG"
grep -Fq "option max_traffic_mb '15360'" "$CONFIG"

grep -Fq 'DOWNLOAD_BYTES="$(uci_number download_bytes 1073741824)"' "$WORKER"
grep -Fq 'DOWNLOAD_CHUNK_BYTES="$(uci_number download_chunk_bytes 1073741824)"' "$WORKER"
grep -Fq 'DOWNLOAD_TIMEOUT_SECONDS="$(uci_number download_timeout_seconds 900)"' "$WORKER"
grep -Fq 'FULL_MAX_NODES="$(uci_number full_max_nodes 15)"' "$WORKER"
grep -Fq 'MAX_TRAFFIC_MB="$(uci_number max_traffic_mb 15360)"' "$WORKER"
grep -Fq -- '--max-time "$DOWNLOAD_TIMEOUT_SECONDS" --max-filesize "$request_bytes"' "$WORKER"
grep -Fq 'sed "s/{bytes}/$request_bytes/g"' "$WORKER"
grep -Fq 'while [ "$downloaded" -lt "$DOWNLOAD_BYTES" ]' "$WORKER"
grep -Fq '[ "$curl_status" -eq 28 ]' "$WORKER"
grep -Fq '[ "$size" -gt 0 ]' "$WORKER"
grep -Fq 'Throughput failed: curl $curl_status, HTTP $http_code, $downloaded bytes received' "$WORKER"

grep -Fq "option.default = 'https://nbg1-speed.hetzner.com/1GB.bin';" "$SETTINGS"
grep -Fq "option.default = '1073741824';" "$SETTINGS"
grep -Fq "option.default = '900';" "$SETTINGS"
grep -Fq "option.default = '15';" "$SETTINGS"
grep -Fq "option.default = '15360';" "$SETTINGS"

printf 'Throughput contract tests passed.\n'
