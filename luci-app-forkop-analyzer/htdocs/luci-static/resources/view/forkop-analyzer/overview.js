'use strict';
'require view';
'require rpc';
'require poll';
'require dom';
'require ui';

var callCapabilities = rpc.declare({ object: 'forkop-analyzer', method: 'capabilities' });
var callNodes = rpc.declare({ object: 'forkop-analyzer', method: 'nodes', params: [ 'selector' ] });
var callSelectors = rpc.declare({ object: 'forkop-analyzer', method: 'selectors' });
var callStatus = rpc.declare({ object: 'forkop-analyzer', method: 'status', params: [ 'job_id' ] });
var callStart = rpc.declare({ object: 'forkop-analyzer', method: 'start', params: [ 'profile', 'selector' ] });
var callCancel = rpc.declare({ object: 'forkop-analyzer', method: 'cancel', params: [ 'job_id' ] });
var callSelectNode = rpc.declare({ object: 'forkop-analyzer', method: 'select_node', params: [ 'selector', 'outbound_tag' ] });

function dataOf(response, fallback) {
	return response && response.success ? response.data : fallback;
}

function notifyFailure(response) {
	var message = response && response.error && response.error.message
		? response.error.message
		: _('Операция Forkop Analyzer завершилась ошибкой');
	ui.addNotification(null, E('p', {}, message), 'danger');
}

function metric(value, suffix) {
	var number = Number(value);
	return isFinite(number) ? number.toFixed(number < 10 ? 2 : 1) + (suffix || '') : '-';
}

function downloadMetric(profile, value) {
	return profile === 'full'
		? metric(value, ' Mbit/s')
		: E('span', { 'title': _('Скорость скачивания измеряется только в профиле Full') }, '—');
}

function statusBadge(ok, yes, no) {
	return E('span', { 'class': 'forkop-analyzer-status ' + (ok ? 'ok' : 'error') }, ok ? yes : no);
}

function selectorOptions(selectors) {
	var options = [ E('option', { 'value': '' }, _('Все selector-группы')) ];

	selectors.forEach(function(selector) {
		options.push(E('option', { 'value': selector.tag }, '%s (%s)'.format(selector.tag, selector.type)));
	});

	return options;
}

function profileCard(profile, title, description, traffic, onStart) {
	return E('div', { 'class': 'forkop-analyzer-card' }, [
		E('h3', {}, title),
		E('p', {}, description),
		E('p', { 'class': 'forkop-analyzer-muted' }, traffic),
		E('button', {
			'class': 'btn cbi-button cbi-button-action',
			'click': function() { onStart(profile); }
		}, _('Запустить'))
	]);
}

