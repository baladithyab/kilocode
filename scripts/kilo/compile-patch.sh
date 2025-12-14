#!/usr/bin/env bash
set -euo pipefail

cat <<'USAGE'
MVP1 stub: compile-patch

Intended usage:
  scripts/kilo/compile-patch.sh \
    --proposal .kilocode/evolution/proposals/<id>-<slug>.md \
    --out .kilocode/traces/runs/<timestamp>/patch-plan.json

Concept:
- Parse proposal -> produce a concrete patch plan (file list + intended edits)
- Store generated plans under .kilocode/traces/runs/ (git-ignored)

This script is a placeholder and does not run anything yet.
USAGE

exit 2
