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
	if (!fs.chmod(temporary, 384)) {
		fs.unlink(temporary);
		return false;
	}
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
		current_display_name: '',
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

function progress_job(state_path, result_path, current_tag, current_display_name, completed, traffic_bytes) {
	let value = load_job(result_path);
	if (value == null)
		return response(false, null, 'JOB_NOT_FOUND', 'Benchmark result does not exist');
	value.current_tag = as_string(current_tag);
	value.current_site = as_string(ARGV[7]);
	value.current_display_name = as_string(current_display_name || current_tag);
	value.completed = int(completed || 0);
	value.traffic_bytes = int(traffic_bytes || 0);
	return write_both(state_path, result_path, value) ? 0 : 1;
}

// Only explicit evidence from the public landing page; never persist response bodies.
function body_diagnosis(path, headers_path, curl_code) {
 let body = fs.readfile(as_string(path)) || '';
 let headers = lc(fs.readfile(as_string(headers_path)) || '');
 let blocks = split(headers, /\r?\n\r?\n/);
 for (let block in blocks) if (index(block, 'http/') == 0) headers = block;
 let bytes = length(body), truncated = bytes >= 65536;
 let result = { body_state: 'inconclusive', body_bytes: bytes, body_truncated: truncated, evidence: 'insufficient_content' };
 if (curl_code != 0 && !(curl_code == 23 && truncated)) {
  result.evidence = 'fetch_error'; return result;
 }
 if (match(headers, /cf-mitigated:[ \t]*challenge/)) {
  result.body_state = 'challenge'; result.evidence = 'cf_mitigated'; return result;
 }
 if (!match(headers, /content-type:[^\r\n]*(text\/|application\/json)/)) return result;
 let visible = lc(body);
 for (let tag in [ 'script', 'style' ]) {
  while (true) {
   let start = index(visible, '<' + tag);
   if (start < 0) break;
   let tail = substr(visible, start), end = index(tail, '</' + tag + '>');
   visible = substr(visible, 0, start) + ' ' + (end < 0 ? '' : substr(tail, end + length(tag) + 3));
  }
 }
 visible = replace(replace(visible, /<[^>]*>/g, ' '), /[[:space:]]+/g, ' ');
 if (match(visible, /verify (that )?you are human|checking your browser|just a moment|enable javascript and cookies to continue/)) {
  result.body_state = 'challenge'; result.evidence = 'human_verification'; return result;
 }
 // Limit phrase matching to short error pages to avoid FAQ / marketing false positives.
 if (length(visible) < 3000 && match(visible, /not (available|supported) in your (country|region)|unavailable in your (country|region|location)|unsupported_country_region_territory|unable to provide access to our services in your region|недоступ(ен|на|но) в вашей стране/)) {
  result.body_state = 'geo_blocked'; result.evidence = 'explicit_region_message'; return result;
 }
 if (length(trim(visible)) >= 80) {
  result.body_state = 'no_markers'; result.evidence = 'no_explicit_region_message';
 }
 return result;
}

function append_site(state_path, result_path) {
	let value = load_job(result_path);
	if (value == null) return 1;
	let tag = as_string(ARGV[3]);
	let item = null;
	for (let existing in value.results)
		if (existing.tag == tag) item = existing;
	if (item == null) {
		item = { tag, display_name: as_string(ARGV[4]), type: as_string(ARGV[5]), site_results: [] };
		push(value.results, item);
	}
	let code = int(ARGV[7] || 0), curl_code = int(ARGV[9] || 0);
 let diagnosis = null;
 if (ARGV[11] && (ARGV[6] == 'chatgpt.com' || ARGV[6] == 'claude.ai') && ARGV[10] != 'setup_error')
  diagnosis = body_diagnosis(ARGV[11], ARGV[12], curl_code);
 let intentional_limit = diagnosis != null && curl_code == 23 && diagnosis.body_truncated;
	let state = curl_code == 47 ? 'redirect_limit' : curl_code != 0 && !intentional_limit ? 'network_error' : code >= 200 && code < 300 ? 'ok' :
		code >= 300 && code < 400 ? 'redirect' : code == 403 || code == 429 ? 'restricted' :
		code == 405 ? 'head_unsupported' : code >= 400 && code < 500 ? 'http_error' : code >= 500 ? 'server_error' : 'network_error';
	if (ARGV[10] == 'setup_error') state = 'setup_error';
	if (diagnosis != null) {
  if (diagnosis.body_state == 'geo_blocked' || diagnosis.body_state == 'challenge') state = diagnosis.body_state;
  else if (state == 'ok') state = 'unverified';
 }
 let site = { domain: as_string(ARGV[6]), state, http_code: code,
  elapsed_ms: as_number(ARGV[8]) * 1000, curl_code };
 if (diagnosis != null) for (let key, val in diagnosis) site[key] = val;
 push(item.site_results, site);
	return write_both(state_path, result_path, value) ? 0 : 1;
}

