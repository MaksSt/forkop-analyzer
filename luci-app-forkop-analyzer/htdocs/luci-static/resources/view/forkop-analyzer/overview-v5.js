'use strict';
'require view';
'require rpc';
'require poll';
'require dom';
'require ui';
'require forkop-analyzer.monitor-v3 as monitor';
'require forkop-analyzer.ui-v1 as presentation';

// Версия пути обновляет модуль страницы в кэше LuCI при изменении интерфейса.

var callMonitor = rpc.declare({ object: 'forkop-analyzer', method: 'monitor' });
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

function selectorOptions(selectors) {
	var options = [ E('option', { 'value': '' }, _('Все selector-группы')) ];

	selectors.forEach(function(selector) {
		options.push(E('option', { 'value': selector.tag }, '%s (%s)'.format(selector.tag, selector.type)));
	});

	return options;
}

function profileCard(profile, title, description, traffic, onStart) {
	return E('div', { 'class': 'forkop-analyzer-profile' }, [
		E('div', {}, [ E('h4', {}, title), E('p', {}, description) ]),
		E('div', { 'class': 'forkop-analyzer-profile-footer' }, [
			E('small', {}, traffic),
			E('button', { 'class': 'btn cbi-button cbi-button-action', 'data-profile': profile,
				'aria-label': _('Запустить проверку') + ' ' + title, click: function() { onStart(profile); } }, _('Запустить'))
		])
	]);
}

function capability(name, version, available, label) {
	return E('div', { 'class': 'forkop-analyzer-capability' }, [
		E('span', { 'class': available ? 'forkop-analyzer-health is-ok' : 'forkop-analyzer-health is-error', 'aria-hidden': 'true' }),
		E('strong', {}, name), version ? E('span', {}, version) : '',
		E('small', {}, available ? label : _('Недоступен'))
	]);
}

