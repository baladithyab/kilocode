#!/usr/bin/env bash
set -euo pipefail

cat <<'USAGE'
MVP1 stub: council-review

Intended usage:
  scripts/kilo/council-review.sh --proposal .kilocode/evolution/proposals/<id>-<slug>.md

Checklist:
- Verify proposal includes: intent, scope, risks, patch plan, verification
- Verify all file paths are within allowed write-scope:
  - .kilocode/memory/**
  - .kilocode/skills/**
  - .kilocode/rubrics/**
  - .kilocode/evolution/**
  - .kilocode/rules/**
  - .kilocode/mcp.json
  - docs/**
- Verify no generated artifacts are being committed:
  - .kilocode/traces/runs/**
  - .kilocode/evals/runs/**

Reference:
  docs/llm-council.md

This script is a placeholder and does not run anything yet.
USAGE

exit 2
