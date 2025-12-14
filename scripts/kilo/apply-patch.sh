#!/usr/bin/env bash
set -euo pipefail

cat <<'USAGE'
MVP1 stub: apply-patch

Intended usage:
  scripts/kilo/apply-patch.sh \
    --proposal .kilocode/evolution/proposals/<id>-<slug>.md \
    --applied  .kilocode/evolution/applied/<id>-<slug>.md

Concept:
- Apply the approved Evolution Layer patch
- Write an applied record referencing the proposal

This script is a placeholder and does not run anything yet.
USAGE

exit 2
