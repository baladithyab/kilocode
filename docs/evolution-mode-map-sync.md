# Evolution: Mode Map Sync

Mode Map Sync is an Evolution Layer utility that keeps **governance configuration** aligned across:

- Source of truth: [`docs/llm-mode-map.yaml`](docs/llm-mode-map.yaml:1)
- Target: `.kilocode/evolution/council.yaml` (used by the council runner)

It is intentionally **preview-first**, **non-destructive**, and **create-missing-only** when the target file does not yet exist.

## What is synchronized

Mode Map Sync only uses the `council.roles` mapping in [`docs/llm-mode-map.yaml`](docs/llm-mode-map.yaml:1):

```yaml
council:
    roles:
        governance:
            profile: context-manager
        evals:
            profile: eval-engineer
```

From that mapping, it ensures `.kilocode/evolution/council.yaml` has matching role `profile` values.

### Drift rules

Mode Map Sync computes drift and plans changes in [`planModeMapSync()`](src/shared/evolution/modeMapSync.ts:255).

- **Managed roles**: roles present in `docs/llm-mode-map.yaml:council.roles`
- **Unmanaged roles**: roles present in `.kilocode/evolution/council.yaml` but **not** present in the mode map

Changes are limited to:

- `update-profile`: update `roles.<role>.profile` when it differs
- `add-role`: add `roles.<role>` if missing, using best-effort defaults for `rubricId` and `promptPath`

Unmanaged roles are preserved (no delete/prune behavior).

## Safety properties

### Preview-first diff

`planModeMapSync` produces a unified diff (when drift exists) against `.kilocode/evolution/council.yaml`, and the VS Code UX surfaces that diff before applying.

### Create-missing-only

When `.kilocode/evolution/council.yaml` does not exist, applying the plan creates it with a create-only write (refuses to overwrite if the file appears concurrently), via [`applyModeMapSync()`](src/shared/evolution/modeMapSync.ts:403).

### Optional profile validation

Applying can (optionally) validate that every referenced profile name exists in the current environment:

- VS Code: validate against configured profiles
- CLI: validate against a profile map (see docstring in [`applyModeMapSync()`](src/shared/evolution/modeMapSync.ts:403))

If any profiles are missing, apply fails with a clear error.

## CLI + VS Code workflows

### CLI

The Mode Map Sync proposal workflow is designed to be auditable:

1. Preview: `kilocode evolution mode-map sync --dry-run`
2. Apply: `kilocode evolution mode-map sync`

When proposal writing is enabled, apply writes proposal artifacts under `.kilocode/evolution/proposals/` via [`writeModeMapSyncProposalArtifacts()`](src/shared/evolution/modeMapSync.ts:377).

### VS Code

Mode Map Sync is exposed via commands wired in [`registerCommands()`](src/activate/registerCommands.ts:1):

- “Sync Evolution Mode Map (Preview)”
- “Sync Evolution Mode Map (Apply)”

Both commands call the same shared engine (`plan` then `apply`) and present a modal confirmation before writing.

## When to run it

Run Mode Map Sync when:

- `docs/llm-mode-map.yaml` changes council role → profile assignments
- a repo is bootstrapped and you want `.kilocode/evolution/council.yaml` to match the mode map
- council runs fail because `council.yaml` is stale relative to the documented mapping
