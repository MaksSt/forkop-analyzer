'use strict';
'require view';
'require form';
'require forkop-analyzer.ui-v2 as presentation';

return view.extend({
	addFooter: function() {
		return E('div', { 'class': 'forkop-analyzer-app', 'data-theme': presentation.theme() }, this.super('addFooter', arguments));
	},

	render: function() {
		var map = new form.Map('forkop-analyzer', _('Настройки Forkop Analyzer'),
			_('Мониторинг, режимы проверки и расписание. Full расходует тестовый трафик в пределах заданного лимита.'));
		var section = map.section(form.NamedSection, 'main', 'settings', _('Параметры'));
		section.addremove = false;
		section.tab('general', _('Общее'));
		section.tab('monitor', _('Мониторинг VPN'));
		section.tab('probes', _('Пробы задержки'));
		section.tab('full', _('Профиль Full'));
		section.tab('schedule', _('Расписание'));

		var option = section.taboption('general', form.Flag, 'enabled', _('Включить backend'));
		option.default = option.enabled;

		option = section.taboption('general', form.Value, 'selector', _('Selector по умолчанию'));
		option.placeholder = _('Пусто — все selector-группы');
		option.description = _('Используется только как область benchmark. Автоматического переключения нет.');

		option = section.taboption('probes', form.Value, 'quick_repeats', _('Quick: число проб'));
		option.datatype = 'range(1,20)';
		option.default = '3';

		option = section.taboption('probes', form.Value, 'gaming_repeats', _('Gaming: число проб'));
		option.datatype = 'range(2,50)';
		option.default = '20';

		option = section.taboption('probes', form.Value, 'full_repeats', _('Full: число latency-проб'));
		option.datatype = 'range(2,50)';
		option.default = '8';

		option = section.taboption('probes', form.Value, 'latency_timeout_ms', _('Timeout latency, ms'));
		option.datatype = 'range(500,30000)';
		option.default = '5000';

		option = section.taboption('full', form.Value, 'full_max_nodes', _('Full: максимум узлов'));
		option.datatype = 'range(1,50)';
		option.default = '15';

		option = section.taboption('full', form.Value, 'download_url', _('Download endpoint'));
		option.default = 'https://nbg1-speed.hetzner.com/1GB.bin';
		option.description = _('Официальный тестовый файл Hetzner размером 1 GiB. Запрос идёт через тестируемый outbound.');

		option = section.taboption('full', form.Value, 'download_bytes', _('Ожидаемый размер download, bytes'));
		option.datatype = 'range(1024,2147483647)';
		option.default = '1073741824';

		option = section.taboption('full', form.Value, 'download_chunk_bytes', _('Размер одного download-чанка, bytes'));
		option.datatype = 'range(1024,2147483647)';
		option.default = '1073741824';
		option.description = _('Для стандартного Hetzner endpoint весь 1 GiB загружается одним запросом.');

		option = section.taboption('full', form.Value, 'download_timeout_seconds', _('Full: время download, секунд'));
		option.datatype = 'range(10,3600)';
		option.default = '900';
		option.description = _('До 15 минут на узел, чтобы медленные соединения также успели получить весь 1 GiB.');

		option = section.taboption('full', form.Value, 'target_download_mbps', _('Целевая скорость для score, Mbit/s'));
		option.datatype = 'range(1,10000)';
		option.default = '100';

		option = section.taboption('full', form.Value, 'max_traffic_mb', _('Лимит трафика на Full, MiB'));
		option.datatype = 'range(1,51200)';
		option.default = '15360';

		option = section.taboption('general', form.Value, 'retention_days', _('Хранить результаты, дней'));
		option.datatype = 'range(1,3650)';
		option.default = '30';

		var monitoring = section;
		option = monitoring.taboption('monitor', form.Flag, 'monitor_enabled', _('Следить за активным сервером'));
		option.default = option.enabled;
		option.description = _('Фоновая проверка активного сервера. История за 24 часа хранится в RAM и сбрасывается при перезагрузке роутера.');
		option = monitoring.taboption('monitor', form.Value, 'monitor_selector', _('Группа мониторинга'));
		option.placeholder = 'vpn-out';
		option.description = _('Пусто — vpn-out или первая selector-группа. Для другой группы укажите её runtime tag. Вложенные группы раскрываются до активного сервера.');
		option = monitoring.taboption('monitor', form.Value, 'monitor_interval', _('Интервал мониторинга, секунд'));
		option.datatype = 'range(10,300)';
		option.default = '15';
		option.description = _('Одна latency-проба через активный сервер, timeout 5 секунд. Короткие события между проверками могут быть пропущены.');

		var schedule = section;

		option = schedule.taboption('schedule', form.Flag, 'schedule_enabled', _('Включить ежедневный benchmark'));
		option.default = option.disabled;

		option = schedule.taboption('schedule', form.Value, 'schedule_hour', _('Час запуска'));
		option.datatype = 'range(0,23)';
		option.default = '4';

		option = schedule.taboption('schedule', form.ListValue, 'schedule_profile', _('Профиль'));
		option.value('quick', 'Quick');
		option.value('gaming', 'Gaming');
		option.value('full', 'Full');
		option.default = 'quick';

		return map.render().then(function(node) {
			node.classList.add('forkop-analyzer-app', 'forkop-analyzer-settings');
			node.dataset.theme = presentation.theme();
			return E('div', {}, [ presentation.stylesheet(), node ]);
		});
	}
});
