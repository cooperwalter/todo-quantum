#!/usr/bin/env bash
# lens-run.sh — the way to start an autonomous quantum-lens run.
# Enforces the plan lint (DAG validity, file-disjoint parallelism, evidence on every task,
# visual gate on UI stories) BEFORE handing off to quantum-loop. All args pass through.
#
#   ./lens-run.sh --parallel --max-parallel 4 --max-iterations 20
set -euo pipefail

[[ -f quantum.json ]] || { echo "No quantum.json — run /ql-plan first."; exit 1; }

echo "==> plan-lint (strict)"
if ! node verification/lens-plan-lint.mjs quantum.json --strict; then
  echo
  echo "Plan lint failed. Fix the issues above (see PLAN-CHECKLIST.md) before running the loop."
  echo "If a warning is intentional, run quantum-loop directly: ./quantum-loop.sh $*"
  exit 1
fi

echo "==> starting loop: ./quantum-loop.sh $*"
exec ./quantum-loop.sh "$@"
