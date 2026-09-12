'use strict';
'require baseclass';

function render(job) {
 var labels = { redirect_limit: _('Лимит редиректов'), geo_blocked: _('Региональное ограничение'), challenge: _('Антибот-проверка'), unverified: _('Обход не подтверждён'), head_unsupported: _('HEAD не поддерживается'), http_error: _('HTTP-ошибка сайта'), ok: _('Доступен'), restricted: _('Ограничение сайта'), redirect: _('Редирект'),
  server_error: _('Ошибка сайта'), network_error: _('Нет HTTPS-ответа'), setup_error: _('Ошибка VPN-сервера') };
 if (!(job.results || []).length)
  return E('div', { 'class': 'forkop-analyzer-empty' }, _('Ожидание первых HTTPS-ответов…'));
 return E('div', { 'class': 'forkop-analyzer-site-results' }, job.results.map(function(node) {
  var sites = (node.site_results || []).map(function(site) { return Number(site.curl_code) === 47 && site.state !== 'setup_error' ? Object.assign({}, site, { state: 'redirect_limit' }) : site; }), ok = sites.filter(function(s) { return s.state === 'ok'; }).length;
  var limited = sites.filter(function(s) { return ['redirect_limit', 'geo_blocked', 'challenge', 'unverified', 'restricted', 'redirect', 'head_unsupported', 'http_error'].indexOf(s.state) >= 0; }).length;
  return E('details', { 'class': 'forkop-analyzer-site-server', open: '' }, [
   E('summary', {}, [ E('strong', {}, node.display_name || node.tag), E('span', {},
    _('Проверено') + ': ' + sites.length + ' · ' + _('Доступны') + ': ' + ok + ' · ' + _('Ограничения') + ': ' + limited) ]),
   E('div', { 'class': 'forkop-analyzer-table-wrap' }, E('table', { 'class': 'table forkop-analyzer-results-table' }, [
    E('caption', { 'class': 'forkop-monitor-sr' }, _('HTTPS-проверка сайтов через') + ' ' + (node.display_name || node.tag)),
    E('thead', {}, E('tr', {}, [ _('Сайт'), _('Результат'), 'HTTP', _('Время ответа') ].map(function(label) { return E('th', { scope: 'col' }, label); }))),
    E('tbody', {}, sites.map(function(site) {
     var tone = site.state === 'ok' ? 'ok' : ['redirect_limit', 'geo_blocked', 'challenge', 'unverified', 'restricted', 'redirect', 'head_unsupported', 'http_error'].indexOf(site.state) >= 0 ? 'warn' : 'error';
     return E('tr', {}, [
      E('td', { 'data-label': _('Сайт') }, E('strong', {}, site.domain)),
      E('td', { 'data-label': _('Результат') }, [ E('span', { 'class': 'forkop-analyzer-status ' + tone }, labels[site.state] || site.state),
       site.state === 'redirect_limit' ? E('small', {}, _('Сайт ответил перенаправлениями; конечная страница не проверена')) : '',
       site.body_state ? E('small', {}, site.body_state === 'no_markers' ? _('В HTML нет явного сообщения о регионе; работа сервиса не подтверждена') : site.body_state === 'geo_blocked' ? _('В ответе обнаружено сообщение о недоступности в регионе') : site.body_state === 'challenge' ? _('Сайт требует проверки браузера / человека') : _('Содержимого недостаточно для проверки региона')) : '',
       site.curl_code && !(site.curl_code === 23 && site.body_truncated) ? E('small', {}, 'curl: ' + site.curl_code) : '' ]),
      E('td', { 'data-label': 'HTTP' }, site.http_code ? String(site.http_code) : '—'),
      E('td', { 'data-label': _('Время ответа') }, site.state === 'setup_error' ? '—' : (Number(site.elapsed_ms || 0) / 1000).toFixed(2) + ' с')
     ]);
    }))
   ]))
  ]);
 }));
}
return baseclass.extend({ render: render });
