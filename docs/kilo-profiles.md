# Kilo profiles (MVP1)

This document describes the **governance-focused** agent profiles used for the Project Evolution Layer.

> Note: tool availability and edit permissions are enforced via [`/.kilocodemodes`](.kilocodemodes:1).

## Core principles (applies to all profiles)

- **Local-first**: treat `.kilocode/` + `docs/` as the canonical state.
- **Propose-and-apply**: for Evolution Layer changes, prefer the workflow in [`../.kilocode/evolution/`](.kilocode/evolution/README.md:1).
- **Auditability**: changes should be easy to review and trace to a proposal.
- **Least privilege**: do not edit outside the Evolution Layer write-scope.

## Evolution Layer write-scope

Allowed:

- `.kilocode/memory/**`
- `.kilocode/skills/**`
- `.kilocode/rubrics/**`
- `.kilocode/evolution/**`
- `.kilocode/rules/**` (governance docs only)
- `.kilocode/mcp.json`
- `docs/**`

Not allowed:

- Product/runtime code (`src/**`, `packages/**`, `apps/**`, `webview-ui/**`)
- Dependency/build manifests (`package.json`, lockfiles, `turbo.json`)
- CI/CD (`.github/**`)

## Profiles

### `context-manager`

**Goal:** maintain coherent project memory/skills/governance.

**Typical outputs:**

- Memory updates under [`.kilocode/memory/`](.kilocode/memory/README.md:1)
- Skill playbooks under [`.kilocode/skills/`](.kilocode/skills/README.md:1)
- Governance docs under [`.kilocode/rules/`](.kilocode/rules/evolution-layer.md:1)
- Proposals / applied records under [`.kilocode/evolution/`](.kilocode/evolution/README.md:1)

**Non-goals:** implementing features in `src/**`.

### `eval-engineer`

**Goal:** define and maintain eval/rubric/trace templates.

**Typical outputs:**

- Rubrics under [`.kilocode/rubrics/`](.kilocode/rubrics/README.md:1)
- Eval definitions under [`.kilocode/evals/`](.kilocode/evals/README.md:1)
- Trace templates under [`.kilocode/traces/`](.kilocode/traces/README.md:1)

**Important:** eval/trace **run outputs** belong under `*/runs/` and are ignored by git.

### Existing repo modes

This repo already defines other modes (for example `translate` and `test`) in [`/.kilocodemodes`](.kilocodemodes:1). MVP1 adds Evolution Layer profiles without removing or modifying those existing roles.
