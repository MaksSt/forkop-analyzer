#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"

find "$ROOT/forkop-analyzer/files" "$ROOT/install.sh" "$ROOT/tests" "$ROOT/scripts" \
	-type f 2>/dev/null | while IFS= read -r file; do
	first_line="$(sed -n '1p' "$file")"
	case "$first_line" in
		'#!'*'/sh'|'#!'*'/bash') sh -n "$file" ;;
	esac
done

if command -v jq >/dev/null 2>&1; then
	find "$ROOT/forkop-analyzer" "$ROOT/luci-app-forkop-analyzer" -type f -name '*.json' \
		-exec jq -e . {} \; >/dev/null
else
	if command -v python3 >/dev/null 2>&1; then
		python3 - "$ROOT" <<'PY'
import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
for base in (root / "forkop-analyzer", root / "luci-app-forkop-analyzer"):
    for path in base.rglob("*.json"):
        json.loads(path.read_text(encoding="utf-8"))
PY
	else
		ROOT_FOR_JSON="$ROOT" node -e 'const fs=require("fs"),p=require("path"); function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const f=p.join(d,e.name);if(e.isDirectory())walk(f);else if(e.name.endsWith(".json"))JSON.parse(fs.readFileSync(f,"utf8"));}} walk(p.join(process.env.ROOT_FOR_JSON,"forkop-analyzer"));walk(p.join(process.env.ROOT_FOR_JSON,"luci-app-forkop-analyzer"));'
	fi
fi

if command -v node >/dev/null 2>&1; then
	find "$ROOT/luci-app-forkop-analyzer/htdocs" -type f -name '*.js' \
		-exec node --check {} \; >/dev/null
fi

if command -v ucode >/dev/null 2>&1; then
	find "$ROOT/forkop-analyzer/files" -type f \( -name '*.uc' -o -path '*/rpcd/ucode/*' \) \
		-exec sh -c 'ucode -c "$1" >/dev/null' _ {} \;
fi

"$ROOT/tests/run.sh"

printf 'Static validation passed.\n'
