'use strict';

let fs = require('fs');
let uci = require('uci').cursor();
let store = require('monitor_store');
const DIRECTORY = '/var/run/forkop-analyzer-monitor';
const PATH = DIRECTORY + '/history.json';

function read_history() {
	try {
		let history = json(fs.readfile(PATH) || '{}');
		return type(history) == 'object' ? history : {};
	}
	catch (e) {
		return {};
	}
}

let interval = int(uci.get('forkop-analyzer', 'main', 'monitor_interval') || 15);
if (interval < 10 || interval > 300)
	interval = 15;
let enabled = uci.get('forkop-analyzer', 'main', 'enabled') == '1'
	&& uci.get('forkop-analyzer', 'main', 'monitor_enabled') != '0';

if (ARGV[0] == 'read') {
	let history = read_history();
	let packed = store.pack_history(history);
	print(sprintf('%J\n', { success: true, data: {
		enabled, interval, updated_at: history.updated_at || 0,
		format: packed.format, routes: packed.routes, samples: packed.samples
	} }));
}
else if (ARGV[0] == 'sample' && enabled) {
	let adapter = require('forkop_adapter');
	let selector = uci.get('forkop-analyzer', 'main', 'monitor_selector') || '';
	let sample = adapter.get_monitor_sample(selector);
	sample.at = time();
	sample.interval = interval;
	let history = store.append_sample(read_history(), sample, interval);
	fs.mkdir(DIRECTORY, 448);
	let temporary = PATH + '.tmp';
	if (fs.writefile(temporary, sprintf('%J\n', history)) == null)
		exit(1);
	if (!fs.chmod(temporary, 384) || !fs.rename(temporary, PATH)) {
		fs.unlink(temporary);
		exit(1);
	}
}
else if (ARGV[0] != 'sample')
	exit(1);
