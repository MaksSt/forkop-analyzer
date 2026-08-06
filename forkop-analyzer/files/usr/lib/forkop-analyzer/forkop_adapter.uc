'use strict';

let fs = require('fs');
let uci = require('uci').cursor();

const FORKOP_BIN = '/usr/bin/forkop';
const FORKOP_INIT = '/etc/init.d/forkop';
const SING_BOX_BIN = '/usr/bin/sing-box';
const MIN_FORKOP_VERSION = '1.0.5';
const MIN_SING_BOX_VERSION = '1.12.4';

function as_string(value) {
	return value == null ? '' : '' + value;
}

function shell_quote(value) {
	return "'" + replace(as_string(value), /'/g, "'\\''") + "'";
}

function command_from_args(args) {
	let parts = [];
	for (let arg in args)
		push(parts, shell_quote(arg));
	return join(' ', parts);
}

function normalize_status(status) {
	status = int(status || 0);
	return status > 255 ? int(status / 256) : status;
}

function capture(args) {
	let pipe = fs.popen(command_from_args(args) + ' 2>/dev/null', 'r');
	if (!pipe)
		return { status: 127, output: '' };

	let output = pipe.read('all');
	let status = normalize_status(pipe.close());
	return { status, output: as_string(output) };
}

function command_success(args) {
	return capture(args).status == 0;
}

function file_executable(path) {
	let stat = fs.stat(path);
	return stat != null && stat.mode != null && (int(stat.mode) & 73) != 0;
}

function parse_json(value) {
	try {
		return json(as_string(value));
	}
	catch (e) {
		return null;
	}
}

function read_json_file(path) {
	let data = fs.readfile(as_string(path));
	return data == null ? null : parse_json(data);
}

function version_parts(value) {
	let matched = match(as_string(value), /([0-9]+)\.([0-9]+)\.([0-9]+)/);
	return matched == null ? null : [ int(matched[1]), int(matched[2]), int(matched[3]) ];
}

function version_at_least(value, minimum) {
	let current = version_parts(value);
	let required = version_parts(minimum);
	if (current == null || required == null)
		return false;

	for (let i = 0; i < 3; i++) {
		if (current[i] > required[i])
			return true;
		if (current[i] < required[i])
			return false;
	}
	return true;
}

function forkop_settings() {
	try {
		uci.load('forkop');
		let settings = {};
		uci.foreach('forkop', 'settings', function(section) {
			if (as_string(section['.name']) == 'settings')
				settings = section;
		});
		return settings;
	}
	catch (e) {
		return {};
	}
}

function detect_forkop() {
	return file_executable(FORKOP_BIN) && fs.stat('/etc/config/forkop') != null;
}

function forkop_output(args) {
	let command = [ FORKOP_BIN ];
	for (let arg in args)
		push(command, arg);
	return capture(command);
}

function get_forkop_version() {
	if (!detect_forkop())
		return '';
	let result = forkop_output([ 'show_version' ]);
	return result.status == 0 ? trim(result.output) : '';
}

function get_singbox_version() {
	if (!file_executable(SING_BOX_BIN))
		return '';
	let result = detect_forkop()
		? forkop_output([ 'show_sing_box_version' ])
		: capture([ SING_BOX_BIN, 'version' ]);
	if (result.status != 0)
		return '';
	let first = split(trim(result.output), /[ \t\r\n]+/);
	return length(first) > 0 ? as_string(first[length(first) - 1]) : '';
}

function get_runtime_config_path() {
	let settings = forkop_settings();
	return as_string(settings.config_path || '');
}

function runtime_config() {
	let path = get_runtime_config_path();
	return path == '' ? null : read_json_file(path);
}

function get_subscriptions() {
	let subscriptions = [];
	if (!detect_forkop())
		return subscriptions;

	try {
		uci.foreach('forkop', 'subscription_url', function(section) {
			push(subscriptions, {
				name: as_string(section['.name']),
				section: as_string(section.section || ''),
				enabled: as_string(section.enabled || '1') != '0',
				configured: as_string(section.url || '') != ''
			});
		});
	}
	catch (e) {
	}

	return subscriptions;
}

function safe_outbound(outbound) {
	if (type(outbound) != 'object')
		return null;
	let tag = as_string(outbound.tag || '');
	let outbound_type = as_string(outbound.type || '');
	if (tag == '' || outbound_type == '')
		return null;

	let item = { tag, type: outbound_type, group: outbound_type == 'selector' || outbound_type == 'urltest' };
	if (item.group) {
		item.members = type(outbound.outbounds) == 'array' ? outbound.outbounds : [];
		item.default = as_string(outbound.default || '');
	}
	return item;
}

function get_outbounds() {
	let config = runtime_config();
	let result = [];
	if (type(config) != 'object' || type(config.outbounds) != 'array')
		return result;

	for (let outbound in config.outbounds) {
		let item = safe_outbound(outbound);
		if (item != null)
			push(result, item);
	}
	return result;
}

function clash_proxies() {
	if (!detect_forkop())
		return null;
	let result = forkop_output([ 'clash_api', 'get_proxies' ]);
	if (result.status != 0)
		return null;
	let parsed = parse_json(result.output);
	return type(parsed) == 'object' && type(parsed.proxies) == 'object' ? parsed.proxies : null;
}

function get_selectors() {
	let proxies = clash_proxies();
	let selectors = [];
	for (let outbound in get_outbounds()) {
		if (!outbound.group)
			continue;
		let live = proxies != null && type(proxies[outbound.tag]) == 'object' ? proxies[outbound.tag] : {};
		push(selectors, {
			tag: outbound.tag,
			type: outbound.type,
			members: outbound.members,
			current: as_string(live.now || outbound.default || ''),
			selectable: outbound.type == 'selector'
		});
	}
	return selectors;
}

function get_benchmark_nodes(selector) {
	selector = as_string(selector);
	let by_tag = {};
	let selected_groups = [];
	let result = [];
	let seen = {};

	for (let item in get_outbounds())
		by_tag[item.tag] = item;

	if (selector != '') {
		if (type(by_tag[selector]) != 'object' || !by_tag[selector].group)
			return result;
		push(selected_groups, selector);
	}
	else {
		for (let item in get_outbounds())
			if (item.type == 'selector')
				push(selected_groups, item.tag);
	}

	function visit(tag) {
		tag = as_string(tag);
		if (tag == '' || seen[tag])
			return;
		seen[tag] = true;

		let item = by_tag[tag];
		if (type(item) != 'object')
			return;
		if (item.group) {
			for (let member in item.members)
				visit(member);
			return;
		}

		let blocked_type = item.type == 'direct' || item.type == 'block' || item.type == 'dns';
		if (!blocked_type)
			push(result, { tag: item.tag, type: item.type });
	}

	for (let group in selected_groups)
		visit(group);
	return result;
}

function get_current_node(selector) {
	selector = as_string(selector);
	for (let item in get_selectors())
		if (item.tag == selector)
			return as_string(item.current || '');
	return '';
}

function selector_has_member(selector, outbound_tag) {
	for (let item in get_selectors()) {
		if (item.tag != selector || !item.selectable)
			continue;
		for (let member in item.members)
			if (as_string(member) == as_string(outbound_tag))
				return true;
	}
	return false;
}

function select_node(selector, outbound_tag) {
	if (!selector_has_member(selector, outbound_tag))
		return { success: false, error: { code: 'INVALID_SELECTION', message: 'Selector or outbound membership is invalid' } };

	let result = forkop_output([ 'clash_api', 'set_group_proxy', selector, outbound_tag ]);
	if (result.status != 0)
		return { success: false, error: { code: 'SELECT_FAILED', message: 'Forkop rejected selector change' } };

	let response = parse_json(result.output);
	if (type(response) == 'object' && response.success === false)
		return { success: false, error: { code: 'SELECT_FAILED', message: as_string(response.error || 'Forkop rejected selector change') } };
	return { success: true, data: { selector, outbound_tag } };
}

function reload_forkop() {
	if (!detect_forkop())
		return false;
	return forkop_output([ 'reload', 'forkop-analyzer' ]).status == 0;
}

function get_clash_api_config() {
	let config = runtime_config();
	let clash = type(config) == 'object' && type(config.experimental) == 'object'
		? config.experimental.clash_api
		: null;
	if (type(clash) != 'object')
		return { available: false, external_controller: '', secret_configured: false };
	return {
		available: true,
		external_controller: as_string(clash.external_controller || ''),
		secret_configured: as_string(clash.secret || '') != ''
	};
}

function leaf_outbound_exists(tag) {
	for (let item in get_outbounds())
		if (item.tag == tag && !item.group)
			return true;
	return false;
}

function isolated_path_safe(path) {
	path = as_string(path);
	return substr(path, 0, 21) == '/tmp/forkop-analyzer/' && index(path, '..') < 0;
}

function prepare_isolated_config(outbound_tag, output_path, listen_port) {
	let config = runtime_config();
	listen_port = int(listen_port || 0);
	if (type(config) != 'object')
		return { success: false, error: { code: 'RUNTIME_CONFIG_UNAVAILABLE', message: 'Forkop runtime config is not readable' } };
	if (!leaf_outbound_exists(outbound_tag))
		return { success: false, error: { code: 'OUTBOUND_NOT_FOUND', message: 'Requested leaf outbound is not present in runtime config' } };
	if (!isolated_path_safe(output_path) || listen_port < 1024 || listen_port > 65535)
		return { success: false, error: { code: 'INVALID_ISOLATION_TARGET', message: 'Unsafe config path or listen port' } };
	if (type(config.endpoints) == 'array' && length(config.endpoints) > 0)
		return { success: false, error: { code: 'ENDPOINTS_UNSUPPORTED', message: 'Isolated mode is disabled when runtime endpoints are configured' } };

	config.inbounds = [ {
		type: 'mixed',
		tag: 'forkop-analyzer-in',
		listen: '127.0.0.1',
		listen_port
	} ];

	if (type(config.route) != 'object')
		config.route = {};
	config.route.rules = [ {
		action: 'route',
		inbound: [ 'forkop-analyzer-in' ],
		outbound: outbound_tag
	} ];

	if (type(config.experimental) == 'object') {
		delete config.experimental.clash_api;
		delete config.experimental.cache_file;
	}
	delete config.ntp;

	if (fs.writefile(output_path, sprintf('%J\n', config)) == null)
		return { success: false, error: { code: 'WRITE_FAILED', message: 'Unable to write isolated sing-box config' } };

	return { success: true, data: { output_path, outbound_tag, listen_port } };
}

function get_capabilities() {
	let forkop_installed = detect_forkop();
	let forkop_version = get_forkop_version();
	let singbox_version = get_singbox_version();
	let config = runtime_config();
	let clash = get_clash_api_config();
	let clash_live = clash_proxies() != null;
	let compatible = forkop_installed && version_at_least(forkop_version, MIN_FORKOP_VERSION);
	let singbox_compatible = file_executable(SING_BOX_BIN) && version_at_least(singbox_version, MIN_SING_BOX_VERSION);
	let runtime_available = type(config) == 'object' && type(config.outbounds) == 'array';
	let endpoints_safe = type(config) != 'object' || type(config.endpoints) != 'array' || length(config.endpoints) == 0;

	return {
		forkop_installed,
		forkop_version,
		forkop_compatible: compatible,
		singbox_version,
		singbox_compatible,
		runtime_config_available: runtime_available,
		subscriptions_supported: compatible,
		clash_api_available: clash.available && clash_live,
		selector_switch_available: compatible && clash_live,
		isolated_benchmark_supported: compatible && singbox_compatible && runtime_available && endpoints_safe && file_executable('/usr/bin/curl'),
		temporary_singbox_supported: singbox_compatible && runtime_available && endpoints_safe,
		minimum_forkop_version: MIN_FORKOP_VERSION,
		minimum_singbox_version: MIN_SING_BOX_VERSION
	};
}

return {
	detect_forkop,
	get_forkop_version,
	get_singbox_version,
	get_runtime_config_path,
	get_subscriptions,
	get_outbounds,
	get_selectors,
	get_benchmark_nodes,
	get_current_node,
	select_node,
	reload_forkop,
	get_clash_api_config,
	get_capabilities,
	prepare_isolated_config,
	forkop_output,
	parse_json
};
