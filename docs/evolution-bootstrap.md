# Evolution Layer Bootstrap

This document describes the Evolution Layer “bootstrap” flow: a safe, idempotent way to scaffold the canonical governance artifacts (under `.kilocode/` and `docs/`) and establish restricted Evolution Layer modes.

Bootstrap is designed for two cases:

- **New repo**: no existing Kilo Code / Evolution Layer artifacts.
- **Existing repo**: a repo that may already contain some Kilo Code artifacts (for example [`.kilocodemodes`](.kilocodemodes:1) or `docs/` governance files). Bootstrap should auto-discover what exists and only create what’s missing.

## Core properties

- **Create-missing-only**: never overwrites existing files.
- **Idempotent**: running bootstrap repeatedly should converge to “nothing to do”.
- **Transparent**: surfaces a plan (create vs skip) plus suggestions for follow-up steps.

The shared implementation is:

- Planner: [`planEvolutionBootstrap()`](src/shared/evolution/bootstrap.ts:700)
- Applier: [`applyEvolutionBootstrap()`](src/shared/evolution/bootstrap.ts:789)

## What bootstrap creates

Bootstrap scaffolds a standard set of files.

### Canonical governance artifacts

These are intended to be **git-tracked**:

- `.kilocode/**` governance directory structure and templates
- [`docs/llm-council.md`](docs/llm-council.md:1)
- [`docs/llm-mode-map.yaml`](docs/llm-mode-map.yaml:1)
- [`docs/kilo-profiles.md`](docs/kilo-profiles.md:1)
- `scripts/kilo/**` workflow stubs (MVP1)

### Generated config templates

Bootstrap can also create these (if missing):

- `.kilocodemodes` (restricted Evolution Layer modes)
- `.gitignore` entries for local-only generated outputs (see next section)

## Existing-repo auto-discovery (bootstrap in a “non-empty” repo)

Bootstrap assumes you might be adopting Evolution Layer governance in a repo that already has some Kilo Code usage.

The planner will:

1. **Skip any existing files** (create-missing-only).
2. Emit **suggestions** instead of editing existing files.

Examples of auto-discovery guidance:

- If `.gitignore` already exists, bootstrap does not modify it, but suggests adding entries that keep run outputs out of git.
- If `.kilocodemodes` already exists, bootstrap does not overwrite it, but suggests ensuring it defines restricted Evolution Layer modes (for example `context-manager` and `eval-engineer`).

This is how “bootstrap an existing repo with auto-discovery functionality” works in practice: it avoids destructive edits, but still helps you converge by telling you what is missing.

## Follow-up steps after bootstrap

### 1) Sync council configuration to the mode map

Bootstrap creates the mode map (source of truth), but governance execution relies on `.kilocode/evolution/council.yaml`.

After bootstrap, run Mode Map Sync to align `docs/llm-mode-map.yaml` with `.kilocode/evolution/council.yaml`:

- See [`docs/evolution-mode-map-sync.md`](docs/evolution-mode-map-sync.md:1)

### 2) Keep large generated outputs out of git

Bootstrap’s standard ignores for local runs are:

- `.kilocode/traces/runs/`
- `.kilocode/evals/runs/`

These are enforced by per-folder ignore files (for example [`.kilocode/traces/runs/.gitignore`](.kilocode/traces/runs/.gitignore:1)), and bootstrap will also suggest root `.gitignore` entries when appropriate.
