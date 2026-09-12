'use strict';
'require view';
'require forkop-analyzer.flags-v1 as flags';
'require rpc';
'require poll';
'require dom';
'require ui';
'require uci';
'require forkop-analyzer.site-results-v3 as siteResults';
'require forkop-analyzer.monitor-v4 as monitor';
'require forkop-analyzer.ui-v2 as presentation';

// Версия пути обновляет модуль страницы в кэше LuCI при изменении интерфейса.

var callSiteTargets = rpc.declare({ object: 'forkop-analyzer', method: 'site_targets' });
var callMonitor = rpc.declare({ object: 'forkop-analyzer', method: 'monitor' });
var callCapabilities = rpc.declare({ object: 'forkop-analyzer', method: 'capabilities' });
var callNodes = rpc.declare({ object: 'forkop-analyzer', method: 'nodes', params: [ 'selector' ] });
var callSelectors = rpc.declare({ object: 'forkop-analyzer', method: 'selectors' });
var callStatus = rpc.declare({ object: 'forkop-analyzer', method: 'status', params: [ 'job_id' ] });
var callStart = rpc.declare({ object: 'forkop-analyzer', method: 'start', params: [ 'profile', 'selector', 'node_tags', 'max_nodes', 'max_traffic_mb' ] });
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
			callMonitor().catch(function() { return null; }),
			uci.load('forkop-analyzer'),
			callSiteTargets().catch(function() { return null; })
		]);
	},

	renderResultsTable: function(job, selector, selectorSwitchAvailable) {
		var self = this;
		if (job.profile === 'sites') return siteResults.render(job);
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
					E('span', {}, _('Сейчас проверяется') + ': ' + presentation.nodeDisplayName({ tag: job.current_tag, display_name: job.current_display_name }, this.nodes) + (job.current_site ? ' · ' + job.current_site : '')),
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

	selectedTags: function() {
		return (this.choiceNodes || []).filter(function(node) { return this.chosen.has(node.tag); }, this)
			.map(function(node) { return node.tag; });
	},

	updateChoiceSummary: function() {
		var count = this.selectedTags().length;
		var limit = Number(this.maxNodesInput.value);
		var fullCount = limit > 0 ? Math.min(count, limit) : count;
		this.requiredTraffic = Math.ceil(fullCount * this.downloadBytes / 1048576);
		if (!this.trafficEdited)
			this.trafficInput.value = String(Math.min(51200, Math.max(this.defaultTraffic, this.requiredTraffic)));
		dom.content(this.choiceSummary, _('Выбрано') + ': ' + count + ' / ' + this.choiceNodes.length +
			' · Full: ' + fullCount + ' · ' + _('Объём скачивания') + ': ' + (this.requiredTraffic / 1024).toFixed(1) + ' GiB');
	},

	filteredNodes: function() {
		var query = this.nodeSearch.value.trim().toLocaleLowerCase();
		return this.choiceNodes.filter(function(node) {
			return ((node.display_name || '') + ' ' + node.tag).toLocaleLowerCase().indexOf(query) >= 0;
		});
	},

	selectFound: function(selected) {
		this.filteredNodes().forEach(function(node) {
			if (selected) this.chosen.add(node.tag); else this.chosen.delete(node.tag);
		}, this);
		this.renderChoices();
	},

	renderChoices: function() {
		var self = this, nodes = this.filteredNodes();
		dom.content(this.foundSummary, _('Найдено') + ': ' + nodes.length);
		this.addFound.disabled = this.removeFound.disabled = this.choicesLoading || !nodes.length;
		dom.content(this.choiceList, nodes.length ? nodes.map(function(node) {
			var input = E('input', { type: 'checkbox', change: function() {
				if (input.checked) self.chosen.add(node.tag); else self.chosen.delete(node.tag);
				self.updateChoiceSummary();
			} });
			input.checked = self.chosen.has(node.tag);
			return E('label', { 'class': 'forkop-analyzer-node-choice' }, [ input,
				E('span', {}, [ E('strong', {}, node.display_name || node.tag), E('small', {}, (String(node.tag || '').replace(/[\u{1F1E6}-\u{1F1FF}]/gu, '').trim().toLocaleLowerCase() === String(node.display_name || node.tag).replace(/[\u{1F1E6}-\u{1F1FF}]/gu, '').trim().toLocaleLowerCase() ? '' : String(node.tag || '').replace(/[\u{1F1E6}-\u{1F1FF}]/gu, '').trim() + ' · ') + node.type) ]) ]);
		}) : E('p', {}, _('Серверы не найдены')));
		this.updateChoiceSummary();
	},

	loadChoices: function() {
		var self = this, request = this.choiceRequest = (this.choiceRequest || 0) + 1;
		this.choicesLoading = true;
		this.addFound.disabled = this.removeFound.disabled = true;
		dom.content(this.choiceList, E('p', { role: 'status' }, _('Загрузка серверов…')));
		return callNodes(this.selectorInput.value).then(function(response) {
			if (request !== self.choiceRequest) return;
			if (!response || !response.success) throw new Error(_('Не удалось загрузить серверы'));
			self.choiceNodes = response.data;
			self.chosen = new Set(self.choiceNodes.map(function(node) { return node.tag; }));
			self.choicesLoading = false;
			self.renderChoices();
		}).catch(function() {
			if (request !== self.choiceRequest) return;
			self.choiceNodes = [];
			self.chosen = new Set();
			self.choicesLoading = false;
			self.updateChoiceSummary();
			dom.content(self.choiceList, E('p', { role: 'alert' }, _('Не удалось загрузить серверы. Выберите группу повторно.')));
		});
	},

	startProfile: function(profile) {
		var self = this;
		var selector = this.selectorInput ? this.selectorInput.value : '';
		var tags = this.selectedTags();
		if (profile === 'sites' && !this.siteTargets.length) {
			ui.addNotification(null, E('p', {}, _('Список сайтов недоступен. Обновите страницу.')), 'warning');
			return Promise.resolve();
		}
		if (this.choicesLoading || !tags.length) {
			ui.addNotification(null, E('p', {}, _('Выберите хотя бы один сервер и дождитесь загрузки списка.')), 'warning');
			return Promise.resolve();
		}
		if (profile === 'full' && (!this.maxNodesInput.checkValidity() || !this.trafficInput.checkValidity() ||
			Number(this.trafficInput.value) < this.requiredTraffic)) {
			ui.addNotification(null, E('p', {}, _('Для Full увеличьте бюджет трафика или уменьшите число серверов. Лимит узлов: 0–1000; бюджет: 1–51200 MiB.')), 'warning');
			return Promise.resolve();
		}
		return callStart(profile, selector, JSON.stringify(tags), profile === 'full' ? this.maxNodesInput.value : '',
			profile === 'full' ? this.trafficInput.value : '').then(function(response) {
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
		var self = this;
		this.siteTargets = dataOf(data[6], []);
		this.choiceNodes = this.nodes;
		this.chosen = new Set(this.nodes.map(function(node) { return node.tag; }));
		this.downloadBytes = Number(uci.get('forkop-analyzer', 'main', 'download_bytes')) || 1073741824;
		this.defaultTraffic = Number(uci.get('forkop-analyzer', 'main', 'max_traffic_mb')) || 15360;
		this.trafficEdited = false;
		this.nodeSearch = E('input', { type: 'search', placeholder: _('Поиск по имени или tag'),
			'aria-label': _('Поиск серверов'), input: function() { self.renderChoices(); } });
		this.maxNodesInput = E('input', { id: 'analyzer-max-nodes', type: 'number', min: '0', max: '1000', step: '1', value: '0', required: '',
			input: function() { self.updateChoiceSummary(); } });
		this.trafficInput = E('input', { id: 'analyzer-traffic', type: 'number', min: '1', max: '51200', step: '1', required: '',
			input: function() { self.trafficEdited = true; self.updateChoiceSummary(); } });
		this.choiceSummary = E('p', { role: 'status', 'aria-live': 'polite' });
		this.foundSummary = E('span', { 'class': 'forkop-analyzer-muted', 'aria-live': 'polite' });
		this.addFound = E('button', { 'class': 'btn cbi-button cbi-button-action', click: function() { self.selectFound(true); } }, _('Выбрать найденные'));
		this.removeFound = E('button', { 'class': 'btn', click: function() { self.selectFound(false); } }, _('Снять найденные'));
		this.choiceList = E('div', { 'class': 'forkop-analyzer-node-list' });
		this.selectorInput.addEventListener('change', function() { self.loadChoices(); });
		this.renderChoices();
		this.statusTarget = E('section', { 'class': 'forkop-analyzer-panel forkop-analyzer-result-panel', 'aria-label': _('Результаты проверки') }, this.renderJob(this.job));

		var caps = this.capabilities;
		var warnings = [];
		if (!caps.forkop_installed)
			warnings.push(E('p', { 'class': 'alert-message error' }, _('Forkop не обнаружен')));
		else if (!caps.forkop_compatible)
			warnings.push(E('p', { 'class': 'alert-message warning' }, _('Установленная версия Forkop не поддерживает необходимый API')));

		poll.add(L.bind(this.refreshStatus, this), 3);
		poll.add(L.bind(this.refreshMonitor, this), 5);

		return flags.decorate(E('div', { 'class': 'cbi-map forkop-analyzer-app', 'data-theme': presentation.theme() }, [
			presentation.stylesheet(),
			E('link', { rel: 'stylesheet', href: L.resource('view/forkop-analyzer/node-picker-v3.css') }),
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
				E('div', { 'class': 'forkop-analyzer-node-picker' }, [
					E('div', { 'class': 'forkop-analyzer-section-heading' }, [ E('h4', {}, _('Серверы для проверки')), this.foundSummary ]),
					E('div', { 'class': 'forkop-analyzer-picker-toolbar' }, [ this.nodeSearch, this.addFound, this.removeFound ]),
					E('div', { 'class': 'forkop-analyzer-actions forkop-analyzer-picker-all' }, [
						E('button', { 'class': 'btn', click: function() { self.chosen = new Set(self.choiceNodes.map(function(n) { return n.tag; })); self.renderChoices(); } }, _('Выбрать всю группу')),
						E('button', { 'class': 'btn', click: function() { self.chosen.clear(); self.renderChoices(); } }, _('Снять выбор'))
					]),
					this.choiceList, this.choiceSummary,
					E('div', { 'class': 'forkop-analyzer-run-limits' }, [
						E('label', { 'for': 'analyzer-max-nodes' }, [ _('Full: максимум серверов (0 — все выбранные)'), this.maxNodesInput ]),
						E('label', { 'for': 'analyzer-traffic' }, [ _('Full: бюджет скачивания, MiB'), this.trafficInput ])
					]),
					E('p', {}, _('Лимиты действуют только на этот запуск. Бюджет рассчитан для выбранных серверов; его можно изменить. При ограничении числа узлов проверяются первые выбранные серверы в порядке списка.'))
				]),
				E('div', { 'class': 'forkop-analyzer-profiles' }, [
					profileCard('quick', 'Quick', _('Быстрое сравнение задержки: три пробы на сервер.'), _('Минимум трафика'), L.bind(this.startProfile, this)),
					profileCard('gaming', 'Gaming', _('Задержка, джиттер и потери по серии повторных проб.'), _('Низкий расход трафика'), L.bind(this.startProfile, this)),
					profileCard('full', 'Full', _('Все метрики Gaming и проверка скорости скачивания.'), _('Трафик ограничен настройками'), L.bind(this.startProfile, this))
				])
			]),
			E('section', { 'class': 'forkop-analyzer-panel forkop-analyzer-sites-setup', 'aria-label': _('Доступность сайтов') }, [
				E('div', { 'class': 'forkop-analyzer-section-heading' }, [
					E('div', {}, [ E('h3', {}, _('Доступность сайтов')), E('p', {}, _('Проверка HTTPS через выбранные выше серверы. До 10 секунд на сайт; активное соединение не переключается.')) ]),
					E('button', { 'class': 'btn cbi-button cbi-button-action', 'data-profile': 'sites', click: function() { self.startProfile('sites'); } }, _('Проверить сайты'))
				]),
				E('p', { 'class': 'forkop-analyzer-muted' }, _('Проверяется HTTPS-ответ сайта. Успешный ответ не гарантирует работу авторизации, видео и других функций сервиса.')),
				E('details', {}, [ E('summary', {}, _('Сайты для проверки') + ' · ' + this.siteTargets.length),
					E('div', { 'class': 'forkop-analyzer-site-targets' }, this.siteTargets.map(function(domain) { return E('span', {}, domain); })),
					E('a', { href: 'https://github.com/itdoginfo/allow-domains/blob/main/Russia/inside-raw.lst', target: '_blank', rel: 'noopener noreferrer' }, _('Источник: itdoginfo/allow-domains'))
				])
			]),
			this.statusTarget
		]));
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
