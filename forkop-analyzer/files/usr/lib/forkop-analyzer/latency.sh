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

latency_success_percentage() {
	awk -v successful="$1" -v attempts="$2" 'BEGIN {
		printf "%.2f", (attempts > 0 ? successful * 100 / attempts : 0);
	}'
}
