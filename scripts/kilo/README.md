# scripts/kilo (MVP1 stubs)

This directory contains **placeholder** scripts that outline intended CLI-style workflows for the Evolution Layer.

MVP1 intentionally does not implement heavy logic; these scripts currently:

- Document expected arguments
- Print guidance
- Exit non-zero to avoid accidental use in automation

## Intended commands

- [`run-task.sh`](scripts/kilo/run-task.sh:1): run an agent task with a chosen profile
- [`run-ab.sh`](scripts/kilo/run-ab.sh:1): run a lightweight A/B comparison
- [`council-review.sh`](scripts/kilo/council-review.sh:1): council checklist review helper
- [`compile-patch.sh`](scripts/kilo/compile-patch.sh:1): compile proposal -> patch plan
- [`apply-patch.sh`](scripts/kilo/apply-patch.sh:1): apply an approved patch and write an applied record
