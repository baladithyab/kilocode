#!/usr/bin/env bash
set -euo pipefail

cat <<'USAGE'
MVP1 stub: run-task

Intended usage:
  scripts/kilo/run-task.sh --mode <context-manager|eval-engineer|...> --prompt <text>

Notes:
- Evolution Layer edits must stay within the allowed write-scope documented in:
  - docs/kilo-profiles.md
  - docs/llm-mode-map.yaml
- If the task changes Evolution Layer artifacts, open a proposal first:
  .kilocode/evolution/proposals/<id>-<slug>.md

This script is a placeholder and does not run anything yet.
USAGE

exit 2