function append_result(state_path, result_path) {
	let value = load_job(result_path);
	if (value == null)
		return response(false, null, 'JOB_NOT_FOUND', 'Benchmark result does not exist');

	let item = {
		tag: as_string(ARGV[3]),
		display_name: as_string(ARGV[4] || ARGV[3]),
		type: as_string(ARGV[5]),
		latency_ms: as_number(ARGV[6]),
		latency_min_ms: as_number(ARGV[7]),
		latency_max_ms: as_number(ARGV[8]),
		jitter_ms: as_number(ARGV[9]),
		success_pct: as_number(ARGV[10]),
		loss_pct: as_number(ARGV[11]),
		latency_p95_ms: as_number(ARGV[12]),
		latency_spikes: int(ARGV[13] || 0),
		successful_samples: int(ARGV[14] || 0),
		attempts: int(ARGV[15] || 0),
		download_mbps: as_number(ARGV[16]),
		score: int(ARGV[17] || 0),
		error: as_string(ARGV[18])
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
	value.current_site = '';
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
		best: value.profile == 'sites' || best == null ? null : { tag: best.tag, display_name: as_string(best.display_name || best.tag), score: best.score }
	};
}

function delete_cancelled(path) {
 let value = read_json(path);
 if (value == null) return response(false, null, 'JOB_NOT_FOUND', 'Проверка не найдена');
 if (value.status != 'cancelled') return response(false, null, 'NOT_CANCELLED', 'Удалить можно только отменённую проверку');
 return fs.unlink(as_string(path)) ? response(true, { deleted: true }) : response(false, null, 'DELETE_FAILED', 'Не удалось удалить проверку');
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
	if (value.profile == 'sites') {
		print('job_id,tag,display_name,domain,state,http_code,elapsed_ms,curl_code,body_state,body_bytes,body_truncated,evidence\n');
		for (let item in value.results)
			for (let site in (item.site_results || []))
				print(join(',', [ csv_cell(value.job_id), csv_cell(item.tag), csv_cell(item.display_name),
					csv_cell(site.domain), csv_cell(site.state), site.http_code, site.elapsed_ms, site.curl_code, csv_cell(site.body_state), csv_cell(site.body_bytes), csv_cell(site.body_truncated), csv_cell(site.evidence) ]), '\n');
		return 0;
	}
	print('job_id,profile,selector,tag,display_name,type,latency_ms,latency_min_ms,latency_max_ms,jitter_ms,latency_p95_ms,latency_spikes,success_pct,loss_pct,download_mbps,score,error\n');
	for (let item in (type(value.results) == 'array' ? value.results : [])) {
		print(join(',', [
			csv_cell(value.job_id), csv_cell(value.profile), csv_cell(value.selector),
			csv_cell(item.tag), csv_cell(item.display_name || item.tag), csv_cell(item.type), as_string(item.latency_ms),
			as_string(item.latency_min_ms), as_string(item.latency_max_ms),
			as_string(item.jitter_ms), as_string(item.latency_p95_ms), as_string(item.latency_spikes),
			as_string(item.success_pct), as_string(item.loss_pct),
			as_string(item.download_mbps), as_string(item.score), csv_cell(item.error)
		]), '\n');
	}
	return 0;
}

let mode = ARGV[0] || '';

if (mode == 'init')
	exit(init_job(ARGV[1], ARGV[2], ARGV[3], ARGV[4], ARGV[5], ARGV[6], ARGV[7]));
else if (mode == 'progress')
	exit(progress_job(ARGV[1], ARGV[2], ARGV[3], ARGV[4], ARGV[5], ARGV[6]));
else if (mode == 'site')
	exit(append_site(ARGV[1], ARGV[2]));
else if (mode == 'append')
	exit(append_result(ARGV[1], ARGV[2]));
else if (mode == 'finish')
	exit(finish_job(ARGV[1], ARGV[2], ARGV[3], ARGV[4], ARGV[5], ARGV[6], ARGV[7]));
else if (mode == 'read')
	exit(read_job(ARGV[1]));
else if (mode == 'delete-cancelled')
 exit(delete_cancelled(ARGV[1]));
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
