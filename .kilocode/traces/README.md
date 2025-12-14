# Traces

Traces are structured records of agent work used for debugging and evaluation.

## Intended layout

- `runs/`: **local run outputs** (ignored by git)
- Everything else: trace schemas/templates and lightweight docs (tracked)

## Notes

- Do not store secrets in traces.
- Keep run outputs out of git; use [`runs/.gitignore`](.kilocode/traces/runs/.gitignore:1).
