# Phased Pre-Merge UX Refinement Plan: Evolution Layer

This document defines the **phased, pre-merge UX refinement plan** for Kilo Code's Evolution Layer. It focuses on what must be completed _before_ merging `evolution-layer/council-mvp` to `main` to ensure Evolution is a viable day-to-day capability.

**Core Objective:** Deliver a "Mode Map Sync" capability that keeps repo configuration (`.kilocodemodes`) in sync with governance documentation (`docs/llm-mode-map.yaml`), alongside a polished end-to-end user journey.

## 1. Current State (Implemented)

As of commit `1147783` (Branch: `evolution-layer/council-mvp`), the following core capabilities are live:

- **Mode Map Sync Engine:** Shared logic for planning and applying mode map changes.
    - Planner: [`planModeMapSync()`](src/shared/evolution/modeMapSync.ts:255)
    - Applier: [`applyModeMapSync()`](src/shared/evolution/modeMapSync.ts:403)
- **Commands:**
    - CLI: `kilocode evolution modes sync`
    - VS Code: `Kilo Code: Sync Evolution Mode Map`
    - Quick Actions: `Kilo Code: Evolution Quick Actions...`
    - Open Artifact: `Kilo Code: Evolution: Open Latest Artifact...` (and CLI `kilocode evolution open`)
- **Artifacts:**
    - Proposals: stored in [`.kilocode/evolution/proposals/`](.kilocode/evolution/proposals/) with rollback support.
- **Configuration:**
    - Opt-in Nudge: `kilo-code.evolution.nudges.postTask` (User Setting)

---

## 2. Current End-to-End User Journeys

### Journey A: New Repo (Bootstrap)

**Goal:** Initialize Evolution Layer scaffolding and configure editor modes from scratch.

| Step          | CLI Action                      | VS Code Action                                                     | Output Location                               |
| :------------ | :------------------------------ | :----------------------------------------------------------------- | :-------------------------------------------- |
| **1. Init**   | `kilocode init evolution`       | Command: `Kilo Code: Bootstrap Evolution Layer`                    | `.kilocode/` (dirs), `docs/llm-mode-map.yaml` |
| **2. Sync**   | `kilocode evolution modes sync` | Notification: "Evolution initialized. Sync modes?" -> Click "Sync" | `.kilocodemodes` (created)                    |
| **3. Verify** | `cat .kilocodemodes`            | Open `.kilocodemodes` editor                                       | N/A                                           |

### Journey B: Existing Repo (Review & Propose)

**Goal:** Review recent work (trace) against council standards and generate an evolution proposal.

| Step           | CLI Action                                | VS Code Action                                                  | Output Location                                     |
| :------------- | :---------------------------------------- | :-------------------------------------------------------------- | :-------------------------------------------------- |
| **1. Export**  | `kilocode trace export --task-id <id>`    | Command: `Kilo Code: Export Trace` (Auto-selects active task)   | `.kilocode/traces/runs/<trace-id>.json`             |
| **2. Review**  | `kilocode council run --trace <path>`     | Command: `Kilo Code: Run Council Review` (Selects recent trace) | `.kilocode/evals/reports/<trace-id>/scorecard.json` |
| **3. View**    | `cat .../scorecard.json`                  | Auto-opens Scorecard Webview / Markdown summary                 | N/A                                                 |
| **4. Propose** | `kilocode evolve propose --report <path>` | Button: "Generate Proposal" (on Scorecard)                      | `.kilocode/evolution/proposals/<date>-<slug>.md`    |
| **5. Refine**  | Edit markdown file                        | Edit markdown file                                              | Same as above                                       |

---

## 3. Top UX Friction Points & Incremental Fixes

