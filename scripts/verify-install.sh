#!/usr/bin/env bash
# Checks that the committed HEAD installs and starts, before you tag and submit it.
# It clones HEAD into a temp dir, runs a clean build and the tests, then installs that
# commit on a throwaway daemon the same way the registry does (Git remote + exact commit).
# Your own daemon is never touched. Uncommitted changes are not tested.
set -euo pipefail

repo="$(git rev-parse --show-toplevel)"
cd "$repo"

command -v paseo >/dev/null || { echo "paseo CLI not found on PATH" >&2; exit 1; }

if [ -n "$(git status --porcelain)" ]; then
  echo "warning: uncommitted changes are NOT tested, only the commit below" >&2
fi

work="$(mktemp -d "${TMPDIR:-/tmp}/verify-install.XXXXXX")"
home="$work/home"
mkdir -p "$home"

id=""
cleanup() {
  rc=$?
  if [ "$rc" -ne 0 ] && [ -f "$home/daemon.log" ]; then
    echo "" >&2
    echo "==> Diagnostics (the temp dir is deleted right after this)" >&2
    [ -n "$id" ] && paseo plugin logs "$id" --home "$home" 2>/dev/null | tail -15 >&2 || true
    echo "--- daemon errors" >&2
    node -e '
      const lines = require("fs").readFileSync(process.argv[1], "utf8").split("\n");
      const errors = [];
      for (const line of lines) {
        try {
          const e = JSON.parse(line);
          if (e.level >= 50 || e.level === "error") errors.push((e.err?.message ?? e.msg ?? "").split("\n")[0]);
        } catch {}
      }
      console.error(errors.length ? [...new Set(errors)].slice(-5).join("\n") : "(none logged)");
    ' "$home/daemon.log" || true
  fi
  paseo daemon stop --home "$home" >/dev/null 2>&1 || true
  rm -rf "$work"
  exit "$rc"
}
trap cleanup EXIT

step() { printf '\n==> %s\n' "$1"; }

sha="$(git rev-parse HEAD)"
step "Clean clone of $sha"
git clone --quiet "$repo" "$work/src"
git -C "$work/src" checkout --quiet -B verify-install "$sha"

step "npm ci, typecheck, tests"
(
  cd "$work/src"
  npm ci --ignore-scripts --silent
  npm run --silent typecheck
  npx vitest run
)

id="$(node -p 'require(process.argv[1]).id' "$work/src/paseo-plugin.json")"

step "Package contents"
(cd "$work/src" && npm pack --dry-run --ignore-scripts 2>&1 | grep -E "paseo-plugin.json|OVERVIEW.md|total files")

step "Throwaway daemon"
port="$(node -e 'const s=require("net").createServer().listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')"
cat > "$home/config.json" <<EOF
{
  "version": 1,
  "daemon": {
    "listen": "127.0.0.1:$port",
    "relay": { "enabled": false },
    "mcp": { "injectIntoAgents": false }
  },
  "pluginsEnabled": true,
  "features": {
    "dictation": { "enabled": false },
    "voiceMode": { "enabled": false },
    "webUi": { "enabled": false }
  }
}
EOF
paseo daemon start --home "$home" --timeout 120 >/dev/null

step "Install $sha from Git"
paseo plugin add "file://$work/src" --ref "$sha" --home "$home" >/dev/null
info="$(paseo plugin ls --home "$home" --json)"

echo "$info" | node -e '
  const [sha, id] = process.argv.slice(1);
  const list = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const p = list.find((x) => x.id === id);
  const fail = (m) => { console.error("FAIL: " + m); process.exit(1); };
  if (!p) fail("plugin " + id + " missing after install");
  if (p.status !== "running") fail("status is " + p.status + (p.error ? ": " + p.error : ""));
  if (p.error) fail(p.error);
  if (p.installation?.currentRevision !== sha) fail("installed revision is " + p.installation?.currentRevision);
  console.log(id + " running at " + sha);
' "$sha" "$id"

step "Plugin log"
logs="$(paseo plugin logs "$id" --home "$home" 2>&1)"
echo "$logs" | tail -5
echo "$logs" | grep -q "Plugin ready" || { echo "FAIL: plugin never reported ready" >&2; exit 1; }

printf '\nOK: %s installs and starts\n' "$sha"
