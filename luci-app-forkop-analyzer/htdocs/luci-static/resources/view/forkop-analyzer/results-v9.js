'use strict';
'require view';
'require forkop-analyzer.flags-v1 as flags';
'require rpc';
'require dom';
'require ui';
'require forkop-analyzer.site-results-v3 as siteResults';
'require forkop-analyzer.ui-v2 as presentation';

// Версия пути обновляет модуль страницы в кэше LuCI при изменении интерфейса.

var callDeleteResult = rpc.declare({ object: 'forkop-analyzer', method: 'delete_result', params: [ 'job_id' ] });
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
		self.selectedJob = jobId;
		return callStatus(jobId).then(function(response) {
			if (!response || !response.success) { notifyFailure(response); return; }
			if (self.selectedJob !== jobId) return;
			var job = response.data;
			dom.content(self.detailTarget, [
				E('div', { 'class': 'forkop-analyzer-job' }, [
					E('div', { 'class': 'forkop-analyzer-job-heading' }, [
						E('div', { 'class': 'forkop-analyzer-actions' }, [ E('h3', {}, _('Результаты проверки')), presentation.jobBadge(job.status) ]),
						E('span', { 'class': 'forkop-analyzer-job-count' }, (job.profile || '') + ' · ' + formatBytes(job.traffic_bytes))
					]),
					E('div', { 'class': 'forkop-analyzer-job-meta' }, [ E('span', {}, formatDate(job.started_at)), E('span', { 'class': 'forkop-analyzer-job-id' }, job.job_id || '') ])
				]),
				job.profile === 'sites' ? siteResults.render(job) : presentation.resultsTable(job, self.nodes)
			]);
			self.detailTarget.hidden = false;
			self.detailTarget.scrollIntoView({ behavior: 'smooth', block: 'start' });
		});
	},


 deleteResult: function(jobId, button) {
  var self = this;
  button.disabled = true;
  return callDeleteResult(jobId).then(function(response) {
   if (!response || !response.success) { notifyFailure(response); return; }
   if (self.selectedJob === jobId) { self.detailTarget.hidden = true; dom.content(self.detailTarget, []); self.selectedJob = null; }
   return callResults().then(function(list) {
    if (!list || !list.success) { notifyFailure(list); return; }
    dom.content(self.historyTarget, self.historyGroups(list.data));
   });
  }).catch(function() { notifyFailure({ error: { message: _('Не удалось удалить проверку или обновить историю') } }); })
   .finally(function() { button.disabled = false; });
 },

 historyGroups: function(results) {
  var self = this;

		var profiles = [ 'quick', 'gaming', 'full', 'sites' ];
		results.forEach(function(item) { if (profiles.indexOf(item.profile) < 0) profiles.push(item.profile); });
		if (profiles.indexOf(self.activeProfile) < 0) self.activeProfile = 'quick';
  var names = { quick: 'Quick', gaming: 'Gaming', full: 'Full', sites: _('Доступность сайтов') };
  var tabs = [], panels = [];
  function activate(profile, focus) {
   self.activeProfile = profile;
   self.selectedJob = null;
   self.detailTarget.hidden = true;
   dom.content(self.detailTarget, []);
   tabs.forEach(function(tab, i) {
    var selected = profiles[i] === profile;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    panels[i].hidden = !selected;
    if (selected && focus) tab.focus();
   });
  }
  profiles.forEach(function(profile, index) {
   var selected = profile === self.activeProfile;
   tabs.push(E('button', { type: 'button', role: 'tab', id: 'history-tab-' + index,
    'aria-controls': 'history-panel-' + index, 'aria-selected': String(selected), tabindex: selected ? 0 : -1,
    click: function() { activate(profile, false); },
    keydown: function(event) {
     var next = event.key === 'ArrowRight' ? (index + 1) % profiles.length : event.key === 'ArrowLeft' ? (index + profiles.length - 1) % profiles.length : event.key === 'Home' ? 0 : event.key === 'End' ? profiles.length - 1 : -1;
     if (next >= 0) { event.preventDefault(); activate(profiles[next], true); }
    }
   }, names[profile] || profile || _('Другие')));

		var entries = results.filter(function(item) { return item.profile === profile; });
		var rows = entries.map(function(item) {
			return E('li', { 'class': 'forkop-analyzer-history-row', 'data-job-id': item.job_id }, [
				E('div', { 'class': 'forkop-analyzer-history-name' }, [
					E('div', { 'class': 'forkop-analyzer-actions' }, [ E('strong', {}, item.profile || '—'), presentation.jobBadge(item.status) ]),
					E('span', { title: item.job_id }, formatDate(item.started_at))
				]),
				E('div', { 'class': 'forkop-analyzer-history-best' }, [ E('small', {}, item.profile === 'sites' ? _('Доступность сайтов') : _('Лучший результат')),
					E('strong', {}, item.best ? presentation.nodeDisplayName(item.best, self.nodes) : '—'),
					E('span', {}, item.profile === 'sites' ? _('HTTPS-ответы по каждому сайту') : item.best ? 'Score ' + item.best.score : _('Нет измерений'))
				]),
				E('div', { 'class': 'forkop-analyzer-history-volume' }, [ E('strong', {}, (item.completed || 0) + ' / ' + (item.total || 0) + ' ' + _('серверов')), E('span', {}, formatBytes(item.traffic_bytes)) ]),
				E('div', { 'class': 'forkop-analyzer-history-actions' }, [
					item.status === 'cancelled' ? E('button', { 'class': 'btn cbi-button cbi-button-negative', click: function(event) { return self.deleteResult(item.job_id, event.currentTarget); } }, _('Удалить отменённую')) : '',
					E('button', { 'class': 'btn cbi-button cbi-button-action', 'aria-controls': 'forkop-analyzer-history-detail', click: function() { self.showDetails(item.job_id); } }, _('Открыть')),
					E('div', { 'class': 'forkop-analyzer-actions' }, [
						E('button', { 'class': 'btn', 'aria-label': _('Скачать JSON') + ': ' + item.job_id, click: function() { self.downloadResult('json', item.job_id); } }, 'JSON'),
						E('button', { 'class': 'btn', 'aria-label': _('Скачать CSV') + ': ' + item.job_id, click: function() { self.downloadResult('csv', item.job_id); } }, 'CSV')
					])
				])
			]);
		});
  panels.push(E('section', { 'class': 'forkop-analyzer-panel forkop-analyzer-history', 'data-profile': profile, role: 'tabpanel', id: 'history-panel-' + index, 'aria-labelledby': 'history-tab-' + index, tabindex: 0, hidden: selected ? null : true }, [
   E('div', { 'class': 'forkop-analyzer-section-heading' }, [E('h3', {}, names[profile] || profile || _('Другие')), E('span', {}, String(entries.length))]),
   rows.length ? E('ul', { 'class': 'forkop-analyzer-history-list' }, rows) : E('div', { 'class': 'forkop-analyzer-empty' }, _('Проверок этого типа пока нет'))
  ]));
  });
  return [E('div', { 'class': 'forkop-analyzer-history-tabs', role: 'tablist', 'aria-label': _('Тип проверки') }, tabs)].concat(panels);

 },

	render: function(data) {
		var self = this;
		var response = data[0];
		var results = response && response.success ? response.data : [];
		var nodesResponse = data[1];
		this.nodes = nodesResponse && nodesResponse.success ? nodesResponse.data : [];
		this.detailTarget = E('section', { 'class': 'forkop-analyzer-panel forkop-analyzer-result-panel', id: 'forkop-analyzer-history-detail', 'aria-label': _('Результаты выбранной проверки'), hidden: true });
		this.historyTarget = E('div', { 'class': 'forkop-analyzer-history-groups' }, this.historyGroups(results));
		return flags.decorate(E('div', { 'class': 'cbi-map forkop-analyzer-app', 'data-theme': presentation.theme() }, [
			presentation.stylesheet(),
			E('link', { rel: 'stylesheet', href: L.resource('view/forkop-analyzer/history-v2.css') }),
			E('link', { rel: 'stylesheet', href: L.resource('view/forkop-analyzer/node-picker-v3.css') }),
			presentation.heading(_('История проверок'), _('Сравнивайте сохранённые измерения и выгружайте результаты в JSON или CSV.')),
			this.historyTarget,
			this.detailTarget
		]));
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