| Area              | Friction Point                                                                                | Incremental Fix (Pre-Merge)                                                                                          |
| :---------------- | :-------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------- |
| **Config Drift**  | `docs/llm-mode-map.yaml` and `.kilocodemodes` drift, causing confusion about available modes. | **Mode Map Sync:** Shared planner/differ/applier to enforce consistency.                                             |
| **Input Fatigue** | CLI requires manual path pasting for traces/reports.                                          | **Smart Defaults:** CLI defaults to "latest" trace/report if not specified. VS Code uses QuickPick for recent items. |
| **Blind Spots**   | Users don't know when a Council Review finishes.                                              | **Notifications:** VS Code Progress API for long-running tasks. CLI spinners.                                        |
| **Lost Outputs**  | Generated proposals are buried in hidden folders.                                             | **Auto-Open:** VS Code automatically opens the generated Proposal file. CLI prints clickable file paths.             |

---

## 4. Mode Map Sync Specification (Highest Priority)

**Concept:** `docs/llm-mode-map.yaml` is the **Source of Truth**. `.kilocodemodes` (and optionally `.kilocode/evolution/council.yaml`) are **Targets**.

### 4.1 Architecture: Shared Planner/Differ/Applier

A shared module (`src/shared/evolution/modeSync.ts`) used by both CLI and VS Code.

1.  **Planner:** Reads `docs/llm-mode-map.yaml` and current `.kilocodemodes`.
2.  **Differ:** Compares Source vs. Target.
    - _Drift Detection:_
        - **Missing:** Mode in YAML but not in JSON.
        - **Drifted:** Mode in both, but `roleDefinition` or `groups` (write scope) differ.
        - **Extraneous:** Mode in JSON but not in YAML (Flag as "Managed by User" or "Obsolete").
3.  **Applier:** Executes the plan (Create, Update, Delete) with **Idempotency**.

### 4.2 Drift Detection Rules

- **Source:** `docs/llm-mode-map.yaml` (defines `modes` map).
- **Target 1:** `.kilocodemodes` (defines active editor modes).
    - _Rule:_ `modes.<name>.primary_tasks` -> `.kilocodemodes.<name>.roleDefinition`.
    - _Rule:_ `modes.<name>.write_scope` -> `.kilocodemodes.<name>.groups` (resolved from `evolution_layer.allowed_write_scope`).
- **Target 2:** `.kilocode/evolution/council.yaml` (defines council roles).
    - _Rule:_ Ensure council roles (e.g., `governance`) have access to the same context/tools as the `context-manager` mode if they share scope. (MVP: Warning only).

### 4.3 Safety & UX

- **Preview-First:** Always calculate the diff before applying.
- **Explicit Confirmation:**
    - **CLI:** `Drift detected. +2 modes, ~1 modified. Apply? [y/N]` (unless `--force`).
    - **VS Code:** Notification "Configuration drift detected." -> "Show Diff" -> "Sync".
- **Non-Destructive:**
    - Preserve user-defined modes in `.kilocodemodes` that are _not_ in the YAML (unless `--prune` is passed).
    - Only update fields managed by the YAML.
- **Rollback-Friendly:**
    - The "Apply" action generates a backup of `.kilocodemodes` to `.kilocode/.backup/` before writing.

---

## 5. Ongoing Workflow Integration

### 5.1 Non-Blocking Nudges

- **Post-Task:** After `kilocode trace export`, show: "Run Council Review? (y/n)".
- **Periodic:** On VS Code startup, check for drift. If drift > threshold, show status bar item "Evolution: Sync Needed".
- **Opt-In:** `kilocode.evolution.autoSync: boolean` (default `false`).

### 5.2 Proposal Lifecycle

- **Tracking:** Proposals live in `.kilocode/evolution/proposals/`.
- **Status:** Metadata in frontmatter: `status: draft | review | accepted | rejected`.
- **Feedback Loop:**
    - **Accept:** User moves file to `.kilocode/evolution/applied/` (or runs `kilocode evolve accept <file>`).
    - **Effect:** This signals the "Context Manager" mode to ingest this change into the project memory/rules in the next cycle.

---

## 6. Privacy, Safety & Performance

### 6.1 Privacy & Safety

