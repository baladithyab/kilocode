# Evolution Layer Governance (MVP1)

This document defines **how the project evolves** its local memory, skills, rubrics, and policy artifacts.

> This file is additive. It does **not** replace existing rules in [`rules.md`](.kilocode/rules/rules.md:1).

## Principles

1. **Local-first**

    - The canonical source of project governance is committed under `.kilocode/` and `docs/`.
    - Avoid depending on external state for decisions (links are allowed; state must be captured in-repo).

2. **Propose-and-apply**

    - Any change to Evolution Layer artifacts should be made via a proposal in:
        - `.kilocode/evolution/proposals/`
    - After review/approval, apply the change and add an applied record in:
        - `.kilocode/evolution/applied/`

3. **Auditability
   ** - Proposals must include: intent, scope, risks, and the exact files to change.

    - Applied records must include: proposal reference, patch summary, and verification notes.

4. **Least privilege**
    - “Evolution” modes are allowed to edit **only** Evolution Layer surfaces.
    - They must not modify application/runtime code, build pipelines, or dependency manifests.

## Allowed write-scope (Evolution Layer surfaces)

The following paths are the **allowed** write-scope for Evolution Layer work:

- `.kilocode/memory/**`
- `.kilocode/skills/**`
- `.kilocode/rubrics/**`
- `.kilocode/evolution/**`
- `.kilocode/rules/**` (governance docs only; avoid altering existing rules without explicit reason)
- `.kilocode/mcp.json`
- `docs/**` (governance docs)

The following are **not** within scope for Evolution Layer modes:

- `src/**`, `packages/**`, `apps/**`, `webview-ui/**` (product/code)
- `package.json`, `pnpm-lock.yaml`, `turbo.json` (build/deps)
- `.github/**` (CI/CD)

## Generated artifacts

- Trace/eval outputs should be written under:
    - `.kilocode/traces/runs/`
    - `.kilocode/evals/runs/`
- These directories are intentionally ignored by git to prevent committing large logs.
