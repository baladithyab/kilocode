# Project Evolution Layer (MVP1 bootstrap)

This directory is the **project-local Evolution Layer**: a set of **versioned**, **audit-friendly** artifacts that define how Kilo Code agents should operate in this repository.

MVP1 is intentionally governance-first: it provides structure, templates, and restrictions, but does **not** implement a full TraceStore/PolicyEngine/CouncilRunner.

## Core principles

- **Local-first**: evolution artifacts live in this repo under `.kilocode/` and are reviewable in git.
- **Propose-and-apply**: changes to memory/skills/rubrics/policy should be proposed, reviewed, then applied as a traceable patch.
- **Auditability**: every applied change should have a proposal record + a small “applied record” describing what changed and why.
- **Least privilege**: “evolution” modes must have a narrow write-scope (see [`docs/kilo-profiles.md`](docs/kilo-profiles.md:1) and [`docs/llm-mode-map.yaml`](docs/llm-mode-map.yaml:1)).

## Canonical folders

- `rules/`: human-readable guardrails and governance rules.
- `memory/`: stable project memory (versioned, reviewed).
- `skills/`: reusable playbooks / skills that describe _how_ we do work here.
- `rubrics/`: evaluation rubrics and scoring criteria.
- `traces/`: templates for trace capture and (optionally) local run outputs.
- `evals/`: evaluation definitions and (optionally) local run outputs.
- `evolution/`: the propose/apply workflow.
    - `evolution/proposals/`: proposals awaiting review.
    - `evolution/applied/`: immutable applied records (what was changed and which proposal it came from).

## What should (not) be committed

- **Commit** governance artifacts (docs, rules, rubrics, skills, proposals, applied records).
- **Do not commit** large generated artifacts (eval runs, trace logs). Those are ignored by git via root ignore rules and per-folder `.gitignore` files.