- **Local-Only:** All traces, scorecards, and proposals are stored locally in `.kilocode/`. No data leaves the machine unless the user explicitly configures a remote LLM endpoint.
- **Redaction:** Trace export must respect `.gitignore` and explicitly redact secrets (env vars, API keys) before saving to JSON.
- **Write Protection:** Evolution modes are strictly sandboxed to `.kilocode/` and `docs/` via `docs/llm-mode-map.yaml` rules.

### 6.2 Performance

- **Timeouts:** Council runs (LLM calls) must have a strict timeout (e.g., 60s per role) to prevent hanging.
- **Failure Modes:**
    - _LLM Failure:_ Save partial scorecard. Allow retry of specific role.
    - _Sync Failure:_ Atomic write for `.kilocodemodes` (write to temp, then rename) to prevent corruption.

---

## 7. Phased Milestones

### Phase 1: Core Sync Logic & CLI (Completed)

- **Goal:** `kilocode evolution modes sync` works reliably.
- **Modules:** `src/shared/evolution/modeSync.ts`, `cli/src/commands/evolution.ts`.
- **Status:** ✅ Completed
- **Acceptance Criteria:**
    - [x] `kilocode init evolution` creates `docs/llm-mode-map.yaml`.
    - [x] `kilocode evolution modes sync` generates valid `.kilocodemodes`.
    - [x] Modifying YAML and running sync updates JSON correctly.
    - [x] Modifying JSON manually (drift) is detected and corrected by sync.
- **Tests:** Unit tests for `detectDrift` and `generateModeConfig`.

### Phase 2: VS Code Integration (Completed)

- **Goal:** VS Code commands and notifications.
- **Modules:** `src/activate/evolution.ts`.
- **Status:** ✅ Completed
- **Acceptance Criteria:**
    - [x] Command `Kilo Code: Sync Evolution Mode Map` triggers the shared logic.
    - [x] "Show Diff" opens a virtual document showing the JSON patch.
    - [x] Post-bootstrap notification prompts for sync.

### Phase 3: End-to-End Polish (In Progress)

- **Goal:** Smooth "Review & Propose" journey.
- **Modules:** `src/commands/trace.ts`, `src/commands/council.ts`.
- **Status:** 🚧 In Progress
- **Acceptance Criteria:**
    - [x] `trace export` defaults to active task (via Quick Actions/Open Latest).
    - [x] `council run` accepts "latest" or interactive selection.
    - [x] Generated proposal opens automatically (via `kilocode evolution open`).
    - [ ] **Periodic Nudge:** On startup, check for drift (opt-in).
    - [ ] **Telemetry:** Minimal logging for sync success/failure.

---

## 8. Pre-Merge Checklist

The **absolute minimum** required to merge `evolution-layer/council-mvp` to `main`:

1.  [x] **Mode Map Sync Implemented:** `kilocode evolution modes sync` (CLI) and `Kilo Code: Sync Evolution Mode Map` (VS Code) are functional and share logic.
2.  [x] **Drift Detection:** System correctly identifies when `.kilocodemodes` diverges from `docs/llm-mode-map.yaml`.
3.  [x] **Safety:** Sync is non-destructive to unrelated keys and requires confirmation.
4.  [x] **Bootstrap Flow:** `kilocode init evolution` generates the correct YAML and prompts for Sync.
5.  [x] **Docs:** `docs/llm-mode-map.yaml` is committed as the canonical schema.
6.  [ ] **Periodic Nudge:** Opt-in, non-blocking check on startup (setting: `kilo-code.evolution.nudges.postTask`).
7.  [ ] **Output Navigation:** Improved messages/links for CLI output where still missing.
8.  [ ] **Telemetry/Debug:** Minimal logging for sync operations and debuggability.
9.  [ ] **Tests:** Unit/Integration tests for the remaining items (nudge, nav, telemetry).

**Status:** 🛑 **DO NOT MERGE YET.** Pending final polish items (6-9).
