import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile, chmod } from "node:fs/promises"
import * as path from "node:path"

export type EvolutionBootstrapCreateItem = {
	path: string
	kind: "file"
}

export type EvolutionBootstrapSkippedItem = {
	path: string
	reason: string
}

export type EvolutionBootstrapPlan = {
	projectRoot: string
	toCreate: EvolutionBootstrapCreateItem[]
	skipped: EvolutionBootstrapSkippedItem[]
	suggestions: string[]
}

const EVOLUTION_GITIGNORE_ENTRIES = [".kilocode/traces/runs/", ".kilocode/evals/runs/"] as const

const GENERATED_TEMPLATES: Record<string, string> = {
	".gitignore": `# Evolution Layer generated artifacts (keep committed governance artifacts tracked)\n.kilocode/traces/runs/\n.kilocode/evals/runs/\n`,
	".kilocodemodes": `{
\t"customModes": [
\t\t{
\t\t\t"slug": "context-manager",
\t\t\t"name": "Context Manager",
\t\t\t"roleDefinition": "You are Kilo Code, a project context and governance specialist. Your responsibility is to maintain the project’s Evolution Layer artifacts (memory, skills, rubrics, governance docs) in a local-first, auditable, least-privilege way. You must not modify runtime/product code.",
\t\t\t"groups": [
\t\t\t\t"read",
\t\t\t\t"command",
\t\t\t\t[
\t\t\t\t\t"edit",
\t\t\t\t\t{
\t\t\t\t\t\t"fileRegex": "(^docs/.*|\\\\.kilocode/(memory|skills|rubrics|evolution|rules)/.*|\\\\.kilocode/mcp\\\\.json$)",
\t\t\t\t\t\t"description": "Evolution Layer surfaces only (docs + .kilocode governance artifacts)"
\t\t\t\t\t}
\t\t\t\t]
\t\t\t],
\t\t\t"customInstructions": "Governance requirements:\n- Local-first: treat .kilocode/ and docs/ as canonical\n- Propose-and-apply: prefer .kilocode/evolution/proposals/ and .kilocode/evolution/applied/\n- Auditability: document intent/scope/risks and verification\n- Least privilege: do not edit outside the allowed write-scope"
\t\t},
\t\t{
\t\t\t"slug": "eval-engineer",
\t\t\t"name": "Eval Engineer",
\t\t\t"roleDefinition": "You are Kilo Code, an evaluation engineer focused on designing rubrics, eval definitions, and trace templates. You must keep generated outputs out of git and avoid modifying runtime/product code.",
\t\t\t"groups": [
\t\t\t\t"read",
\t\t\t\t"command",
\t\t\t\t[
\t\t\t\t\t"edit",
\t\t\t\t\t{
\t\t\t\t\t\t"fileRegex": "(^docs/.*|\\\\.kilocode/(rubrics|evolution|rules)/.*|\\\\.kilocode/(evals|traces)/(?!runs/).*|\\\\.kilocode/mcp\\\\.json$)",
\t\t\t\t\t\t"description": "Evolution Layer eval surfaces (excludes trace/eval runs)"
\t\t\t\t\t}
\t\t\t\t]
\t\t\t],
\t\t\t"customInstructions": "Evaluation requirements:\n- Keep generated outputs under .kilocode/evals/runs/ and .kilocode/traces/runs/ (ignored)\n- Define scoring criteria under .kilocode/rubrics/\n- Use propose-and-apply for rubric/eval changes\n- Do not edit product/runtime code"
\t\t}
\t]
}\n`,
}

