'use strict';
'require view';
'require rpc';
'require dom';
'require ui';

var callResults = rpc.declare({ object: 'forkop-analyzer', method: 'results' });
var callStatus = rpc.declare({ object: 'forkop-analyzer', method: 'status', params: [ 'job_id' ] });
var callExport = rpc.declare({ object: 'forkop-analyzer', method: 'export', params: [ 'format', 'job_id' ] });

function notifyFailure(response) {
	var message = response && response.error ? response.error.message : _('Не удалось получить результаты');
	ui.addNotification(null, E('p', {}, message), 'danger');
}

function formatDate(timestamp) {
	return timestamp ? new Date(Number(timestamp) * 1000).toLocaleString() : '-';
}

function formatBytes(value) {
	var bytes = Number(value || 0);
	if (bytes < 1024)
		return bytes + ' B';
	if (bytes < 1024 * 1024)
		return (bytes / 1024).toFixed(1) + ' KiB';
	return (bytes / 1024 / 1024).toFixed(1) + ' MiB';
}

function downloadMetric(profile, value) {
	return profile === 'full'
		? Number(value || 0).toFixed(2)
		: E('span', { 'title': _('Скорость скачивания измеряется только в профиле Full') }, '—');
}

return view.extend({
	load: function() {
		return callResults();
	},

	downloadResult: function(format, jobId) {
		return callExport(format, jobId).then(function(response) {
			if (!response || !response.success) {
				notifyFailure(response);
				return;
			}
			var data = response.data;
			var blob = new Blob([ data.content ], {
				type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8'
			});
			var url = URL.createObjectURL(blob);
			var anchor = E('a', { 'href': url, 'download': data.filename });
			document.body.appendChild(anchor);
			anchor.click();
			anchor.remove();
			URL.revokeObjectURL(url);
		});
	},

	showDetails: function(jobId) {
		var target = this.detailTarget;
		return callStatus(jobId).then(function(response) {
			if (!response || !response.success) {
				notifyFailure(response);
				return;
			}
			var job = response.data;
			var rows = (job.results || []).map(function(item) {
				return E('tr', {}, [
					E('td', {}, item.tag),
					E('td', {}, Number(item.latency_ms || 0).toFixed(1)),
					E('td', {}, Number(item.jitter_ms || 0).toFixed(1)),
					E('td', {}, Number(item.success_pct || 0).toFixed(1)),
					E('td', {}, downloadMetric(job.profile, item.download_mbps)),
					E('td', {}, String(item.score || 0)),
					E('td', {}, item.error || '-')
				]);
			});
			dom.content(target, [
				E('h3', {}, job.job_id),
				E('p', {}, '%s · %s · %s'.format(job.profile, job.status, formatBytes(job.traffic_bytes))),
				E('div', { 'class': 'forkop-analyzer-table-wrap' }, E('table', { 'class': 'table' }, [
					E('tr', { 'class': 'tr table-titles' }, [
						E('th', {}, _('Узел')),
						E('th', {}, _('Задержка, ms')),
						E('th', {}, _('Джиттер, ms')),
						E('th', {}, _('Успех, %')),
						E('th', {}, _('Скачивание, Mbit/s')),
						E('th', {}, _('Score')),
						E('th', {}, _('Ошибка'))
					])
				].concat(rows)))
			]);
		});
	},

	render: function(response) {
		var self = this;
		var results = response && response.success ? response.data : [];
		this.detailTarget = E('div', { 'class': 'cbi-section' });
		var rows = results.map(function(item) {
			var best = item.best ? '%s (%s)'.format(item.best.tag, item.best.score) : '-';
			return E('tr', {}, [
				E('td', {}, item.job_id),
				E('td', {}, item.profile),
				E('td', {}, item.status),
				E('td', {}, formatDate(item.started_at)),
				E('td', {}, '%s / %s'.format(item.completed, item.total)),
				E('td', {}, best),
				E('td', {}, formatBytes(item.traffic_bytes)),
				E('td', { 'class': 'forkop-analyzer-actions' }, [
					E('button', { 'class': 'btn', 'click': function() { self.showDetails(item.job_id); } }, _('Открыть')),
					E('button', { 'class': 'btn', 'click': function() { self.downloadResult('json', item.job_id); } }, 'JSON'),
					E('button', { 'class': 'btn', 'click': function() { self.downloadResult('csv', item.job_id); } }, 'CSV')
				])
			]);
		});

		if (!rows.length)
			rows.push(E('tr', {}, E('td', { 'colspan': '8' }, _('Сохранённых результатов нет'))));

		return E('div', { 'class': 'cbi-map' }, [
			E('link', { 'rel': 'stylesheet', 'href': L.resource('view/forkop-analyzer/forkop-analyzer.css') }),
			E('h2', {}, _('Результаты Forkop Analyzer')),
			E('div', { 'class': 'forkop-analyzer-table-wrap' }, E('table', { 'class': 'table' }, [
				E('tr', { 'class': 'tr table-titles' }, [
					E('th', {}, _('Job ID')),
					E('th', {}, _('Профиль')),
					E('th', {}, _('Статус')),
					E('th', {}, _('Запуск')),
					E('th', {}, _('Прогресс')),
					E('th', {}, _('Лучший узел')),
					E('th', {}, _('Трафик')),
					E('th', {}, '')
				])
			].concat(rows))),
			this.detailTarget
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
