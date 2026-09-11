// Модуль только для unit-тестов; UCI роутера не читается.
return { cursor: function() { return {
	load: function() { return true; },
	foreach: function(package, kind, callback) {
		if (kind == 'settings')
			callback({ '.name': 'settings', config_path: '/test/forkop-analyzer/runtime.json' });
	}
}; } };
