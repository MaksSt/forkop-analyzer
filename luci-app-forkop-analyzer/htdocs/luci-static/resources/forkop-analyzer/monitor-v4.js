'use strict';
'require baseclass';
'require dom';

var COLORS = [ '#008b77', '#ae54c9', '#387bd0', '#b56808', '#d04b6d', '#748700', '#0087a3', '#896bd1' ];

var serverColors = Object.create(null);
var usedColors = Object.create(null);

function color(tag) {
	if (serverColors[tag]) return serverColors[tag];
	var hash = 0;
	for (var i = 0; i < tag.length; i++)
		hash = (hash * 31 + tag.charCodeAt(i)) >>> 0;
	var chosen = '';
	for (var n = 0; n < COLORS.length; n++) {
		var candidate = COLORS[(hash + n) % COLORS.length];
		if (!usedColors[candidate]) { chosen = candidate; break; }
	}
	if (!chosen) chosen = 'hsl(' + ((hash * 137.508) % 360).toFixed(2) + ',65%,45%)';
	usedColors[chosen] = true;
	serverColors[tag] = chosen;
	return chosen;
}

function duration(value) {
	value = Math.max(0, Math.round(value));
	if (value < 60) return value + ' с';
	if (value < 3600) return Math.floor(value / 60) + ' мин ' + (value % 60) + ' с';
	return Math.floor(value / 3600) + ' ч ' + Math.floor(value % 3600 / 60) + ' мин';
}

