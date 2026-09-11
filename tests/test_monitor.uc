'use strict';
let adapter = require('forkop_adapter');
let store = require('monitor_store');
function check(ok, message) { if (!ok) { warn(message, '\n'); exit(1); } }
let outbounds = [ { tag: 'vpn-out', type: 'selector', group: true }, { tag: 'node', display_name: 'Finland' } ];
let proxies = {
	'vpn-out': { all: [ 'priority' ], now: 'priority' },
	priority: { all: [ 'urltest' ], now: 'urltest' },
	urltest: { all: [ 'node' ], now: 'node' },
	node: { type: 'Hysteria2' }
};
let target = adapter.monitor_target(proxies, outbounds, '');
check(target.tag == 'node' && target.name == 'Finland', 'Nested group must resolve to live leaf');
check(adapter.monitor_target(null, outbounds, '').tag == '', 'No default selection when API unavailable');
proxies.urltest.now = 'missing';
check(adapter.monitor_target(proxies, outbounds, '').tag == '', 'Non-member now rejected');
proxies.urltest.now = 'node';
proxies.node = { all: [ 'vpn-out' ], now: 'vpn-out' };
check(adapter.monitor_target(proxies, outbounds, '').tag == '', 'Cyclic group rejected');
check(adapter.monitor_target({}, outbounds, 'missing').tag == '', 'Missing explicit selector rejected');
function result(probe, tag) {
	return adapter.monitor_result({ tag: 'A' }, { tag: tag == null ? 'A' : tag, state: 'unknown', latency_ms: null }, probe);
}
check(result({ delay: 123 }).state == 'up', 'Positive fresh delay is up');
check(result({ delay: 0 }).state == 'down', 'Zero delay is a failed probe');
check(result({ message: 'Timeout' }).state == 'down', 'Delay timeout is down');
check(result({ message: 'An error occurred in the delay test' }).state == 'down', 'Failed delay test is down');
check(result({ message: 'Unauthorized' }).state == 'unknown', 'API auth failure is unknown');
check(result({ message: 'Resource not found' }).state == 'unknown', 'Missing node is unknown');
check(result(null).state == 'unknown', 'Invalid API response is unknown');
check(result({ delay: 100 }, 'B').state == 'unknown', 'Do not assign latency to a newly selected server');
check(result({ delay: 100 }, '').state == 'unknown', 'Lost API after probe is unknown');
check(result({ delay: '123' }).state == 'unknown', 'Malformed delay is unknown');
let history = store.append_sample({ samples: [ { at: 1 }, { at: 10 }, { at: 86415 } ] }, { at: 86410 }, 15);
check(length(history.samples) == 2 && history.samples[0].at == 10, 'Trim expired and future samples');
history = store.append_sample(history, { at: 86410, state: 'down' }, 15);
check(length(history.samples) == 2 && history.samples[1].state == 'down', 'Replace duplicate timestamp');
let many = [];
for (let i = 0; i < 9000; i++) push(many, { at: i });
history = store.append_sample({ samples: many }, { at: 9000 }, 10);
check(length(history.samples) == 8641, 'RAM history is bounded');
let packed = store.pack_history({ samples: [
	{ at: 100, selector: 'vpn-out', tag: 'A', name: 'Server A', state: 'up', latency_ms: 124, interval: 15, reason: '' },
	{ at: 115, selector: 'vpn-out', tag: 'A', name: 'Server A', state: 'down', latency_ms: null, interval: 15, reason: 'probe_failed' }
] });
check(length(packed.routes) == 1 && length(packed.samples) == 2, 'Deduplicate route metadata');
check(packed.samples[1][1] == 0 && packed.samples[1][2] == 'down', 'Compact response preserves failed sample');
// Историческое имя неизменно, даже когда подписка переиспользует runtime tag.
packed = store.pack_history({ samples: [
	{ at: 100, selector: 'vpn-out', tag: 'vpn-1-out', name: 'Netherlands', state: 'up', latency_ms: 100, interval: 15, reason: '' },
	{ at: 115, selector: 'vpn-out', tag: 'vpn-1-out', name: 'Germany', state: 'up', latency_ms: 240, interval: 15, reason: '' },
	{ at: 130, selector: 'vpn-out', tag: 'vpn-1-out', name: 'Netherlands', state: 'up', latency_ms: 120, interval: 15, reason: '' }
] });
check(length(packed.routes) == 2, 'Reused runtime tag must not merge different historical server names');
check(packed.routes[0].name == 'Netherlands' && packed.routes[1].name == 'Germany', 'Packing must not rename old observations');
check(packed.samples[0][1] == 0 && packed.samples[1][1] == 1 && packed.samples[2][1] == 0, 'Returning server reuses only its own identity');
// Выполняем настоящий get_monitor_sample: ловит ошибки связывания функций
// ucode, которые не видны при вызове отдельных обработчиков и при -c.
let fs = require('fs');
let original_readfile = fs.readfile;
let original_popen = fs.popen;
let responses = [];
let commands = [];
fs.readfile = function(path) {
	check(path == '/test/forkop-analyzer/runtime.json', 'Unexpected fixture file read');
	return sprintf('%J', { outbounds: [
		{ tag: 'vpn-out', type: 'selector', outbounds: [ 'A', 'B' ], default: 'A' },
		{ tag: 'A', type: 'hysteria2' }, { tag: 'B', type: 'vless' }
	] });
};
fs.popen = function(command, mode) {
	push(commands, command);
	let response = shift(responses);
	check(response != null, 'Unexpected external command');
	return { read: function() { return response.output; }, close: function() { return response.status; } };
};
function live(tag) {
	return { status: 0, output: sprintf('%J', { proxies: {
		'vpn-out': { all: [ 'A', 'B' ], now: tag }, A: { type: 'Hysteria2' }, B: { type: 'VLESS' }
	} }) };
}
responses = [ live('A'), { status: 0, output: '{"delay":123}' }, live('A') ];
let sample = adapter.get_monitor_sample('vpn-out');
check(sample.state == 'up' && sample.tag == 'A' && sample.latency_ms == 123, 'Full collector must emit successful probe');
check(length(commands) == 3 && index(commands[1], "'get_proxy_latency' 'A' '5000'") >= 0, 'Probe only the live leaf through Forkop');
responses = [ live('A'), { status: 0, output: '{"message":"Timeout"}' }, live('A') ];
check(adapter.get_monitor_sample('vpn-out').state == 'down', 'Full collector must emit failed probe');
responses = [ live('A'), { status: 0, output: '{"delay":123}' }, live('B') ];
sample = adapter.get_monitor_sample('vpn-out');
check(sample.tag == 'B' && sample.state == 'unknown' && sample.reason == 'changed_during_probe', 'Full collector must reject latency measured before switch');
responses = [ { status: 1, output: '' } ];
check(adapter.get_monitor_sample('vpn-out').reason == 'api_unavailable', 'API failure must not start a probe');
check(length(responses) == 0, 'All mock responses consumed');
fs.readfile = original_readfile;
fs.popen = original_popen;
print('Monitor adapter, collector and history tests passed.\n');
