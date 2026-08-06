'use strict';
'require view';
'require form';

return view.extend({
	render: function() {
		var map = new form.Map('forkop-analyzer', _('Forkop Analyzer — настройки'),
			_('Benchmark не изменяет production selector. Full создаёт ограниченный тестовый трафик через временный localhost-only sing-box instance.'));
		var section = map.section(form.NamedSection, 'main', 'settings', _('Основные настройки'));
		section.addremove = false;

		var option = section.option(form.Flag, 'enabled', _('Включить backend'));
		option.default = option.enabled;

		option = section.option(form.Value, 'selector', _('Selector по умолчанию'));
		option.placeholder = _('Пусто — все selector-группы');
		option.description = _('Используется только как область benchmark. Автоматического переключения нет.');

		option = section.option(form.Value, 'quick_repeats', _('Quick: число проб'));
		option.datatype = 'range(1,20)';
		option.default = '3';

		option = section.option(form.Value, 'gaming_repeats', _('Gaming: число проб'));
		option.datatype = 'range(2,50)';
		option.default = '20';

		option = section.option(form.Value, 'full_repeats', _('Full: число latency-проб'));
		option.datatype = 'range(2,50)';
		option.default = '8';

		option = section.option(form.Value, 'latency_timeout_ms', _('Timeout latency, ms'));
		option.datatype = 'range(500,30000)';
		option.default = '5000';

		option = section.option(form.Value, 'full_max_nodes', _('Full: максимум узлов'));
		option.datatype = 'range(1,50)';
		option.default = '10';

		option = section.option(form.Value, 'download_url', _('Download endpoint'));
		option.default = 'https://speed.cloudflare.com/__down?bytes=5000000';
		option.description = _('Endpoint должен поддерживать HTTPS. Запрос идёт через тестируемый outbound.');

		option = section.option(form.Value, 'download_bytes', _('Ожидаемый размер download, bytes'));
		option.datatype = 'range(1024,100000000)';
		option.default = '5000000';

		option = section.option(form.Value, 'target_download_mbps', _('Целевая скорость для score, Mbit/s'));
		option.datatype = 'range(1,10000)';
		option.default = '100';

		option = section.option(form.Value, 'max_traffic_mb', _('Лимит трафика на Full, MiB'));
		option.datatype = 'range(1,4096)';
		option.default = '100';

		option = section.option(form.Value, 'retention_days', _('Хранить результаты, дней'));
		option.datatype = 'range(1,3650)';
		option.default = '30';

		var schedule = map.section(form.NamedSection, 'main', 'settings', _('Расписание'));
	schedule.addremove = false;

		option = schedule.option(form.Flag, 'schedule_enabled', _('Включить ежедневный benchmark'));
		option.default = option.disabled;

		option = schedule.option(form.Value, 'schedule_hour', _('Час запуска'));
		option.datatype = 'range(0,23)';
		option.default = '4';

		option = schedule.option(form.ListValue, 'schedule_profile', _('Профиль'));
		option.value('quick', 'Quick');
		option.value('gaming', 'Gaming');
		option.value('full', 'Full');
		option.default = 'quick';

		return map.render();
	}
});
