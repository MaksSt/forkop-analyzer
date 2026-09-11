'use strict';
'require view';
'require rpc';
'require dom';
'require ui';
'require forkop-analyzer.ui-v1 as presentation';

// Версия пути обновляет модуль страницы в кэше LuCI при изменении интерфейса.

var callResults = rpc.declare({ object: 'forkop-analyzer', method: 'results' });
var callStatus = rpc.declare({ object: 'forkop-analyzer', method: 'status', params: [ 'job_id' ] });
var callExport = rpc.declare({ object: 'forkop-analyzer', method: 'export', params: [ 'format', 'job_id' ] });
var callNodes = rpc.declare({ object: 'forkop-analyzer', method: 'nodes', params: [ 'selector' ] });

function notifyFailure(response) {
	var message = response && response.error ? response.error.message : _('Не удалось получить результаты');
	ui.addNotification(null, E('p', {}, message), 'danger');
}

function formatDate(timestamp) {
	return timestamp ? new Date(Number(timestamp) * 1000).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '-';
}

function formatBytes(value) {
	var bytes = Number(value || 0);
	if (bytes < 1024)
		return bytes + ' B';
	if (bytes < 1024 * 1024)
		return (bytes / 1024).toFixed(1) + ' KiB';
	return (bytes / 1024 / 1024).toFixed(1) + ' MiB';
}

return view.extend({
	load: function() {
		return Promise.all([ callResults(), callNodes('') ]);
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
		var self = this;
		return callStatus(jobId).then(function(response) {
			if (!response || !response.success) { notifyFailure(response); return; }
			var job = response.data;
			dom.content(self.detailTarget, [
				E('div', { 'class': 'forkop-analyzer-job' }, [
					E('div', { 'class': 'forkop-analyzer-job-heading' }, [
						E('div', { 'class': 'forkop-analyzer-actions' }, [ E('h3', {}, _('Результаты проверки')), presentation.jobBadge(job.status) ]),
						E('span', { 'class': 'forkop-analyzer-job-count' }, (job.profile || '') + ' · ' + formatBytes(job.traffic_bytes))
					]),
					E('div', { 'class': 'forkop-analyzer-job-meta' }, [ E('span', {}, formatDate(job.started_at)), E('span', { 'class': 'forkop-analyzer-job-id' }, job.job_id || '') ])
				]),
				presentation.resultsTable(job, self.nodes)
			]);
			self.detailTarget.hidden = false;
			self.detailTarget.scrollIntoView({ behavior: 'smooth', block: 'start' });
		});
	},

	render: function(data) {
		var self = this;
		var response = data[0];
		var results = response && response.success ? response.data : [];
		var nodesResponse = data[1];
		this.nodes = nodesResponse && nodesResponse.success ? nodesResponse.data : [];
		this.detailTarget = E('section', { 'class': 'forkop-analyzer-panel forkop-analyzer-result-panel', id: 'forkop-analyzer-history-detail', 'aria-label': _('Результаты выбранной проверки'), hidden: true });
		var rows = results.map(function(item) {
			return E('li', { 'class': 'forkop-analyzer-history-row' }, [
				E('div', { 'class': 'forkop-analyzer-history-name' }, [
					E('div', { 'class': 'forkop-analyzer-actions' }, [ E('strong', {}, item.profile || '—'), presentation.jobBadge(item.status) ]),
					E('span', { title: item.job_id }, formatDate(item.started_at))
				]),
				E('div', { 'class': 'forkop-analyzer-history-best' }, [ E('small', {}, _('Лучший результат')),
					E('strong', {}, item.best ? presentation.nodeDisplayName(item.best, self.nodes) : '—'),
					E('span', {}, item.best ? 'Score ' + item.best.score : _('Нет измерений'))
				]),
				E('div', { 'class': 'forkop-analyzer-history-volume' }, [ E('strong', {}, (item.completed || 0) + ' / ' + (item.total || 0) + ' ' + _('серверов')), E('span', {}, formatBytes(item.traffic_bytes)) ]),
				E('div', { 'class': 'forkop-analyzer-history-actions' }, [
					E('button', { 'class': 'btn cbi-button cbi-button-action', 'aria-controls': 'forkop-analyzer-history-detail', click: function() { self.showDetails(item.job_id); } }, _('Открыть')),
					E('div', { 'class': 'forkop-analyzer-actions' }, [
						E('button', { 'class': 'btn', 'aria-label': _('Скачать JSON') + ': ' + item.job_id, click: function() { self.downloadResult('json', item.job_id); } }, 'JSON'),
						E('button', { 'class': 'btn', 'aria-label': _('Скачать CSV') + ': ' + item.job_id, click: function() { self.downloadResult('csv', item.job_id); } }, 'CSV')
					])
				])
			]);
		});
		return E('div', { 'class': 'cbi-map forkop-analyzer-app', 'data-theme': presentation.theme() }, [
			presentation.stylesheet(),
			presentation.heading(_('История проверок'), _('Сравнивайте сохранённые измерения и выгружайте результаты в JSON или CSV.')),
			E('section', { 'class': 'forkop-analyzer-panel forkop-analyzer-history' }, [
				E('div', { 'class': 'forkop-analyzer-section-heading' }, [ E('h3', {}, _('Сохранённые проверки')), E('span', { 'class': 'forkop-analyzer-muted' }, String(results.length)) ]),
				rows.length ? E('ul', { 'class': 'forkop-analyzer-history-list' }, rows) : E('div', { 'class': 'forkop-analyzer-empty' }, [ E('strong', {}, _('История пока пуста')), E('p', {}, _('Завершённые проверки появятся здесь автоматически.')) ])
			]),
			this.detailTarget
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
