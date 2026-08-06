#!/bin/sh

# Clash-compatible delay values are positive milliseconds. A zero value is a
# failure sentinel, not a meaningful latency sample for a remote VPN node.
latency_sample_is_valid() {
	awk -v value="$1" -v timeout="$2" 'BEGIN {
		if (value !~ /^[0-9]+([.][0-9]+)?$/)
			exit 1;
		value += 0;
		timeout += 0;
		exit !(value > 0 && timeout > 0 && value <= timeout);
	}'
}

latency_sample_count() {
	awk 'NF { count++ } END { print count + 0 }' "$1"
}

latency_metrics() {
	awk 'NR == 1 { min=$1; max=$1; prev=$1 } {
		sum += $1;
		if ($1 < min) min=$1;
		if ($1 > max) max=$1;
		if (NR > 1) {
			diff=$1-prev;
			if (diff < 0) diff=-diff;
			diff_sum += diff;
		}
		prev=$1;
	} END {
		if (NR == 0) exit 1;
		printf "%.3f %.3f %.3f %.3f", sum/NR, min, max,
			(NR > 1 ? diff_sum/(NR-1) : 0);
	}' "$1"
}

latency_success_percentage() {
	awk -v successful="$1" -v attempts="$2" 'BEGIN {
		printf "%.2f", (attempts > 0 ? successful * 100 / attempts : 0);
	}'
}
