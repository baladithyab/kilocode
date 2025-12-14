# Evolution Layer Bootstrap Design

This document outlines the design for the "Evolution Layer bootstrap" feature in Kilo Code, enabling users to easily set up the canonical Evolution Layer scaffold in their projects via both VS Code and CLI.

## 1. Overview

The goal is to provide a one-step command to generate the standard `.kilocode` directory structure and its contents. This operation must be:

- **Idempotent**: Can be run multiple times without side effects.
- **Safe**: Never overwrites existing files (create-missing-only).
- **Transparent**: Shows a preview of actions before execution.

## 2. Architecture

To ensure consistency between the VS Code extension and the CLI, the core logic and templates will be centralized in a shared package.

### 2.1 Shared Package: `packages/evolution`

A new package `packages/evolution` will be created. It will contain:

- **Templates**: The raw content of all files to be scaffolded.
- **Logic**: The `bootstrapEvolution` function.

#### `bootstrapEvolution` Function Signature

```typescript
interface BootstrapResult {
	plan: FileOperation[]
	suggestions: string[] // e.g., "Add .kilocode to .gitignore"
}

interface FileOperation {
	path: string
	action: "create" | "skip"
	reason?: string // e.g., "File already exists"
}

export async function bootstrapEvolution(cwd: string, dryRun: boolean): Promise<BootstrapResult>
```

### 2.2 Templates

The templates will be extracted from the current `.kilocode` directory in this repository. They will be stored as string constants or loaded from a `templates` directory within the package.

**Files to Scaffold:**

- `.kilocode/README.md`
- `.kilocode/rules/evolution-layer.md`
- `.kilocode/memory/README.md`
- `.kilocode/skills/README.md`
- `.kilocode/rubrics/README.md`
- `.kilocode/traces/README.md`
- `.kilocode/traces/runs/.gitignore`
- `.kilocode/evals/README.md`
- `.kilocode/evals/runs/.gitignore`
- `.kilocode/evolution/README.md`
- `.kilocode/evolution/proposals/README.md`
- `.kilocode/evolution/proposals/0000-template.md`
- `.kilocode/evolution/applied/README.md`
- `.kilocode/evolution/applied/0000-template.md`
- `.kilocode/mcp.json`

## 3. Integration Points

### 3.1 VS Code Extension

- **Command ID**: `kilo-code.bootstrapEvolution`
- **Title**: "Kilo Code: Initialize Evolution Layer"
- **Registration**: `src/activate/registerCommands.ts` (or similar) and `package.json`.

**UX Flow:**

1.  User triggers command.
2.  Extension calls `bootstrapEvolution(workspaceRoot, dryRun=true)`.
3.  Extension displays a QuickPick or a custom modal showing the plan:
    - "✅ Create .kilocode/README.md"
    - "⏭️ Skip .kilocode/rules/evolution-layer.md (exists)"
4.  User confirms.
5.  Extension calls `bootstrapEvolution(workspaceRoot, dryRun=false)`.
6.  Extension shows success notification and displays any suggestions (e.g., "Please add .kilocode to your .gitignore").

### 3.2 CLI

- **Command**: `kilo init` (or `kilo evolution init`)
- **Implementation**: `cli/src/commands/init.ts`

**UX Flow:**

1.  User runs `kilo init`.
2.  CLI calls `bootstrapEvolution(cwd, dryRun=true)`.
3.  CLI prints the plan to stdout:
    ```
    Plan:
    [+] .kilocode/README.md
    [=] .kilocode/rules/evolution-layer.md (exists, skipping)
    ...
    ```
4.  CLI asks for confirmation: "Proceed? [y/N]"
5.  If yes, CLI calls `bootstrapEvolution(cwd, dryRun=false)`.
6.  CLI prints success message and suggestions.

## 4. Handling External Files

The bootstrap process will **not** modify files outside of `.kilocode` (like `.gitignore` or `.kilocodemodes`). Instead, it will generate suggestions.

- **`.gitignore`**: Suggest adding `.kilocode/traces/runs/` and `.kilocode/evals/runs/` if not present (though the scaffolded `.gitignore` files inside those dirs handle this, the root `.gitignore` might also need attention for the whole `.kilocode` folder if it's meant to be private, but usually it's committed. The prompt implies `.gitignore` might need updates).
    - _Correction_: The prompt says "How to handle existing .kilocodemodes and .gitignore without editing them (generate suggestions only)".
    - The `bootstrapEvolution` function will check if `.kilocodemodes` exists and if it contains the necessary mode definitions. If not, it adds a suggestion.
    - It will check `.gitignore` for relevant entries.

## 5. Test Strategy

### 5.1 Unit Tests (`packages/evolution`)

- Test `bootstrapEvolution` with an empty directory (all files created).
- Test `bootstrapEvolution` with a fully populated directory (all files skipped).
- Test `bootstrapEvolution` with partial population (mixed create/skip).
- Test `dryRun` mode (no files written).

### 5.2 Integration Tests (CLI)

- Run `kilo init` in a temp dir and verify file structure.
- Run `kilo init` again and verify idempotency.

### 5.3 Integration Tests (VS Code)

- (Optional/Manual) Verify command appears in palette and executes correctly.

## 6. Implementation Steps

1.  **Create `packages/evolution`**:
    - Set up `package.json`, `tsconfig.json`.
    - Copy templates from current repo.
    - Implement `bootstrapEvolution`.
2.  **Wire up CLI**:
    - Add `cli/src/commands/init.ts`.
    - Register in `cli/src/commands/index.ts`.
3.  **Wire up Extension**:
    - Add command to `package.json`.
    - Register handler in `src/extension.ts` (or `activate` module).
4.  **Verify**:
    - Run tests.
    - Manual test in a dummy project.