const CANONICAL_TEMPLATES: Record<string, string> = {
	".kilocode/README.md": `# Project Evolution Layer (MVP1 bootstrap)

This directory is the **project-local Evolution Layer**: a set of **versioned**, **audit-friendly** artifacts that define how Kilo Code agents should operate in this repository.

MVP1 is intentionally governance-first: it provides structure, templates, and restrictions, but does **not** implement a full TraceStore/PolicyEngine/CouncilRunner.

## Core principles

- **Local-first**: evolution artifacts live in this repo under \`.kilocode/\` and are reviewable in git.
- **Propose-and-apply**: changes to memory/skills/rubrics/policy should be proposed, reviewed, then applied as a traceable patch.
- **Auditability**: every applied change should have a proposal record + a small “applied record” describing what changed and why.
- **Least privilege**: “evolution” modes must have a narrow write-scope (see [\`docs/kilo-profiles.md\`](docs/kilo-profiles.md:1) and [\`docs/llm-mode-map.yaml\`](docs/llm-mode-map.yaml:1)).

## Canonical folders

- \`rules/\`: human-readable guardrails and governance rules.
- \`memory/\`: stable project memory (versioned, reviewed).
- \`skills/\`: reusable playbooks / skills that describe _how_ we do work here.
- \`rubrics/\`: evaluation rubrics and scoring criteria.
- \`traces/\`: templates for trace capture and (optionally) local run outputs.
- \`evals/\`: evaluation definitions and (optionally) local run outputs.
- \`evolution/\`: the propose/apply workflow.
    - \`evolution/proposals/\`: proposals awaiting review.
    - \`evolution/applied/\`: immutable applied records (what was changed and which proposal it came from).

## What should (not) be committed

- **Commit** governance artifacts (docs, rules, rubrics, skills, proposals, applied records).
- **Do not commit** large generated artifacts (eval runs, trace logs). Those are ignored by git via root ignore rules and per-folder \`.gitignore\` files.
`,
	".kilocode/rules/evolution-layer.md": `# Evolution Layer Governance (MVP1)

This document defines **how the project evolves** its local memory, skills, rubrics, and policy artifacts.

> This file is additive. It does **not** replace existing rules in [\`rules.md\`](.kilocode/rules/rules.md:1).

## Principles

1. **Local-first**

    - The canonical source of project governance is committed under \`.kilocode/\` and \`docs/\`.
    - Avoid depending on external state for decisions (links are allowed; state must be captured in-repo).

2. **Propose-and-apply**

    - Any change to Evolution Layer artifacts should be made via a proposal in:
        - \`.kilocode/evolution/proposals/\`
    - After review/approval, apply the change and add an applied record in:
        - \`.kilocode/evolution/applied/\`

3. **Auditability
   ** - Proposals must include: intent, scope, risks, and the exact files to change.

    - Applied records must include: proposal reference, patch summary, and verification notes.

4. **Least privilege**
    - “Evolution” modes are allowed to edit **only** Evolution Layer surfaces.
    - They must not modify application/runtime code, build pipelines, or dependency manifests.

## Allowed write-scope (Evolution Layer surfaces)

The following paths are the **allowed** write-scope for Evolution Layer work:

- \`.kilocode/memory/**\`
- \`.kilocode/skills/**\`
- \`.kilocode/rubrics/**\`
- \`.kilocode/evolution/**\`
- \`.kilocode/rules/**\` (governance docs only; avoid altering existing rules without explicit reason)
- \`.kilocode/mcp.json\`
- \`docs/**\` (governance docs)

The following are **not** within scope for Evolution Layer modes:

- \`src/**\`, \`packages/**\`, \`apps/**\`, \`webview-ui/**\` (product/code)
- \`package.json\`, \`pnpm-lock.yaml\`, \`turbo.json\` (build/deps)
- \`.github/**\` (CI/CD)

## Generated artifacts

- Trace/eval outputs should be written under:
    - \`.kilocode/traces/runs/\`
    - \`.kilocode/evals/runs/\`
- These directories are intentionally ignored by git to prevent committing large logs.
`,
	".kilocode/memory/README.md": `# Memory Bank

This folder contains **project memory** that should remain stable across tasks and contributors.

## What belongs here

- Architecture decisions and invariants
- Known constraints (security, performance, compliance)
- Vocabulary / domain glossary
- Operational knowledge that is hard to infer from code

## What does NOT belong here

- Large logs, trace dumps, or evaluation run outputs
- Secrets / API keys / credentials

## Change policy

Treat memory as versioned documentation:

- Prefer changes via the propose/apply workflow in [\`../evolution/\`](.kilocode/evolution/README.md:1)
- Keep entries concise and sourceable (link to PRs, issues, or code paths where relevant)
`,
	".kilocode/skills/README.md": `# Skills

Skills are reusable, repo-specific playbooks that describe _how to do work here_.

A skill should be:

- **Actionable**: steps, checklists, and concrete examples
- **Scoped**: focused on one workflow or capability
- **Auditable**: references to relevant code paths and constraints

## Suggested structure

- Problem statement
- Preconditions / required context
- Steps
- Safety checks (what must not happen)
- Verification

## Change policy

Skills changes should generally go through the propose/apply workflow in [\`../evolution/\`](.kilocode/evolution/README.md:1).
`,
	".kilocode/rubrics/README.md": `# Rubrics

Rubrics define **how we evaluate** agent outputs and changes.

Keep rubrics:

- **Observable** (based on artifacts/tests)
- **Specific** (avoid vague language)
- **Reusable** across tasks

## MVP1

MVP1 focuses on:

- Governance compliance (least privilege, propose/apply)
- Documentation quality (local-first, auditability)
- Safety (no secrets, no destructive edits)
`,
	".kilocode/traces/README.md": `# Traces

Traces are structured records of agent work used for debugging and evaluation.

## Intended layout

- \`runs/\`: **local run outputs** (ignored by git)
- Everything else: trace schemas/templates and lightweight docs (tracked)

## Notes

- Do not store secrets in traces.
- Keep run outputs out of git; use [\`runs/.gitignore\`](.kilocode/traces/runs/.gitignore:1).
`,
	".kilocode/traces/runs/.gitignore": `# Generated trace run outputs (keep out of git)
*
!.gitignore
`,
	".kilocode/evals/README.md": `# Evals

This folder contains evaluation definitions and supporting documents.

## Intended layout

- \`runs/\`: **local evaluation runs** (ignored by git)
- Everything else: eval definitions, fixtures, and lightweight documentation (tracked)

## MVP1

MVP1 does not implement an eval runner here; it only establishes a stable place for eval definitions and run outputs.
`,
	".kilocode/evals/runs/.gitignore": `# Generated evaluation run outputs (keep out of git)
*
!.gitignore
`,
	".kilocode/evolution/README.md": `# Evolution workflow

This folder implements the MVP1 **propose-and-apply** workflow.

## Workflow

1. **Create a proposal** under [\`proposals/\`](.kilocode/evolution/proposals/README.md:1)
    - Describe intent, scope, risks, and the exact files to change.
2. **Review** (LLM Council or maintainers)
    - Ensure least-privilege scope and no forbidden surfaces are touched.
3. **Apply the change**
    - Make the edits to the allowed surfaces.
4. **Record the application** under [\`applied/\`](.kilocode/evolution/applied/README.md:1)
    - Reference the proposal and summarize what was changed and how it was verified.

## Notes

- Proposals and applied records are **git-tracked** for auditability.
- Large generated artifacts belong in \`.kilocode/traces/runs/\` and \`.kilocode/evals/runs/\` and are ignored.
`,
	".kilocode/evolution/proposals/README.md": `# Evolution Proposals

Create one markdown file per proposal.

## Naming

Use a monotonically increasing prefix for easy audit, e.g.

- \`0001-add-rubric-foo.md\`
- \`0002-update-skill-bar.md\`

## Required sections

- **Intent**: what problem are we solving and why now?
- **Scope**: exact directories/files to change
- **Risks**: what could go wrong? safety considerations?
- **Patch plan**: step-by-step change list
- **Verification**: how do we know this is correct?

Use [\`0000-template.md\`](.kilocode/evolution/proposals/0000-template.md:1) as a starting point.
`,
	".kilocode/evolution/proposals/0000-template.md": `# Proposal: <title>

## Intent

Describe the desired outcome and why it matters.

## Scope

List the exact files/paths to be changed.

- Files to change:
    - \`...\`

## Risks

- Safety risks:
- Compatibility risks:
- Governance risks:

## Patch plan

1. ...
2. ...

## Verification

- What checks/tests/docs review will be performed?
- What artifacts prove success?

## Rollback

- How to revert if needed.
`,
	".kilocode/evolution/applied/README.md": `# Applied Records

Each applied record is an immutable note describing an Evolution Layer change that has been applied.

## Naming

Match the proposal ID when possible:

- Proposal: \`0007-add-rubric-x.md\`
- Applied: \`0007-add-rubric-x.md\`

## Required content

- Proposal reference (file path + commit hash when available)
- Patch summary (what changed)
- Verification notes

Use [\`0000-template.md\`](.kilocode/evolution/applied/0000-template.md:1) as a starting point.
`,
	".kilocode/evolution/applied/0000-template.md": `# Applied: <title>

## Proposal reference

- Proposal: \`.kilocode/evolution/proposals/<id>-<slug>.md\`
- Proposal commit: \`<sha>\`

## Patch summary

- Files changed:
    - \`...\`

## Verification notes

- Manual checks performed:
- Automated checks performed:

## Rollback notes

- How to revert if needed.
`,
	".kilocode/mcp.json": `{
	"mcpServers": {}
}
`,
	"docs/kilo-profiles.md": `# Kilo profiles (MVP1)

This document describes the **governance-focused** agent profiles used for the Project Evolution Layer.

> Note: tool availability and edit permissions are enforced via [\`/.kilocodemodes\`](.kilocodemodes:1).

## Core principles (applies to all profiles)

- **Local-first**: treat \`.kilocode/\` + \`docs/\` as the canonical state.
- **Propose-and-apply**: for Evolution Layer changes, prefer the workflow in [\`../.kilocode/evolution/\`](.kilocode/evolution/README.md:1).
- **Auditability**: changes should be easy to review and trace to a proposal.
- **Least privilege**: do not edit outside the Evolution Layer write-scope.

## Evolution Layer write-scope

Allowed:

- \`.kilocode/memory/**\`
- \`.kilocode/skills/**\`
- \`.kilocode/rubrics/**\`
- \`.kilocode/evolution/**\`
- \`.kilocode/rules/**\` (governance docs only)
- \`.kilocode/mcp.json\`
- \`docs/**\`

Not allowed:

- Product/runtime code (\`src/**\`, \`packages/**\`, \`apps/**\`, \`webview-ui/**\`)
- Dependency/build manifests (\`package.json\`, lockfiles, \`turbo.json\`)
- CI/CD (\`.github/**\`)

## Profiles

### \`context-manager\`

**Goal:** maintain coherent project memory/skills/governance.

**Typical outputs:**

- Memory updates under [\`.kilocode/memory/\`](.kilocode/memory/README.md:1)
- Skill playbooks under [\`.kilocode/skills/\`](.kilocode/skills/README.md:1)
- Governance docs under [\`.kilocode/rules/\`](.kilocode/rules/evolution-layer.md:1)
- Proposals / applied records under [\`.kilocode/evolution/\`](.kilocode/evolution/README.md:1)

**Non-goals:** implementing features in \`src/**\`.

### \`eval-engineer\`

**Goal:** define and maintain eval/rubric/trace templates.

**Typical outputs:**

- Rubrics under [\`.kilocode/rubrics/\`](.kilocode/rubrics/README.md:1)
- Eval definitions under [\`.kilocode/evals/\`](.kilocode/evals/README.md:1)
- Trace templates under [\`.kilocode/traces/\`](.kilocode/traces/README.md:1)

**Important:** eval/trace **run outputs** belong under \`*/runs/\` and are ignored by git.

### Existing repo modes

This repo already defines other modes (for example \`translate\` and \`test\`) in [\`/.kilocodemodes\`](.kilocodemodes:1). MVP1 adds Evolution Layer profiles without removing or modifying those existing roles.
`,
	"docs/llm-council.md": `# LLM Council (MVP1)

The “LLM Council” is a lightweight governance practice for reviewing Evolution Layer changes.

MVP1 goal: ensure Evolution Layer artifacts remain **local-first**, **auditable**, and **least-privilege**.

## Council scope

Council reviews are required for changes to the Evolution Layer surfaces:

- \`.kilocode/memory/**\`
- \`.kilocode/skills/**\`
- \`.kilocode/rubrics/**\`
- \`.kilocode/evolution/**\`
- \`.kilocode/rules/**\`
- \`.kilocode/mcp.json\`
- \`docs/**\`

Council reviews are **not** a substitute for normal code review of runtime/product changes.

## Workflow

1. **Proposal authored**
    - Add a proposal file under [\`../.kilocode/evolution/proposals/\`](.kilocode/evolution/proposals/README.md:1).
2. **Council review**
    - Validate scope, safety, and consistency with principles.
3. **Apply change**
    - Make the described edits.
4. **Applied record**
    - Add an applied record under [\`../.kilocode/evolution/applied/\`](.kilocode/evolution/applied/README.md:1) with verification notes.

## Review checklist

### Governance

- [ ] Change stays within the allowed write-scope (least privilege)
- [ ] Proposal includes intent, scope, risks, and verification
- [ ] Applied record references the proposal and captures verification notes

### Safety

- [ ] No secrets or credentials
- [ ] No large generated artifacts committed (traces/eval runs remain ignored)

### Quality

- [ ] Documentation is clear, concise, and linked to relevant code paths
- [ ] Rubrics/skills are actionable and unambiguous

## Escalation

If a change needs to touch forbidden surfaces (e.g., \`src/**\`), it must be handled via the normal engineering process, outside of the Evolution Layer bootstrap workflow.
`,
	"docs/llm-mode-map.yaml": `version: 1
purpose: >-
  Map common task types to recommended Kilo Code modes and encode MVP1 Evolution Layer
  write-scope constraints.

evolution_layer:
  principles:
    - local-first
    - propose-and-apply
    - auditability
    - least-privilege

  allowed_write_scope:
    - .kilocode/memory/**
    - .kilocode/skills/**
    - .kilocode/rubrics/**
    - .kilocode/evolution/**
    - .kilocode/rules/**
    - .kilocode/mcp.json
    - docs/**

  forbidden_write_scope:
    - src/**
    - packages/**
    - apps/**
    - webview-ui/**
    - .github/**
    - package.json
    - pnpm-lock.yaml
    - turbo.json

modes:
  context-manager:
    primary_tasks:
      - maintain project memory
      - curate and refactor skills/playbooks
      - author evolution proposals and applied records
      - update governance documentation
    write_scope: evolution_layer.allowed_write_scope

  eval-engineer:
    primary_tasks:
      - define rubrics
      - create eval definitions/templates
      - define trace schemas/templates
      - run evals locally (outputs go to ignored runs/ folders)
    write_scope: evolution_layer.allowed_write_scope

routing:
  - when: "task is about repo-local memory, skills, or governance"
    use: context-manager
  - when: "task is about scoring, evals, traces, measurement"
    use: eval-engineer
  - when: "task is about translations under src/i18n/locales or src/package.nls*.json"
    use: translate
  - when: "task is about tests"
    use: test
`,
	"scripts/kilo/README.md": `# scripts/kilo (MVP1 stubs)

This directory contains **placeholder** scripts that outline intended CLI-style workflows for the Evolution Layer.

MVP1 intentionally does not implement heavy logic; these scripts currently:

- Document expected arguments
- Print guidance
- Exit non-zero to avoid accidental use in automation

## Intended commands

- [\`run-task.sh\`](scripts/kilo/run-task.sh:1): run an agent task with a chosen profile
- [\`run-ab.sh\`](scripts/kilo/run-ab.sh:1): run a lightweight A/B comparison
- [\`council-review.sh\`](scripts/kilo/council-review.sh:1): council checklist review helper
- [\`compile-patch.sh\`](scripts/kilo/compile-patch.sh:1): compile proposal -> patch plan
- [\`apply-patch.sh\`](scripts/kilo/apply-patch.sh:1): apply an approved patch and write an applied record
`,
	"scripts/kilo/run-task.sh": `#!/usr/bin/env bash
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
`,
	"scripts/kilo/run-ab.sh": `#!/usr/bin/env bash
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
`,
	"scripts/kilo/council-review.sh": `#!/usr/bin/env bash
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
`,
	"scripts/kilo/compile-patch.sh": `#!/usr/bin/env bash
set -euo pipefail

cat <<'USAGE'
MVP1 stub: compile-patch

Intended usage:
  scripts/kilo/compile-patch.sh \
    --proposal .kilocode/evolution/proposals/<id>-<slug>.md \
    --out .kilocode/traces/runs/<timestamp>/patch-plan.json

Concept:
- Parse proposal -> produce a concrete patch plan (file list + intended edits)
- Store generated plans under .kilocode/traces/runs/ (git-ignored)

This script is a placeholder and does not run anything yet.
USAGE

exit 2
`,
	"scripts/kilo/apply-patch.sh": `#!/usr/bin/env bash
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
`,
}

