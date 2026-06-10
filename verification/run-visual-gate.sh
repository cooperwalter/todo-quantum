#!/usr/bin/env bash
# verification/run-visual-gate.sh <route>
# Single pass/fail visual gate. Exit 0 = all visual criteria met. Non-zero = fail.
# Prints fresh, full output so quantum-loop's Iron Law has real evidence.
set -uo pipefail

ROUTE="${1:-/}"
CFG="lens.config.json"
[[ -f "$CFG" ]] || { echo "FAIL: $CFG not found (run from project root)"; exit 2; }

enabled="$(node -e 'console.log(require("./'"$CFG"'").visual.enabled)')"
if [[ "$enabled" != "true" ]]; then
  echo "SKIP: visual gate disabled in $CFG (non-UI stack)"; exit 0
fi

BASE_URL="$(node -e 'console.log(require("./'"$CFG"'").baseUrl)')"
DEV_CMD="$(node -e 'console.log(require("./'"$CFG"'").devServer)')"
REG_CMD="$(node -e 'const g=require("./'"$CFG"'").gates; console.log(g["visual.regression"]||"")')"
A11Y_CMD="$(node -e 'const g=require("./'"$CFG"'").gates; console.log(g["visual.a11y"]||"")')"
LH_CMD="$(node -e 'const g=require("./'"$CFG"'").gates; console.log(g["visual.lighthouse"]||"")')"

export QL_ROUTE="$ROUTE"           # consumed by the .spec.ts files
export QL_BASE_URL="$BASE_URL"

# Server lifecycle is owned by playwright.config.ts webServer (strictPort,
# reuseExistingServer: false) and by lhci's startServerCommand — the script
# must NOT pre-start one. A pre-started or stale server on the port means the
# gates "verify" code that isn't under review (deep-review finding M10); the
# strict config now fails loudly instead.
if curl -fsS --max-time 2 "$BASE_URL" >/dev/null 2>&1; then
  echo "FAIL: something is already serving $BASE_URL — stop it so the gate can start a fresh server ($DEV_CMD)"
  exit 2
fi

fail=0
run() { # label, command
  local label="$1" cmd="$2"
  [[ -z "$cmd" ]] && { echo "==> $label: skipped (no command)"; return; }
  echo "==================================================================="
  echo "==> $label  (route=$ROUTE)"
  echo "    \$ $cmd"
  if bash -c "$cmd"; then echo "==> $label: PASS"; else echo "==> $label: FAIL"; fail=1; fi
}

run "visual-regression" "$REG_CMD"
run "accessibility"     "$A11Y_CMD"
run "lighthouse"        "$LH_CMD"

echo "==================================================================="
if [[ "$fail" -eq 0 ]]; then
  echo "VISUAL GATE: PASS  (route=$ROUTE)"; exit 0
else
  echo "VISUAL GATE: FAIL  (route=$ROUTE) — see output above"; exit 1
fi
