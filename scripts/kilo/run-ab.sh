#!/usr/bin/env bash
set -euo pipefail

cat <<'USAGE'
MVP1 stub: run-ab

Intended usage:
  scripts/kilo/run-ab.sh \
    --task "<task description>" \
    --a "<configuration A>" \
    --b "<configuration B>" \
    --out .kilocode/evals/runs/<timestamp>/

Notes:
- Outputs MUST go under .kilocode/evals/runs/ (git-ignored).
- Rubrics used for comparison should live under .kilocode/rubrics/ (git-tracked).

This script is a placeholder and does not run anything yet.
USAGE

exit 2