function resolveInProject(projectRoot: string, relativePath: string): string {
	// The template paths are posix-style; split them to avoid issues on Windows.
	return path.resolve(projectRoot, ...relativePath.split("/"))
}

function isShScript(relativePath: string): boolean {
	return relativePath.startsWith("scripts/") && relativePath.endsWith(".sh")
}

async function readIfExists(absolutePath: string): Promise<string | undefined> {
	try {
		const buf = await readFile(absolutePath)
		return buf.toString("utf-8")
	} catch {
		return undefined
	}
}

function getTemplateContent(relativePath: string): string | undefined {
	return CANONICAL_TEMPLATES[relativePath] ?? GENERATED_TEMPLATES[relativePath]
}

function getAllBootstrapTargetPaths(): string[] {
	return [...Object.keys(CANONICAL_TEMPLATES), ...Object.keys(GENERATED_TEMPLATES)]
}

export async function planEvolutionBootstrap({
	projectRoot,
}: {
	projectRoot: string
}): Promise<EvolutionBootstrapPlan> {
	const toCreate: EvolutionBootstrapCreateItem[] = []
	const skipped: EvolutionBootstrapSkippedItem[] = []
	const suggestions: string[] = []

	const targetPaths = getAllBootstrapTargetPaths()

	for (const relPath of targetPaths) {
		const abs = resolveInProject(projectRoot, relPath)

		if (existsSync(abs)) {
			let reason = "File already exists"
			if (relPath === ".gitignore") {
				reason = "File already exists (will not modify)"
			} else if (relPath === ".kilocodemodes") {
				reason = "File already exists (will not modify)"
			}
			skipped.push({ path: relPath, reason })
			continue
		}

		toCreate.push({ path: relPath, kind: "file" })
	}

	// Suggestions (do not modify existing files)
	{
		const gitignorePath = resolveInProject(projectRoot, ".gitignore")
		const gitignore = await readIfExists(gitignorePath)
		if (gitignore !== undefined) {
			const missing = EVOLUTION_GITIGNORE_ENTRIES.filter((entry) => !gitignore.includes(entry))
			if (missing.length > 0) {
				suggestions.push(
					[
						".gitignore already exists. Consider adding these entries to keep generated outputs out of git:",
						...missing.map((e) => `- ${e}`),
					].join("\n"),
				)
			}
		}
	}

	{
		const modesPath = resolveInProject(projectRoot, ".kilocodemodes")
		const modesRaw = await readIfExists(modesPath)
		if (modesRaw !== undefined) {
			try {
				const parsed = JSON.parse(modesRaw) as unknown
				const customModes =
					parsed && typeof parsed === "object" && "customModes" in (parsed as any)
						? ((parsed as any).customModes as unknown)
						: undefined

				const slugs = Array.isArray(customModes)
					? customModes
							.map((m) =>
								m && typeof m === "object" && "slug" in (m as any) ? String((m as any).slug) : "",
							)
							.filter(Boolean)
					: []

				const missing = ["context-manager", "eval-engineer"].filter((slug) => !slugs.includes(slug))
				if (missing.length > 0) {
					suggestions.push(
						[
							".kilocodemodes already exists. Ensure it defines restricted Evolution Layer modes:",
							...missing.map((slug) => `- ${slug}`),
						].join("\n"),
					)
				}
			} catch {
				suggestions.push(
					".kilocodemodes already exists but could not be parsed as JSON. Verify it defines restricted Evolution Layer modes (context-manager, eval-engineer).",
				)
			}
		}
	}

	return {
		projectRoot,
		toCreate,
		skipped,
		suggestions,
	}
}

export async function applyEvolutionBootstrap(plan: EvolutionBootstrapPlan): Promise<{ created: string[] }> {
	const created: string[] = []

	for (const item of plan.toCreate) {
		const relPath = item.path
		const abs = resolveInProject(plan.projectRoot, relPath)

		// Create-missing-only: re-check at write time.
		if (existsSync(abs)) {
			continue
		}

		const content = getTemplateContent(relPath)
		if (content === undefined) {
			throw new Error(`No template registered for ${relPath}`)
		}

		await mkdir(path.dirname(abs), { recursive: true })
		await writeFile(abs, content, { encoding: "utf-8" })

		if (isShScript(relPath)) {
			try {
				await chmod(abs, 0o755)
			} catch {
				// Best-effort; ignore chmod failures on non-POSIX filesystems.
			}
		}

		created.push(relPath)
	}

	return { created }
}
