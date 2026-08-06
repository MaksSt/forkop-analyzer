#!/usr/bin/env ucode
'use strict';

let adapter = require('forkop_adapter');

function write_json(value) {
	print(sprintf('%J\n', value));
}

function success(data) {
	write_json({ success: true, data });
	return 0;
}

function fail(code, message) {
	write_json({ success: false, error: { code, message } });
	return 1;
}

let mode = ARGV[0] || '';

if (mode == 'capabilities')
	exit(success(adapter.get_capabilities()));
else if (mode == 'subscriptions')
	exit(success(adapter.get_subscriptions()));
else if (mode == 'outbounds')
	exit(success(adapter.get_outbounds()));
else if (mode == 'selectors')
	exit(success(adapter.get_selectors()));
else if (mode == 'benchmark-nodes')
	exit(success(adapter.get_benchmark_nodes(ARGV[1] || '')));
else if (mode == 'benchmark-nodes-lines') {
	for (let item in adapter.get_benchmark_nodes(ARGV[1] || '')) {
		let tag = '' + item.tag;
		let outbound_type = '' + item.type;
		if (match(tag, /[\t\r\n]/) == null && match(outbound_type, /[\t\r\n]/) == null)
			print(tag, '\t', outbound_type, '\n');
	}
	exit(0);
}
else if (mode == 'current-node')
	exit(success({ selector: ARGV[1] || '', outbound_tag: adapter.get_current_node(ARGV[1]) }));
else if (mode == 'select-node') {
	let response = adapter.select_node(ARGV[1], ARGV[2]);
	write_json(response);
	exit(response.success ? 0 : 1);
}
else if (mode == 'reload')
	exit(adapter.reload_forkop() ? success({ reloaded: true }) : fail('RELOAD_FAILED', 'Forkop reload failed'));
else if (mode == 'clash-api') {
	let args = [ 'clash_api' ];
	for (let i = 1; i < length(ARGV); i++)
		push(args, ARGV[i]);
	let result = adapter.forkop_output(args);
	if (result.output != '')
		print(result.output);
	exit(result.status);
}
else if (mode == 'prepare-isolated') {
	let response = adapter.prepare_isolated_config(ARGV[1], ARGV[2], ARGV[3]);
	write_json(response);
	exit(response.success ? 0 : 1);
}
else
	exit(fail('UNKNOWN_COMMAND', 'Unknown adapter command'));
