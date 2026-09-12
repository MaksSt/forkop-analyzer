#!/usr/bin/env python3
"""Exercise deletion through the real CLI and result store in isolated directories."""
import json
import subprocess
import tempfile
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='analyzer-history-') as directory:
    base = Path(directory)
    runtime, results = base/'runtime', base/'results'
    runtime.mkdir(); results.mkdir()
    source = (ROOT/'forkop-analyzer/files/usr/libexec/forkop-analyzer').read_text()
    source = source.replace("RUNTIME_DIR='/var/run/forkop-analyzer'", f"RUNTIME_DIR='{runtime}'")
    source = source.replace("RESULTS_DIR='/var/lib/forkop-analyzer/results'", f"RESULTS_DIR='{results}'")
    source = source.replace("STORE='/usr/lib/forkop-analyzer/result_store.uc'", f"STORE='{ROOT}/forkop-analyzer/files/usr/lib/forkop-analyzer/result_store.uc'")
    script = base/'cli'; script.write_text(source)
    def call(job):
        result = subprocess.run(['sh', str(script), 'delete_result', job], capture_output=True, text=True)
        return json.loads(result.stdout)
    for status in ['running','completed','failed','cancelled']:
        target = results/(status+'.json')
        target.write_text(json.dumps(dict(status=status,job_id=status)))
        result = call(status)
        assert result['success'] == (status == 'cancelled'), result
        assert target.exists() == (status != 'cancelled')
    assert not call('cancelled')['success']
    assert not call('../escape')['success']
    target = results/'busy.json';target.write_text(json.dumps(dict(status='cancelled')))
    (runtime/'active_job').write_text('busy')
    assert not call('busy')['success'] and target.exists()
    assert len(list(results.glob('*.json'))) == 4
    print('History deletion: cancelled only, active protection, invalid paths, missing job, unrelated results preserved.')