function timeLabel(value) {
	return new Date(value * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

// Имя фиксируется в каждом наблюдении; runtime tag может быть переиспользован.
function serverKey(sample) {
	return sample && sample.tag ? JSON.stringify([ sample.selector || '', sample.tag, sample.name || sample.tag ]) : '';
}

function connected(a, b) {
	return a && b && a.selector === b.selector && b.at > a.at
		&& b.at - a.at <= Math.max(a.interval || 15, b.interval || 15) * 2 + 5;
}

function decode(data) {
	if (data.format !== 'compact-v1') return data;
	return Object.assign({}, data, { format: null, samples: (data.samples || []).map(function(point) {
		var route = (data.routes || [])[point[1]] || {};
		return { at: point[0], selector: route.selector || '', tag: route.tag || '', name: route.name || '', state: point[2], latency_ms: point[3], interval: point[4], reason: point[5] };
	}) });
}

function buildModel(data, selector, hours, now, range) {
	data = decode(data);
	var all = (data.samples || []).filter(function(s) { return s && Number.isFinite(s.at) && s.at <= now; });
	var zoomed = range && Number.isFinite(range.from) && Number.isFinite(range.to) && range.from < Math.min(now, range.to);
	var to = zoomed ? Math.min(now, range.to) : now;
	var from = zoomed ? range.from : now - hours * 3600;
	var rows = Object.create(null);
	var points = [], segments = [], events = [];
	var total = { losses: 0, switches: 0, up: 0, down: 0, unknown: 0, failed: 0, checks: 0 };
	var activeSegment = null;
	var last = null;
	all.forEach(function(s, i) {
		var previous = all[i - 1];
		var next = all[i + 1];
		if (s.selector !== selector) { activeSegment = null; return; }
		last = s;
		if (s.at > to) { activeSegment = null; return; }
		var limit = (s.interval || data.interval || 15) * 2 + 5;
		var end = Math.min(to, next ? next.at : to, s.at + limit);
		if (end < from) { activeSegment = null; return; }
		var start = Math.max(from, s.at);
		var span = Math.max(0, end - start);
		var state = s.state === 'up' && Number(s.latency_ms) > 0 ? 'up' : (s.state === 'down' ? 'down' : 'unknown');
		var key = serverKey(s);
		var sameServer = previous && serverKey(previous) === key;
		var row = null;
		if (s.tag) {
			row = rows[key] || (rows[key] = { key: key, tag: s.tag, name: s.name || s.tag, up: 0, down: 0, losses: 0, switches: 0, checks: 0, failed: 0, latency: 0, successes: 0 });
		}
		total[state] += span;
		if (row && state !== 'unknown') row[state] += span;
		var inWindow = s.at >= from;
		var continuous = connected(previous, s);
		if (inWindow && state !== 'unknown') {
			total.checks++;
			if (row) row.checks++;
			if (state === 'down') { total.failed++; if (row) row.failed++; }
			else if (row) { row.latency += Number(s.latency_ms); row.successes++; }
		}
		if (inWindow && state === 'down' && !(continuous && sameServer && previous.state === 'down')) {
			total.losses++;
			if (row) row.losses++;
			events.push({ at: s.at, text: _('Нет связи') + ': ' + (s.name || s.tag) });
		}
		if (inWindow && continuous && previous.tag && s.tag && !sameServer) {
			total.switches++;
			if (row) row.switches++;
			events.push({ at: s.at, text: (previous.name || previous.tag) + ' → ' + (s.name || s.tag) });
		}
		if (inWindow && continuous && previous.state === 'down' && state === 'up')
			events.push({ at: s.at, text: _('Связь восстановлена') + ': ' + (s.name || s.tag) });
		var point = { at: start, end: end, sample: s, state: state };
		points.push(point);
		if (state === 'up') {
			if (!activeSegment || !continuous || previous.state !== 'up' || !sameServer) {
				activeSegment = { key: key, tag: s.tag, name: s.name || s.tag, points: [] };
				segments.push(activeSegment);
			}
			activeSegment.points.push({ at: start, value: Number(s.latency_ms) });
			activeSegment.end = end;
		}
		else activeSegment = null;
	});
	var observedStart = zoomed ? from : (points.length ? points[0].at : to);
	total.unknown = Math.max(total.unknown, to - observedStart - total.up - total.down);
	return { from: from, to: to, zoomed: !!zoomed, points: points, segments: segments, rows: Object.keys(rows).map(function(tag) { return rows[tag]; }), total: total, events: events.reverse(), last: last };
}

function svgElement(tag, attrs) {
	var node = document.createElementNS('http://www.w3.org/2000/svg', tag);
	Object.keys(attrs || {}).forEach(function(key) { node.setAttribute(key, attrs[key]); });
	return node;
}

function stateLabel(sample) {
	if (sample.state === 'up') return Number(sample.latency_ms).toFixed(0) + ' ms';
	if (sample.state === 'down') return _('Нет связи: проверка не прошла');
	if (sample.reason === 'changed_during_probe') return _('Сервер сменился во время проверки');
	if (sample.reason === 'api_unavailable') return _('Нет данных от Forkop API');
	if (sample.reason === 'selection_unavailable') return _('Активный сервер не определён');
	return _('Результат проверки недоступен');
}

function renderChart(model, changeRange) {
	var width = Math.max(280, Math.min(1100, window.innerWidth - 100)), height = 238, left = 44, right = 16, top = 18, bottom = 32;
	var from = !model.zoomed && model.points.length ? Math.max(model.from, Math.min(model.to - 60, model.points[0].at)) : model.from;
	var max = 100;
	model.segments.forEach(function(segment) { segment.points.forEach(function(p) { max = Math.max(max, p.value); }); });
	max = Math.ceil(max * 1.15 / 50) * 50;
	var x = function(at) { return left + (at - from) / (model.to - from) * (width - left - right); };
	var y = function(value) { return height - bottom - value / max * (height - top - bottom); };
	var svg = svgElement('svg', { viewBox: '0 0 ' + width + ' ' + height, 'class': 'forkop-monitor-chart', tabindex: '0', role: 'img', 'data-from': from, 'data-to': model.to,
		'aria-label': _('Задержка активного VPN-сервера. Стрелки влево и вправо — измерения; Home и End — начало и конец. Shift со стрелками выделяет диапазон, Enter приближает, Escape отменяет выделение. ЛКМ с протягиванием — приблизить, двойной щелчок — сбросить. Цвет обозначает сервер, разрыв — отсутствие успешной проверки.') });
	for (var i = 0; i <= 4; i++) {
		var value = max * i / 4;
		svg.appendChild(svgElement('line', { x1: left, x2: width - right, y1: y(value), y2: y(value), 'class': 'forkop-monitor-gridline' }));
		var label = svgElement('text', { x: left - 8, y: y(value) + 4, 'text-anchor': 'end' });
		label.textContent = Math.round(value);
		svg.appendChild(label);
	}
	var unit = svgElement('text', { x: left, y: 12 }); unit.textContent = 'ms'; svg.appendChild(unit);
	var ticks = width < 500 && model.to - from < 600 ? 2 : 4;
	for (var tick = 0; tick <= ticks; tick++) {
		var at = from + (model.to - from) * tick / ticks;
		var text = svgElement('text', { x: x(at), y: height - 12, 'text-anchor': tick === 0 ? 'start' : (tick === ticks ? 'end' : 'middle') });
		text.textContent = new Date(at * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: model.to - from < 600 ? '2-digit' : undefined, hour12: false });
		svg.appendChild(text);
	}
	// Объединяем соседние неудачные пробы: один полупрозрачный участок на эпизод.
	var bands = [];
	model.points.forEach(function(point) {
		if (point.state !== 'down') return;
		var last = bands[bands.length - 1];
		if (last && last.end === point.at) last.end = point.end;
		else bands.push({ at: point.at, end: point.end });
	});
	bands.forEach(function(band) {
		svg.appendChild(svgElement('rect', { x: x(band.at), y: top, width: Math.max(1, x(band.end) - x(band.at)), height: height - bottom - top, 'class': 'forkop-monitor-outage' }));
	});
	model.segments.forEach(function(segment) {
		var commands = segment.points.map(function(p, index) { return (index ? 'L' : 'M') + x(p.at).toFixed(2) + ',' + y(p.value).toFixed(2); });
		var last = segment.points[segment.points.length - 1];
		commands.push('L' + x(segment.end).toFixed(2) + ',' + y(last.value).toFixed(2));
		var line = svgElement('path', { d: commands.join(' '), fill: 'none', stroke: color(segment.key), 'stroke-width': '2.5', 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke', 'data-server': segment.tag, 'data-server-key': segment.key });
		svg.appendChild(line);
		if (segment.points.length === 1)
			svg.appendChild(svgElement('circle', { cx: x(last.at), cy: y(last.value), r: '3', fill: color(segment.key) }));
	});
	var selection = svgElement('rect', { y: top, height: height - bottom - top, 'class': 'forkop-monitor-selection', visibility: 'hidden' });
	svg.appendChild(selection);
	var cursor = svgElement('line', { y1: top, y2: height - bottom, 'class': 'forkop-monitor-cursor', visibility: 'hidden' });
	var marker = svgElement('circle', { r: '4.5', 'class': 'forkop-monitor-point', visibility: 'hidden' });
	svg.appendChild(cursor);
	svg.appendChild(marker);
	var tooltip = E('div', { 'class': 'forkop-monitor-tooltip', role: 'tooltip', hidden: true });
	var announcement = E('span', { 'class': 'forkop-monitor-sr', 'aria-live': 'polite', 'aria-atomic': 'true' });
	var selectionLabel = E('div', { 'class': 'forkop-monitor-selection-label', hidden: true });
	var plot = E('div', { 'class': 'forkop-monitor-plot' }, [ svg, tooltip, selectionLabel, announcement ]);
	var currentIndex = Math.max(0, model.points.length - 1);
	var interaction = '';
	var drag = null, keyboardStart = null, keyboardEnd = null;

	function hide() {
		tooltip.hidden = true;
		cursor.setAttribute('visibility', 'hidden');
		marker.setAttribute('visibility', 'hidden');
		delete plot.dataset.inspecting;
	}

	function positionTooltip(clientX, clientY) {
		var bounds = plot.getBoundingClientRect();
		var tip = tooltip.getBoundingClientRect();
		var px = clientX - bounds.left, py = clientY - bounds.top;
		var tipX = px + 14;
		if (tipX + tip.width > bounds.width - 8) tipX = px - tip.width - 14;
		var tipY = py - tip.height - 14;
		if (tipY < 8) tipY = py + 14;
		tooltip.style.left = Math.max(8, Math.min(bounds.width - tip.width - 8, tipX)) + 'px';
		tooltip.style.top = Math.max(8, Math.min(bounds.height - tip.height - 8, tipY)) + 'px';
	}

	function showPoint(index, at, event) {
		var point = model.points[index];
		if (!point) { hide(); return; }
		currentIndex = index;
		var inGap = at != null && (at < point.at || at > point.end);
		var sample = point.sample;
		var position = inGap ? at : point.at;
		var serverColor = inGap || !sample.tag ? 'var(--fm-muted)' : color(serverKey(sample));
		cursor.setAttribute('x1', x(position));
		cursor.setAttribute('x2', x(position));
		cursor.setAttribute('visibility', 'visible');
		if (!inGap && point.state === 'up') {
			marker.setAttribute('cx', x(position)); marker.setAttribute('cy', y(sample.latency_ms));
			marker.setAttribute('fill', serverColor); marker.setAttribute('visibility', 'visible');
		}
		else marker.setAttribute('visibility', 'hidden');
		var label = inGap ? _('Нет наблюдений') : (sample.name || sample.tag || _('Сервер неизвестен'));
		dom.content(tooltip, [
			E('span', { 'class': 'forkop-monitor-tip-time' }, timeLabel(inGap ? at : sample.at)),
			E('div', { 'class': 'forkop-monitor-tip-server' }, [
				E('span', { 'class': 'forkop-monitor-swatch', style: 'background:' + serverColor, 'aria-hidden': 'true' }), label
			]),
			!inGap && point.state === 'up'
				? E('div', { 'class': 'forkop-monitor-tip-value' }, [ E('strong', {}, String(Math.round(sample.latency_ms))), ' ', E('span', {}, _('мс')) ])
				: E('div', { 'class': 'forkop-monitor-tip-status' }, inGap ? _('Измерения отсутствуют') : stateLabel(sample))
		]);
		tooltip.hidden = false;
		tooltip.style.borderColor = serverColor;
		plot.dataset.inspecting = 'true';
		if (event) positionTooltip(event.clientX, event.clientY);
		else {
			var anchor = svg.createSVGPoint();
			anchor.x = x(position); anchor.y = point.state === 'up' ? y(sample.latency_ms) : (top + height - bottom) / 2;
			var screen = anchor.matrixTransform(svg.getScreenCTM());
			positionTooltip(screen.x, screen.y);
			dom.content(announcement, timeLabel(sample.at) + ' · ' + label + ' · ' + stateLabel(sample));
		}
	}

	function localPoint(event) {
		var screen = svg.createSVGPoint(); screen.x = event.clientX; screen.y = event.clientY;
		return screen.matrixTransform(svg.getScreenCTM().inverse());
	}
	function inside(point) {
		return point.x >= left && point.x <= width - right && point.y >= top && point.y <= height - bottom;
	}
	function atX(value) {
		return from + (Math.max(left, Math.min(width - right, value)) - left) / (width - left - right) * (model.to - from);
	}
	function showSelection(start, end) {
		hide();
		plot.dataset.inspecting = 'true';
		selection.setAttribute('x', x(Math.min(start, end)));
		selection.setAttribute('width', Math.abs(x(end) - x(start)));
		selection.setAttribute('visibility', 'visible');
		selectionLabel.hidden = false;
		dom.content(selectionLabel, timeLabel(Math.min(start, end)) + ' — ' + timeLabel(Math.max(start, end)));
	}
	function cancelSelection() {
		var pointerId = drag && drag.id;
		drag = null; keyboardStart = null; keyboardEnd = null;
		selection.setAttribute('visibility', 'hidden');
		selectionLabel.hidden = true;
		hide();
		if (pointerId != null && svg.hasPointerCapture(pointerId)) svg.releasePointerCapture(pointerId);
	}
	function zoom(start, end, keyboard) {
		cancelSelection();
		if (Math.abs(end - start) >= 1)
			changeRange({ from: Math.min(start, end), to: Math.max(start, end) }, keyboard);
	}
	function pointer(event) {
		interaction = 'pointer';
		var local = localPoint(event);
		if (drag) {
			if (event.pointerId !== drag.id) return;
			drag.end = atX(local.x);
			if (Math.abs(event.clientX - drag.clientX) >= 6) drag.moved = true;
			if (drag.moved) showSelection(drag.start, drag.end);
			return;
		}
		if (keyboardStart != null) return;
		if (!inside(local)) { hide(); return; }
		var at = atX(local.x), index = 0;
		for (var i = 0; i < model.points.length; i++) {
			if (model.points[i].at > at) break;
			index = i;
		}
		showPoint(index, at, event);
	}
	svg.addEventListener('pointerdown', function(event) {
		if (event.button !== 0 || event.pointerType !== 'mouse' || !inside(localPoint(event))) return;
		event.preventDefault();
		cancelSelection();
		svg.focus({ preventScroll: true });
		hide();
		var at = atX(localPoint(event).x);
		drag = { id: event.pointerId, start: at, end: at, clientX: event.clientX, moved: false };
		plot.dataset.inspecting = 'true';
		svg.setPointerCapture(event.pointerId);
	});
	svg.addEventListener('pointermove', pointer);
	svg.addEventListener('pointerup', function(event) {
		if (!drag || event.pointerId !== drag.id) return;
		var current = drag, end = atX(localPoint(event).x);
		if (current.moved && Math.abs(event.clientX - current.clientX) >= 6) zoom(current.start, end, false);
		else { cancelSelection(); pointer(event); }
	});
	svg.addEventListener('pointercancel', cancelSelection);
	svg.addEventListener('lostpointercapture', function() { if (drag) cancelSelection(); });
	svg.addEventListener('click', pointer);
	svg.addEventListener('dblclick', function(event) {
		if (event.button !== 0) return;
		event.preventDefault(); cancelSelection(); changeRange(null, false);
	});
	svg.addEventListener('pointerleave', function() { if (!drag && keyboardStart == null && interaction === 'pointer') hide(); });
	svg.addEventListener('blur', cancelSelection);
	svg.addEventListener('focus', function() { interaction = 'keyboard'; showPoint(currentIndex); });
	svg.addEventListener('keydown', function(event) {
		if (event.key === 'Escape') { event.preventDefault(); cancelSelection(); return; }
		if (event.key === 'Enter' && keyboardStart != null) {
			event.preventDefault(); zoom(keyboardStart, keyboardEnd, true); return;
		}
		if ([ 'ArrowLeft', 'ArrowRight', 'Home', 'End' ].indexOf(event.key) < 0 || !model.points.length) return;
		event.preventDefault(); interaction = 'keyboard';
		if (event.shiftKey && keyboardStart == null) keyboardStart = model.points[currentIndex].at;
		else if (!event.shiftKey) cancelSelection();
		if (event.key === 'Home') currentIndex = 0;
		else if (event.key === 'End') currentIndex = model.points.length - 1;
		else currentIndex += event.key === 'ArrowLeft' ? -1 : 1;
		currentIndex = Math.max(0, Math.min(model.points.length - 1, currentIndex));
		if (keyboardStart != null) {
			keyboardEnd = model.points[currentIndex].at;
			showSelection(keyboardStart, keyboardEnd);
			dom.content(announcement, selectionLabel.textContent + '. ' + _('Enter — приблизить, Escape — отменить'));
		}
		else showPoint(currentIndex);
	});
	return plot;
}

function renderStats(model, live) {
	var total = model.total;
	var cards = [
		[ _('Потери связи'), String(total.losses), _('эпизодов за период') ],
		[ _('Переключения'), String(total.switches), _('смен активного сервера') ],
		[ _('Недоступность'), duration(total.down), _('по результатам проверок') ],
		[ _('Без данных'), duration(total.unknown), _('пропуски наблюдений') ]
	].map(function(pair) { return E('div', { 'class': 'forkop-monitor-total' }, [ E('span', {}, pair[0]), E('strong', {}, pair[1]), E('small', {}, pair[2]) ]); });
	var sorted = model.rows.slice().sort(function(a, b) {
		var aCurrent = live && model.last && serverKey(model.last) === a.key;
		var bCurrent = live && model.last && serverKey(model.last) === b.key;
		return Number(bCurrent) - Number(aCurrent) || (b.up + b.down) - (a.up + a.down);
	});
	function metric(label, value, warning) {
		return E('div', { 'class': warning ? 'forkop-monitor-metric is-warning' : 'forkop-monitor-metric' }, [ E('dt', {}, label), E('dd', {}, value) ]);
	}
	var rows = sorted.map(function(row) {
		var current = live && model.last && serverKey(model.last) === row.key;
		var state = current ? model.last.state : '';
		var statusClass = state === 'up' ? 'is-up' : state === 'down' ? 'is-down' : '';
		var statusLabel = state === 'up' ? _('Активен') : state === 'down' ? _('Нет связи') : _('Нет данных');
		var uptime = row.up + row.down > 0 ? row.up / (row.up + row.down) * 100 : null;
		return E('li', { 'class': 'forkop-monitor-server' + (current ? ' is-current' : ''), style: '--server-color:' + color(row.key) }, [
			E('div', { 'class': 'forkop-monitor-server-name' }, [
				E('div', { 'class': 'forkop-monitor-server-title', title: row.tag }, [
					E('span', { 'class': 'forkop-monitor-swatch', style: 'background:' + color(row.key), 'aria-hidden': 'true' }), E('strong', {}, row.name)
				]),
				E('div', { 'class': 'forkop-monitor-server-meta' }, [
					current ? E('span', { 'class': 'forkop-monitor-badge ' + statusClass }, statusLabel) : E('span', {}, _('История')),
					E('span', {}, (row.checks - row.failed) + ' / ' + row.checks + ' ' + _('успешных проб'))
				])
			]),
			E('dl', { 'class': 'forkop-monitor-server-metrics' }, [
				metric(_('Ср. задержка'), row.successes ? Math.round(row.latency / row.successes) + ' мс' : '—'),
				metric(_('Потери связи'), String(row.losses), row.losses > 0),
				metric(_('Переходы сюда'), String(row.switches))
			]),
			E('div', { 'class': 'forkop-monitor-availability' }, [
				E('div', { 'class': 'forkop-monitor-availability-label' }, [ E('span', {}, _('Доступность')), E('strong', {}, uptime == null ? '—' : uptime.toFixed(1) + '%') ]),
				E('div', { 'class': 'forkop-monitor-availability-track', role: 'meter', 'aria-label': _('Доступность сервера') + ': ' + row.name, 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': uptime == null ? '0' : uptime.toFixed(1), 'aria-valuetext': uptime == null ? _('Недостаточно данных') : uptime.toFixed(1) + '%' }, E('span', { style: 'width:' + (uptime || 0).toFixed(2) + '%' })),
				E('div', { 'class': 'forkop-monitor-availability-detail' }, [ E('span', {}, duration(row.up) + ' ' + _('в сети')), E('span', {}, duration(row.down) + ' ' + _('без связи')) ])
			])
		]);
	});
	return E('div', { 'class': 'forkop-monitor-statistics' }, [
		E('div', { 'class': 'forkop-monitor-totals' }, cards),
		E('div', { 'class': 'forkop-monitor-list-heading' }, [ E('h4', {}, _('Серверы')), E('span', {}, _('За выбранный период') + ' · ' + rows.length) ]),
		rows.length ? E('ul', { 'class': 'forkop-monitor-server-list' }, rows) : E('p', { 'class': 'forkop-monitor-empty' }, _('Здесь появятся серверы и их статистика после первых проверок.')),
		E('p', { 'class': 'forkop-monitor-note' }, _('Несколько неудачных проб подряд — одна потеря связи. Доступность и длительность рассчитаны по наблюдениям, без пропусков данных.')),
		model.events.length ? E('details', { 'class': 'forkop-monitor-event-panel' }, [
			E('summary', {}, _('Последние события') + ' · ' + Math.min(30, model.events.length)),
			E('ol', { 'class': 'forkop-monitor-events' }, model.events.slice(0, 30).map(function(event) {
				return E('li', {}, [ E('time', {}, timeLabel(event.at)), E('span', {}, event.text) ]);
			}))
		]) : ''
	]);
}

function create(initial) {
	var data = decode(initial || {}), hours = 1, selected = '', range = null;
	var chartTarget = E('div', { 'class': 'forkop-monitor-content' });
	var groupInput = E('select', { 'class': 'cbi-input-select', 'aria-label': _('Группа мониторинга') });
	var rangeInput = E('select', { 'class': 'cbi-input-select', 'aria-label': _('Период графика') }, [
		E('option', { value: '1' }, _('1 час')), E('option', { value: '6' }, _('6 часов')), E('option', { value: '24' }, _('24 часа'))
	]);
	function changeRange(next, keyboard) {
		range = next;
		draw();
		if (keyboard) chartTarget.querySelector('.forkop-monitor-chart').focus({ preventScroll: true });
	}
	function draw() {
		var textColor = getComputedStyle(document.body).color.match(/[0-9.]+/g) || [ 0, 0, 0 ];
		node.dataset.theme = Number(textColor[0]) * .2126 + Number(textColor[1]) * .7152 + Number(textColor[2]) * .0722 > 150 ? 'dark' : 'light';
		var samples = data.samples || [];
		var groups = [];
		samples.forEach(function(s) { if (s.selector && groups.indexOf(s.selector) < 0) groups.push(s.selector); });
		var latest = samples[samples.length - 1];
		if (groups.indexOf(selected) < 0) { selected = latest ? latest.selector : ''; range = null; }
		if (groupInput.dataset.groups !== JSON.stringify(groups)) {
			dom.content(groupInput, groups.map(function(group) { return E('option', { value: group }, group); }));
			groupInput.dataset.groups = JSON.stringify(groups);
		}
		groupInput.value = selected;
		var now = Date.now() / 1000;
		var model = buildModel(data, selected, hours, now, range);
		var last = model.last;
		var stale = !last || now - last.at > (last.interval || data.interval || 15) * 2 + 5;
		var live = !stale && data.enabled !== false && !data.error;
		var statusClass = live && last.state === 'up' ? 'is-up' : live && last.state === 'down' ? 'is-down' : '';
		var message = data.error ? _('Не удалось обновить мониторинг. Показаны последние полученные данные.')
			: data.enabled === false ? _('Мониторинг отключён в настройках. Показана сохранённая история.')
			: stale ? _('Ожидание свежих измерений. Проверьте, запущен ли backend Forkop Analyzer.')
			: '';
		dom.content(chartTarget, [
			message ? E('p', { 'class': 'alert-message warning', role: 'status' }, message) : '',
			E('div', { 'class': 'forkop-monitor-current' }, [
				E('div', { 'class': 'forkop-monitor-current-server' }, [
					E('span', { 'class': 'forkop-monitor-badge ' + statusClass }, live ? _('Сейчас') : _('Последние данные')),
					E('strong', {}, last ? last.name || last.tag || _('Сервер неизвестен') : _('Ожидание первого измерения'))
				]),
				E('div', { 'class': 'forkop-monitor-current-latency' + (last && last.state !== 'up' ? ' is-status' : '') }, last ? [
					last.state === 'up' ? E('strong', {}, [ String(Math.round(last.latency_ms)), ' ', E('small', {}, _('мс')) ]) : E('strong', {}, stateLabel(last)),
					E('span', {}, _('Обновлено') + ' ' + timeLabel(last.at))
				] : [])
			]),
			model.zoomed ? E('div', { 'class': 'forkop-monitor-zoom' }, [
				E('span', {}, _('Выбранный диапазон') + ': ' + timeLabel(model.from) + ' — ' + timeLabel(model.to)),
				E('button', { 'class': 'btn cbi-button', type: 'button', click: function() { changeRange(null, true); } }, _('Сбросить масштаб'))
			]) : '',
			renderChart(model, changeRange),
			E('div', { 'class': 'forkop-monitor-legend' }, model.rows.map(function(row) {
				return E('span', { title: row.tag }, [ E('span', { 'class': 'forkop-monitor-swatch', style: 'background:' + color(row.key), 'aria-hidden': 'true' }), row.name ]);
			})),
			E('div', { 'class': 'forkop-monitor-chart-caption' }, [ E('span', {}, _('Наведение — подробности · ЛКМ и протянуть — приблизить · Двойной щелчок — сброс')), E('span', {}, _('Шаг') + ' ' + (data.interval || 15) + ' с') ]),
			renderStats(model, live)
		]);
	}
	groupInput.addEventListener('change', function() { selected = groupInput.value; range = null; draw(); });
	rangeInput.addEventListener('change', function() { hours = Number(rangeInput.value); range = null; draw(); });
	var node = E('section', { 'class': 'forkop-analyzer-card forkop-monitor', 'aria-label': _('Мониторинг VPN') }, [
		E('div', { 'class': 'forkop-monitor-heading' }, [ E('div', {}, [ E('h3', {}, _('Мониторинг VPN')), E('p', {}, _('Задержка и переключения активного сервера')) ]), E('div', { 'class': 'forkop-analyzer-actions' }, [ groupInput, rangeInput ]) ]),
		chartTarget
	]);
	draw();
	return { node: node, update: function(next) {
		data = decode(next || {});
		// Не сбрасываем клавиатурный фокус и открытый журнал при обновлении.
		if (!chartTarget.contains(document.activeElement) && !chartTarget.querySelector('details[open], .forkop-monitor-plot[data-inspecting="true"]')) draw();
	} };
}

return baseclass.extend({ create: create, buildModel: buildModel, color: color, decode: decode });
