#!/usr/bin/env python3
"""Run the real worker against blocking probes, without network or router changes."""
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
UCODE = shutil.which('ucode')

def write(path, text):
    path.write_text(text)
    path.chmod(0o755)

def live(pid):
    try:
        return Path('/proc', str(pid), 'stat').read_text().split(') ', 1)[1][0] != 'Z'
    except FileNotFoundError:
        return False

for phase in ('latency', 'prepare', 'check', 'download', 'sites'):
    with tempfile.TemporaryDirectory(prefix='analyzer-cancel-') as directory:
        base = Path(directory)
        runtime, results, tmp, binaries = [base / name for name in ('run', 'results', 'tmp', 'bin')]
        for path in (runtime, results, tmp, binaries):
            path.mkdir()
        lib = ROOT / 'forkop-analyzer/files/usr/lib/forkop-analyzer'
        source = (ROOT / 'forkop-analyzer/files/usr/libexec/forkop-analyzer-worker').read_text()
        for old, new in [('/var/run/forkop-analyzer', runtime), ('/var/lib/forkop-analyzer/results', results),
                         ('/tmp/forkop-analyzer', tmp), ('/usr/lib/forkop-analyzer', lib),
                         ('/usr/bin/sing-box', binaries / 'sing-box')]:
            source = source.replace(old, str(new))
        worker = base / 'forkop-analyzer-worker'
        write(worker, source)
        # Ignoring TERM forces timeout's process-group escalation to KILL.
        write(binaries / 'block', '''#!/bin/sh
trap '' TERM
printf '%s\\n' "$$" > "$CASE_DIR/blocked.pid"
sleep 60 &
printf '%s\\n' "$!" > "$CASE_DIR/descendant.pid"
wait
''')
        write(binaries / 'uci', '''#!/bin/sh
case "$*" in
 *full_repeats) echo 1 ;;
 *download_bytes|*download_chunk_bytes) echo 1024 ;;
 *download_url) echo https://test.invalid/file ;;
esac
''')
        write(binaries / 'jsonfilter', '#!/bin/sh\necho 10\n')
        write(binaries / 'ucode', '''#!/bin/sh
if [ "$1" != '-L' ]; then exec "$REAL_UCODE" "$@"; fi
case "$4" in
 clash-api)
  [ "$PHASE" != latency ] || exec "$CASE_DIR/bin/block"
  echo '{"delay":10}' ;;
 prepare-isolated)
  [ "$PHASE" != prepare ] || exec "$CASE_DIR/bin/block"
  echo '{}' > "$6"
  echo '{"success":true}' ;;
esac
''')
        write(binaries / 'sing-box', '''#!/bin/sh
if [ "$3" = check ]; then
 [ "$PHASE" != check ] || exec "$CASE_DIR/bin/block"
 exit 0
fi
exec python3 -c 'import os,signal,time; from pathlib import Path; signal.signal(signal.SIGTERM,signal.SIG_IGN); Path(os.environ["CASE_DIR"],"isolated.pid").write_text(str(os.getpid())); time.sleep(60)'
''')
        write(binaries / 'curl', '#!/bin/sh\nexec "$CASE_DIR/bin/block"\n')
        profile = 'sites' if phase == 'sites' else 'full'
        job = 'cancel-test'
        state, result = runtime / (job + '.json'), results / (job + '.json')
        subprocess.run([UCODE, str(lib / 'result_store.uc'), 'init', str(state), str(result), job, profile, '', '', '1'], check=True, stdout=subprocess.DEVNULL)
        (runtime / 'active_job').write_text(job)
        (runtime / 'active.lock').mkdir()
        (tmp / (job + '.nodes.tsv')).write_text('node\tvless\tNode\n')
        env = dict(os.environ, PATH=str(binaries) + ':' + os.environ['PATH'], CASE_DIR=str(base), PHASE=phase, REAL_UCODE=UCODE)
        with (base / 'worker.log').open('w') as log:
            process = subprocess.Popen(['sh', str(worker), job, profile, '', '', '1', '1'], env=env, stdout=log, stderr=log)
            (runtime / (job + '.pid')).write_text(str(process.pid))
            try:
                deadline = time.monotonic() + 8
                while not (base / 'descendant.pid').exists():
                    assert process.poll() is None, (phase, (base / 'worker.log').read_text())
                    assert time.monotonic() < deadline, phase + ' did not enter probe'
                    time.sleep(.02)
                started = time.monotonic()
                (runtime / (job + '.cancel')).touch()
                process.send_signal(signal.SIGTERM)
                process.wait(timeout=8)
                elapsed = time.monotonic() - started
                data = json.loads(result.read_text())
                assert data['status'] == 'cancelled', (phase, data)
                assert not (runtime / 'active.lock').exists(), phase
                assert not (runtime / 'active_job').exists(), phase
                assert not (tmp / job).exists(), phase
                for name in ('blocked.pid', 'descendant.pid', 'isolated.pid'):
                    if (base / name).exists():
                        pid = int((base / name).read_text())
                        assert not live(pid), (phase, name, pid)
                print(f'Cancellation {phase}: {elapsed:.2f}s, cancelled, descendants stopped, lock released')
            finally:
                if process.poll() is None:
                    process.kill()
                    process.wait()
                for pidfile in base.glob('*.pid'):
                    pid = int(pidfile.read_text())
                    if live(pid):
                        os.kill(pid, signal.SIGKILL)
