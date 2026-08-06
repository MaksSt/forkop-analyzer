#!/usr/bin/env ucode
'use strict';

let fs = require('fs');

function as_string(value) {
	return value == null ? '' : '' + value;
}

function as_number(value) {
	let parsed = +as_string(value);
	return parsed == parsed ? parsed : 0;
}

function read_json(path) {
	let data = fs.readfile(as_string(path));
	if (data == null)
		return null;
	try {
		return json(data);
	}
	catch (e) {
		return null;
	}
}

function write_atomic(path, value) {
	path = as_string(path);
	let stamp = clock();
	let temporary = sprintf('%s.%d.%d.tmp', path, stamp[0], stamp[1]);
	if (fs.writefile(temporary, sprintf('%J\n', value)) == null)
		return false;
	if (!fs.rename(temporary, path)) {
		fs.unlink(temporary);
		return false;
	}
	return true;
}

function write_both(state_path, result_path, value) {
	value.updated_at = int(clock()[0]);
	return write_atomic(result_path, value) && write_atomic(state_path, value);
}

function response(success, data, code, message) {
	let value = success
		? { success: true, data }
		: { success: false, error: { code, message } };
	print(sprintf('%J\n', value));
	return success ? 0 : 1;
}

function load_job(result_path) {
	let value = read_json(result_path);
	return type(value) == 'object' ? value : null;
}

function init_job(state_path, result_path, job_id, profile, selector, original_node, total) {
	let now = int(clock()[0]);
	let value = {
		version: 1,
		job_id: as_string(job_id),
		profile: as_string(profile),
		selector: as_string(selector),
		status: 'running',
		message: 'Benchmark is running',
		started_at: now,
		updated_at: now,
		finished_at: null,
		completed: 0,
		total: int(total || 0),
		current_tag: '',
		traffic_bytes: 0,
		selector_state: {
			original: as_string(original_node),
			final: '',
			unchanged: null
		},
		results: []
	};
	return write_both(state_path, result_path, value)
		? response(true, value)
		: response(false, null, 'STATE_WRITE_FAILED', 'Unable to initialize benchmark state');
}

function progress_job(state_path, result_path, current_tag, completed, traffic_bytes) {
	let value = load_job(result_path);
	if (value == null)
		return response(false, null, 'JOB_NOT_FOUND', 'Benchmark result does not exist');
	value.current_tag = as_string(current_tag);
	value.completed = int(completed || 0);
	value.traffic_bytes = int(traffic_bytes || 0);
	return write_both(state_path, result_path, value) ? 0 : 1;
}

function append_result(state_path, result_path) {
	let value = load_job(result_path);
	if (value == null)
		return response(false, null, 'JOB_NOT_FOUND', 'Benchmark result does not exist');

	let item = {
		tag: as_string(ARGV[3]),
		type: as_string(ARGV[4]),
		latency_ms: as_number(ARGV[5]),
		latency_min_ms: as_number(ARGV[6]),
		latency_max_ms: as_number(ARGV[7]),
		jitter_ms: as_number(ARGV[8]),
		success_pct: as_number(ARGV[9]),
		successful_samples: int(ARGV[10] || 0),
		attempts: int(ARGV[11] || 0),
		download_mbps: as_number(ARGV[12]),
		score: int(ARGV[13] || 0),
		error: as_string(ARGV[14])
	};
	if (type(value.results) != 'array')
		value.results = [];
	push(value.results, item);
	return write_both(state_path, result_path, value) ? 0 : 1;
}

function finish_job(state_path, result_path, status, message, final_node, unchanged, traffic_bytes) {
	let value = load_job(result_path);
	if (value == null)
		return response(false, null, 'JOB_NOT_FOUND', 'Benchmark result does not exist');
	value.status = as_string(status);
	value.message = as_string(message);
	value.current_tag = '';
	value.finished_at = int(clock()[0]);
	value.traffic_bytes = int(traffic_bytes || value.traffic_bytes || 0);
	value.selector_state.final = as_string(final_node);
	value.selector_state.unchanged = as_string(unchanged) == '1';
	return write_both(state_path, result_path, value)
		? response(true, value)
		: response(false, null, 'STATE_WRITE_FAILED', 'Unable to finalize benchmark state');
}

function read_job(path) {
	let value = read_json(path);
	if (value == null)
		return response(false, null, 'JOB_NOT_FOUND', 'Benchmark result does not exist');
	return response(true, value);
}

function result_summary(value) {
	let best = null;
	for (let item in (type(value.results) == 'array' ? value.results : []))
		if (best == null || int(item.score || 0) > int(best.score || 0))
			best = item;
	return {
		job_id: as_string(value.job_id),
		profile: as_string(value.profile),
		selector: as_string(value.selector),
		status: as_string(value.status),
		started_at: value.started_at,
		finished_at: value.finished_at,
		completed: int(value.completed || 0),
		total: int(value.total || 0),
		traffic_bytes: int(value.traffic_bytes || 0),
		best: best == null ? null : { tag: best.tag, score: best.score }
	};
}

function list_results(directory) {
	let values = [];
	for (let path in fs.glob(as_string(directory) + '/*.json')) {
		let value = read_json(path);
		if (type(value) == 'object')
			push(values, result_summary(value));
	}
	sort(values, function(a, b) {
		return int(b.started_at || 0) - int(a.started_at || 0);
	});
	return response(true, values);
}

function csv_cell(value) {
	return '"' + replace(as_string(value), /"/g, '""') + '"';
}

function export_csv(path) {
	let value = read_json(path);
	if (value == null)
		return 1;
	print('job_id,profile,selector,tag,type,latency_ms,latency_min_ms,latency_max_ms,jitter_ms,success_pct,download_mbps,score,error\n');
	for (let item in (type(value.results) == 'array' ? value.results : [])) {
		print(join(',', [
			csv_cell(value.job_id), csv_cell(value.profile), csv_cell(value.selector),
			csv_cell(item.tag), csv_cell(item.type), as_string(item.latency_ms),
			as_string(item.latency_min_ms), as_string(item.latency_max_ms),
			as_string(item.jitter_ms), as_string(item.success_pct),
			as_string(item.download_mbps), as_string(item.score), csv_cell(item.error)
		]), '\n');
	}
	return 0;
}

let mode = ARGV[0] || '';

if (mode == 'init')
	exit(init_job(ARGV[1], ARGV[2], ARGV[3], ARGV[4], ARGV[5], ARGV[6], ARGV[7]));
else if (mode == 'progress')
	exit(progress_job(ARGV[1], ARGV[2], ARGV[3], ARGV[4], ARGV[5]));
else if (mode == 'append')
	exit(append_result(ARGV[1], ARGV[2]));
else if (mode == 'finish')
	exit(finish_job(ARGV[1], ARGV[2], ARGV[3], ARGV[4], ARGV[5], ARGV[6], ARGV[7]));
else if (mode == 'read')
	exit(read_job(ARGV[1]));
else if (mode == 'list')
	exit(list_results(ARGV[1]));
else if (mode == 'export-json') {
	let value = fs.readfile(as_string(ARGV[1]));
	if (value == null)
		exit(1);
	print(value);
	exit(0);
}
else if (mode == 'export-csv')
	exit(export_csv(ARGV[1]));
else
	exit(response(false, null, 'UNKNOWN_COMMAND', 'Unknown result-store command'));