return view.extend({
	load: function() {
		return Promise.all([
			callCapabilities(),
			callNodes(''),
			callSelectors(),
			callStatus('')
		]);
	},

	renderResultsTable: function(job, selector, selectorSwitchAvailable) {
		var self = this;
		var rows = (job.results || []).slice().sort(function(a, b) {
			return Number(b.score || 0) - Number(a.score || 0);
		}).map(function(item) {
			var actions = '-';
			if (selector && selectorSwitchAvailable) {
				actions = E('button', {
					'class': 'btn cbi-button cbi-button-apply',
					'click': function() { self.confirmSelection(selector, item.tag); }
				}, _('Выбрать'));
			}
			return E('tr', {}, [
				E('td', {}, item.tag),
				E('td', {}, item.type || '-'),
				E('td', {}, metric(item.latency_ms, ' ms')),
				E('td', {}, metric(item.jitter_ms, ' ms')),
				E('td', {}, metric(item.success_pct, '%')),
				E('td', {}, downloadMetric(job.profile, item.download_mbps)),
				E('td', { 'class': 'forkop-analyzer-score' }, String(item.score || 0)),
				E('td', {}, item.error || '-'),
				E('td', {}, actions)
			]);
		});

		if (!rows.length)
			rows.push(E('tr', {}, E('td', { 'colspan': '9' }, _('Результатов пока нет'))));

		return E('div', { 'class': 'forkop-analyzer-table-wrap' }, E('table', { 'class': 'table' }, [
			E('tr', { 'class': 'tr table-titles' }, [
				E('th', {}, _('Узел')),
				E('th', {}, _('Тип')),
				E('th', {}, _('Задержка')),
				E('th', {}, _('Джиттер')),
				E('th', {}, _('Успех')),
				E('th', {}, _('Скачивание')),
				E('th', {}, _('Score')),
				E('th', {}, _('Ошибка')),
				E('th', {}, '')
			])
		].concat(rows)));
	},

	renderJob: function(job) {
		var capabilities = this.capabilities || {};
		if (!job || job.status === 'idle')
			return E('div', { 'class': 'forkop-analyzer-card' }, _('Активного benchmark нет'));

		var running = job.status === 'running';
		return E('div', {}, [
			E('div', { 'class': 'forkop-analyzer-card' }, [
				E('h3', {}, _('Текущий benchmark')),
				E('p', {}, [
					E('span', { 'class': 'forkop-analyzer-status ' + (running ? 'warn' : (job.status === 'completed' ? 'ok' : 'error')) }, job.status),
					' ', job.job_id || ''
				]),
				E('p', {}, '%s: %s / %s'.format(_('Прогресс'), job.completed || 0, job.total || 0)),
				E('p', {}, '%s: %s'.format(_('Текущий узел'), job.current_tag || '-')),
				E('p', { 'class': 'forkop-analyzer-muted' }, job.message || ''),
				running ? E('button', {
					'class': 'btn cbi-button cbi-button-negative',
					'click': L.bind(this.cancelJob, this, job.job_id)
				}, _('Отменить')) : ''
			]),
			this.renderResultsTable(job, job.selector, capabilities.selector_switch_available)
		]);
	},

	refreshStatus: function() {
		var self = this;
		return callStatus('').then(function(response) {
			if (!response || !response.success)
				return;
			self.job = response.data;
			if (self.statusTarget)
				dom.content(self.statusTarget, self.renderJob(self.job));
		});
	},

	startProfile: function(profile) {
		var self = this;
		var selector = this.selectorInput ? this.selectorInput.value : '';
		return callStart(profile, selector).then(function(response) {
			if (!response || !response.success) {
				notifyFailure(response);
				return;
			}
			ui.addNotification(null, E('p', {}, _('Benchmark запущен')), 'info');
			return self.refreshStatus();
		});
	},

	cancelJob: function(jobId) {
		var self = this;
		return callCancel(jobId || '').then(function(response) {
			if (!response || !response.success)
				notifyFailure(response);
			else
				ui.addNotification(null, E('p', {}, _('Отмена запрошена')), 'info');
			return self.refreshStatus();
		});
	},

	confirmSelection: function(selector, tag) {
		var self = this;
		ui.showModal(_('Переключить production selector?'), [
			E('p', {}, _('Это отдельное действие изменит текущий узел Forkop. Сам benchmark selector не переключает.')),
			E('p', {}, '%s → %s'.format(selector, tag)),
			E('div', { 'class': 'right' }, [
				E('button', { 'class': 'btn', 'click': ui.hideModal }, _('Отмена')),
				' ',
				E('button', {
					'class': 'btn cbi-button cbi-button-positive important',
					'click': function() {
						callSelectNode(selector, tag).then(function(response) {
							ui.hideModal();
							if (!response || !response.success)
								notifyFailure(response);
							else
								ui.addNotification(null, E('p', {}, _('Узел Forkop переключён')), 'info');
							return self.refreshStatus();
						});
					}
				}, _('Переключить'))
			])
		]);
	},

	render: function(data) {
		this.capabilities = dataOf(data[0], {});
		this.nodes = dataOf(data[1], []);
		this.selectors = dataOf(data[2], []);
		this.job = dataOf(data[3], { status: 'idle' });
		this.selectorInput = E('select', { 'class': 'cbi-input-select' }, selectorOptions(this.selectors));
		this.statusTarget = E('div', {}, this.renderJob(this.job));

		var caps = this.capabilities;
		var warnings = [];
		if (!caps.forkop_installed)
			warnings.push(E('p', { 'class': 'alert-message error' }, _('Forkop не обнаружен')));
		else if (!caps.forkop_compatible)
			warnings.push(E('p', { 'class': 'alert-message warning' }, _('Установленная версия Forkop не поддерживает необходимый API')));

		poll.add(L.bind(this.refreshStatus, this), 3);

		return E('div', { 'class': 'cbi-map' }, [
			E('link', { 'rel': 'stylesheet', 'href': L.resource('view/forkop-analyzer/forkop-analyzer.css') }),
			E('h2', {}, _('Forkop Analyzer')),
			E('p', {}, _('Безопасное сравнение VPN-узлов Forkop без автоматического переключения production selector.')),
			warnings.length ? E('div', {}, warnings) : '',
			E('div', { 'class': 'forkop-analyzer-grid' }, [
				E('div', { 'class': 'forkop-analyzer-card' }, [
					E('h3', {}, _('Forkop')),
					statusBadge(caps.forkop_compatible, _('Совместим'), _('Недоступен')),
					E('p', {}, caps.forkop_version || '-'),
				]),
				E('div', { 'class': 'forkop-analyzer-card' }, [
					E('h3', {}, _('sing-box')),
					statusBadge(caps.singbox_compatible, _('Совместим'), _('Недоступен')),
					E('p', {}, caps.singbox_version || '-'),
				]),
				E('div', { 'class': 'forkop-analyzer-card' }, [
					E('h3', {}, _('Isolated Full')),
					statusBadge(caps.isolated_benchmark_supported, _('Доступен'), _('Недоступен')),
					E('p', { 'class': 'forkop-analyzer-muted' }, _('Временный localhost-only instance'))
				])
			]),
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Selector для анализа')),
				this.selectorInput,
				E('p', { 'class': 'forkop-analyzer-muted' }, '%s: %s'.format(_('Найдено benchmark-узлов'), this.nodes.length))
			]),
			E('div', { 'class': 'forkop-analyzer-grid' }, [
				profileCard('quick', _('Quick'), _('Три latency-пробы через Forkop Clash API.'), _('Минимальный тестовый трафик.'), L.bind(this.startProfile, this)),
				profileCard('gaming', _('Gaming'), _('Повторные latency-пробы для оценки задержки, джиттера и потерь.'), _('Низкий тестовый трафик.'), L.bind(this.startProfile, this)),
				profileCard('full', _('Full'), _('Gaming-метрики и ограниченный download через отдельный sing-box instance.'), _('Создаёт benchmark-трафик; лимит задаётся в настройках.'), L.bind(this.startProfile, this))
			]),
			E('h3', {}, _('Статус и результаты')),
			this.statusTarget
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
