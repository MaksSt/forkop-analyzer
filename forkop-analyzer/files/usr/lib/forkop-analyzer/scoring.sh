#!/bin/sh

# Shared scoring implementation. All inputs are non-negative decimal numbers.

score_clamp() {
	awk -v value="$1" 'BEGIN {
		if (value < 0) value = 0;
		if (value > 100) value = 100;
		printf "%.0f\n", value;
	}'
}

score_lower_is_better() {
	awk -v value="$1" -v best="$2" -v worst="$3" 'BEGIN {
		if (worst <= best) exit 2;
		score = 100 - ((value - best) * 100 / (worst - best));
		if (score < 0) score = 0;
		if (score > 100) score = 100;
		printf "%.6f\n", score;
	}'
}

score_higher_is_better() {
	awk -v value="$1" -v target="$2" 'BEGIN {
		if (target <= 0) exit 2;
		score = value * 100 / target;
		if (score < 0) score = 0;
		if (score > 100) score = 100;
		printf "%.6f\n", score;
	}'
}

score_profile() {
	profile="$1"
	latency_ms="$2"
	jitter_ms="$3"
	success_pct="$4"
	download_mbps="${5:-0}"
	target_download_mbps="${6:-100}"

	latency_score="$(score_lower_is_better "$latency_ms" 20 300)" || return 2
	jitter_score="$(score_lower_is_better "$jitter_ms" 0 100)" || return 2
	reliability_score="$(score_clamp "$success_pct")" || return 2
	download_score="$(score_higher_is_better "$download_mbps" "$target_download_mbps")" || return 2

	case "$profile" in
		quick)
			weights='0.55 0.15 0.30 0.00'
		;;
		gaming)
			weights='0.45 0.35 0.20 0.00'
		;;
		full)
			weights='0.25 0.15 0.15 0.45'
		;;
		*)
			return 2
		;;
	esac

	set -- $weights
	awk -v latency="$latency_score" -v jitter="$jitter_score" \
		-v reliability="$reliability_score" -v download="$download_score" \
		-v wl="$1" -v wj="$2" -v wr="$3" -v wd="$4" 'BEGIN {
		value = latency * wl + jitter * wj + reliability * wr + download * wd;
		if (value < 0) value = 0;
		if (value > 100) value = 100;
		printf "%.0f\n", value;
	}'
}
