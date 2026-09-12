#!/usr/bin/env python3
"""Verify HTTPS status classification, partial persistence and Sites CSV contract."""
import csv
import io
import json
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
LIB = ROOT / 'forkop-analyzer/files/usr/lib/forkop-analyzer'
with tempfile.TemporaryDirectory(prefix='analyzer-sites-') as directory:
    state, result = [str(Path(directory) / name) for name in ('state.json', 'result.json')]
    def store(*args):
        return subprocess.check_output(['ucode', str(LIB / 'result_store.uc'), *args], text=True)
    store('init', state, result, 'sites-test', 'sites', '', '', '2')
    cases = [(200, 0, '', 'ok'), (204, 0, '', 'ok'), (302, 0, '', 'redirect'),
             (403, 0, '', 'restricted'), (429, 0, '', 'restricted'),
             (405, 0, '', 'head_unsupported'), (404, 0, '', 'http_error'),
             (503, 0, '', 'server_error'), (0, 28, '', 'network_error'),
             (200, 60, '', 'network_error'), (0, 0, 'setup_error', 'setup_error')]
    for code, curl, setup, expected in cases:
        store('site', state, result, 'node', 'Node', 'vless', 'example.com', str(code), '0.125', str(curl), setup)
        site = json.loads(Path(result).read_text())['results'][0]['site_results'][-1]
        assert site['state'] == expected, site
        assert site['elapsed_ms'] == 125, site
    store('site', state, result, 'other', '<unsafe>', 'vless', 'another.com', '200', '0.250', '0', '')
    rows = list(csv.DictReader(io.StringIO(store('export-csv', result))))
    assert len(rows) == 12 and rows[-1]['tag'] == 'other', rows
    store('finish', state, result, 'cancelled', 'Cancelled', '', '1', '0')
    data = json.loads(Path(result).read_text())
    assert data['status'] == 'cancelled' and len(data['results'][0]['site_results']) == 11
    assert len((LIB / 'sites.lst').read_text().splitlines()) == 15
    print('Sites status, per-server persistence, cancellation preservation and CSV tests passed.')

with tempfile.TemporaryDirectory(prefix='analyzer-body-') as directory:
    state, result, body, headers = [str(Path(directory) / n) for n in ('state','result','body','headers')]
    store('init', state, result, 'body-test', 'sites', '', '', '1')
    cases = [
        ('<h1>Not available in your country</h1>', '', 200, 0, 'geo_blocked'),
        ('<h1>Not available in your region</h1>', '', 403, 0, 'geo_blocked'),
        ('<h1>Verify you are human</h1>', '', 403, 0, 'challenge'),
        ('', 'cf-mitigated: challenge\r\n', 403, 0, 'challenge'),
        ('<script>"not available in your country"</script>' + '<p>Welcome to our service. </p>' * 20, '', 200, 0, 'unverified'),
        ('<script>app()</script>', '', 200, 0, 'unverified'),
        ('a' * 65536, '', 206, 23, 'unverified'),
        ('a' * 100, '', 200, 23, 'network_error'),
        ('<h1>Not available in your country</h1>', '', 200, 60, 'network_error'),
    ]
    for html, extra, code, curl, expected in cases:
        Path(body).write_text(html)
        Path(headers).write_text('HTTP/2 200\r\ncontent-type: text/html\r\n' + extra + '\r\n')
        for domain in ['chatgpt.com', 'claude.ai']:
            store('site', state, result, 'node', 'Node', 'vless', domain, str(code), '0.1', str(curl), '', body, headers)
            site = json.loads(Path(result).read_text())['results'][0]['site_results'][-1]
            assert site['state'] == expected, site
            assert 'body' not in site and len(json.dumps(site)) < 600
    store('site', state, result, 'node', 'Node', 'vless', 'youtube.com', '200', '0.1', '0', '', body, headers)
    assert 'body_state' not in json.loads(Path(result).read_text())['results'][0]['site_results'][-1]
    print('Regional body evidence, challenge, truncation and scope tests passed.')
