'use strict';
'require baseclass';

function theme() {
	var rgb = getComputedStyle(document.body).color.match(/[0-9.]+/g) || [ 0, 0, 0 ];
	return Number(rgb[0]) * .2126 + Number(rgb[1]) * .7152 + Number(rgb[2]) * .0722 > 150 ? 'dark' : 'light';
}

function stylesheet() {
	return E('link', { rel: 'stylesheet', href: L.resource('view/forkop-analyzer/forkop-analyzer-v3.css') });
}

function heading(title, description) {
	return E('header', { 'class': 'forkop-analyzer-heading' }, [ E('h2', {}, title), E('p', {}, description) ]);
}

function nodeDisplayName(item, nodes) {
	var tag = item && item.tag ? String(item.tag) : '';
	if (item && item.display_name) return String(item.display_name);
	for (var i = 0; i < (nodes || []).length; i++)
		if (String(nodes[i].tag || '') === tag) return String(nodes[i].display_name || tag);
	return tag || '—';
}

function badge(status, text) {
	return E('span', { 'class': 'forkop-analyzer-status ' + status }, text);
}

function jobBadge(status) {
	var names = { idle: _('Ожидание'), queued: _('В очереди'), running: _('Выполняется'), completed: _('Завершено'), failed: _('Ошибка'), cancelled: _('Отменено'), cancelling: _('Остановка') };
	var tone = status === 'completed' ? 'ok' : status === 'running' || status === 'queued' || status === 'cancelling' ? 'warn' : status === 'failed' ? 'error' : '';
	return badge(tone, names[status] || status || _('Ожидание'));
}

function number(value, suffix) {
	if (value == null || value === '' || !isFinite(Number(value))) return '—';
	return Number(value).toFixed(1) + (suffix || '');
}

function lossMetric(item) {
	if (item.loss_pct != null) return number(item.loss_pct, '%');
	return item.success_pct == null ? '—' : number(100 - Number(item.success_pct), '%');
}

function resultsTable(job, nodes, onSelect) {
	var full = job.profile === 'full';
	var headers = [ _('Сервер'), _('Score'), _('Задержка'), _('Джиттер'), _('Потери') ];
	if (full) headers.push(_('Скачивание'));
	if (onSelect) headers.push(_('Действие'));
	var sorted = (job.results || []).slice().sort(function(a, b) { return Number(b.score || 0) - Number(a.score || 0); });
	function cell(label, value, detail, className) {
		return E('td', { 'data-label': label, 'class': className || '' }, [ E('strong', {}, value), detail ? E('small', {}, detail) : '' ]);
	}
	var rows = sorted.map(function(item) {
		var displayName = nodeDisplayName(item, nodes);
		var cells = [
			E('td', { 'class': 'forkop-analyzer-node', 'data-label': _('Сервер'), title: displayName !== item.tag ? item.tag : null }, [
				E('strong', {}, displayName),
				E('small', {}, item.type || '—'),
				item.error ? E('span', { 'class': 'forkop-analyzer-error-text' }, item.error) : ''
			]),
			cell(_('Score'), String(item.score || 0), '/ 100', 'forkop-analyzer-score-cell'),
			cell(_('Задержка'), number(item.latency_ms, ' мс'), 'P95 ' + number(item.latency_p95_ms, ' мс')),
			cell(_('Джиттер'), number(item.jitter_ms, ' мс'), _('Скачки') + ': ' + (item.latency_spikes == null ? '—' : String(item.latency_spikes))),
			cell(_('Потери'), lossMetric(item), _('Успех') + ': ' + number(item.success_pct, '%'), Number(item.loss_pct || 0) > 0 ? 'is-warning' : '')
		];
		if (full) cells.push(cell(_('Скачивание'), number(item.download_mbps, ' Мбит/с')));
		if (onSelect) cells.push(E('td', { 'class': 'forkop-analyzer-row-action', 'data-label': _('Действие') },
			E('button', { 'class': 'btn cbi-button cbi-button-action', 'aria-label': _('Выбрать сервер') + ': ' + displayName, click: function() { onSelect(item.tag); } }, _('Выбрать'))));
		return E('tr', { 'class': item.error ? 'has-error' : '' }, cells);
	});
	if (!rows.length) return E('div', { 'class': 'forkop-analyzer-empty' }, [ E('strong', {}, _('Результатов пока нет')), E('p', {}, _('Здесь появятся измерения по мере завершения проверки серверов.')) ]);
	return E('div', { 'class': 'forkop-analyzer-table-wrap' }, E('table', { 'class': 'table forkop-analyzer-results-table', role: 'table' }, [
		E('caption', { 'class': 'forkop-monitor-sr' }, _('Результаты проверки VPN-серверов, по убыванию Score. Скорость скачивания измеряется только в профиле Full.')),
		E('thead', {}, E('tr', {}, headers.map(function(label) {
			return E('th', { scope: 'col', title: label === _('Потери') ? _('Потери latency-запросов через outbound; не ICMP/UDP packet loss') : null }, label);
		}))),
		E('tbody', {}, rows)
	]));
}

return baseclass.extend({ theme: theme, stylesheet: stylesheet, heading: heading, nodeDisplayName: nodeDisplayName, badge: badge, jobBadge: jobBadge, resultsTable: resultsTable });
