'use strict';

// История хранится в RAM: частые измерения не записываются во flash.
const MAX_AGE = 86400;
const MAX_SAMPLES = 8641;

function append_sample(history, sample, interval) {
	let samples = [];
	for (let item in (type(history.samples) == 'array' ? history.samples : []))
		if (item.at >= sample.at - MAX_AGE && item.at < sample.at)
			push(samples, item);
	push(samples, sample);
	if (length(samples) > MAX_SAMPLES)
		samples = slice(samples, length(samples) - MAX_SAMPLES);
	return { version: 1, updated_at: sample.at, interval, samples };
}

// Повторяющиеся имена не раздувают ответы ubus с суточной историей.
function pack_history(history) {
	let routes = [];
	let indices = {};
	let samples = [];
	for (let item in (type(history.samples) == 'array' ? history.samples : [])) {
		// Один runtime tag может после обновления подписки обозначать другой сервер.
		let key = sprintf('%J', [ item.selector, item.tag, item.name || item.tag ]);
		let index = indices[key];
		if (index == null) {
			index = length(routes);
			indices[key] = index;
			push(routes, { selector: item.selector, tag: item.tag, name: item.name });
		}
		push(samples, [ item.at, index, item.state, item.latency_ms, item.interval, item.reason ]);
	}
	return { format: 'compact-v1', routes, samples };
}

return { append_sample, pack_history };