return view.extend({
	load: function() {
		return Promise.all([
			callCapabilities(),
			callNodes(''),
			callSelectors(),
			callStatus(''),
			callMonitor().catch(function() { return null; })
		]);
	},

	renderResultsTable: function(job, selector, selectorSwitchAvailable) {
		var self = this;
		return presentation.resultsTable(job, this.nodes, selector && selectorSwitchAvailable ? function(tag) { self.confirmSelection(selector, tag); } : null);
	},

	renderJob: function(job) {
		if (!job || job.status === 'idle')
			return E('div', { 'class': 'forkop-analyzer-empty' }, [ E('strong', {}, _('Проверки ещё не запускались')), E('p', {}, _('Выберите режим выше. Здесь появятся прогресс и сравнение серверов.')) ]);
		var running = job.status === 'running' || job.status === 'queued';
		var completed = Number(job.completed) || 0, total = Number(job.total) || 0;
		var progress = total > 0 ? Math.max(0, Math.min(100, completed / total * 100)) : 0;
		var status = presentation.jobBadge(job.status);
		if (job.message) status.title = job.message;
		return E('div', {}, [
			E('div', { 'class': 'forkop-analyzer-job' }, [
				E('div', { 'class': 'forkop-analyzer-job-heading' }, [
					E('div', { 'class': 'forkop-analyzer-actions' }, [ E('h3', {}, running ? _('Текущая проверка') : _('Последняя проверка')), status ]),
					E('div', { 'class': 'forkop-analyzer-job-count' }, [ E('strong', {}, completed + ' / ' + total), ' ' + _('серверов'), E('span', {}, job.profile || '') ])
				]),
				E('div', { 'class': 'forkop-analyzer-job-meta' }, [
					E('span', {}, job.selector || _('Все selector-группы')),
					E('span', { 'class': 'forkop-analyzer-job-id' }, job.job_id || '')
				]),
				running ? E('div', { 'class': 'forkop-analyzer-progress', role: 'progressbar', 'aria-label': _('Прогресс проверки'), 'aria-valuemin': '0', 'aria-valuemax': String(total || 1), 'aria-valuenow': String(Math.min(completed, total || 1)) }, E('span', { style: 'width:' + progress + '%' })) : '',
				running ? E('div', { 'class': 'forkop-analyzer-job-running' }, [
					E('span', {}, _('Сейчас проверяется') + ': ' + presentation.nodeDisplayName({ tag: job.current_tag, display_name: job.current_display_name }, this.nodes)),
					E('button', { 'class': 'btn cbi-button cbi-button-negative', click: L.bind(this.cancelJob, this, job.job_id) }, _('Отменить'))
				]) : '',
				job.status === 'failed' && job.message ? E('p', { 'class': 'forkop-analyzer-error-text', role: 'status' }, job.message) : ''
			]),
			this.renderResultsTable(job, job.selector, (this.capabilities || {}).selector_switch_available)
		]);
	},

	refreshMonitor: function() {
		var self = this;
		return callMonitor().then(function(response) {
			if (!response || !response.success)
				throw new Error('Monitor RPC failed');
			self.monitorData = response.data;
			self.monitorView.update(self.monitorData);
		}).catch(function() {
			self.monitorView.update(Object.assign({}, self.monitorData, { error: true }));
		});
	},

	refreshStatus: function() {
		var self = this;
		return callStatus('').then(function(response) {
			if (!response || !response.success)
				return;
			self.job = response.data;
			if (self.statusTarget && !self.statusTarget.contains(document.activeElement))
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
		this.monitorData = dataOf(data[4], { error: true });
		this.monitorView = monitor.create(this.monitorData);
		this.selectorInput = E('select', { 'class': 'cbi-input-select', id: 'forkop-analyzer-selector', 'aria-label': _('Группа для анализа') }, selectorOptions(this.selectors));
		this.statusTarget = E('section', { 'class': 'forkop-analyzer-panel forkop-analyzer-result-panel', 'aria-label': _('Результаты проверки') }, this.renderJob(this.job));

		var caps = this.capabilities;
		var warnings = [];
		if (!caps.forkop_installed)
			warnings.push(E('p', { 'class': 'alert-message error' }, _('Forkop не обнаружен')));
		else if (!caps.forkop_compatible)
			warnings.push(E('p', { 'class': 'alert-message warning' }, _('Установленная версия Forkop не поддерживает необходимый API')));

		poll.add(L.bind(this.refreshStatus, this), 3);
		poll.add(L.bind(this.refreshMonitor, this), 5);

		return E('div', { 'class': 'cbi-map forkop-analyzer-app', 'data-theme': presentation.theme() }, [
			presentation.stylesheet(),
			presentation.heading(_('Forkop Analyzer'), _('Мониторинг VPN и сравнение серверов. Проверки не переключают активное соединение.')),
			warnings.length ? E('div', {}, warnings) : '',
			this.monitorView.node,
			E('section', { 'class': 'forkop-analyzer-panel forkop-analyzer-setup', 'aria-label': _('Проверка серверов') }, [
				E('div', { 'class': 'forkop-analyzer-section-heading' }, [
					E('div', {}, [ E('h3', {}, _('Проверка серверов')), E('p', {}, _('Выберите группу и режим сравнения')) ]),
					E('div', { 'class': 'forkop-analyzer-selector' }, [ E('label', { 'for': 'forkop-analyzer-selector' }, _('Группа для анализа')), this.selectorInput ])
				]),
				E('div', { 'class': 'forkop-analyzer-capabilities' }, [
					capability('Forkop', caps.forkop_version, caps.forkop_compatible, _('Совместим')),
					capability('sing-box', caps.singbox_version, caps.singbox_compatible, _('Совместим')),
					capability('Full', '', caps.isolated_benchmark_supported, _('Доступен')),
					E('span', { 'class': 'forkop-analyzer-node-count' }, _('Серверов для анализа') + ': ' + this.nodes.length)
				]),
				E('div', { 'class': 'forkop-analyzer-profiles' }, [
					profileCard('quick', 'Quick', _('Быстрое сравнение задержки: три пробы на сервер.'), _('Минимум трафика'), L.bind(this.startProfile, this)),
					profileCard('gaming', 'Gaming', _('Задержка, джиттер и потери по серии повторных проб.'), _('Низкий расход трафика'), L.bind(this.startProfile, this)),
					profileCard('full', 'Full', _('Все метрики Gaming и проверка скорости скачивания.'), _('Трафик ограничен настройками'), L.bind(this.startProfile, this))
				])
			]),
			this.statusTarget
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
