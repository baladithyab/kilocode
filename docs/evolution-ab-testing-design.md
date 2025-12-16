# Evolution Layer A/B Testing Strategy

## 1. Overview

This document outlines the strategy for A/B testing task execution within Kilo Code's Evolution Layer. The goal is to safely compare different mode configurations (e.g., different prompts, models, or tool definitions) by running the same task against them and evaluating the outcomes.

## 2. Requirements & Constraints

- **Safety**: Execution must not corrupt the user's workspace or leave it in an inconsistent state.
- **Fidelity**: The test must run in the real environment (file system, tools) to be valid.
- **Isolation**: Variants must not interfere with each other.
- **Performance**: Overhead should be minimized, though sequential execution implies at least 2x duration.
- **Automation**: The process should be automated without requiring user intervention between variants.

## 3. Evaluated Approaches

| Approach          | Description                                                         | Pros                                                 | Cons                                                                          | Verdict         |
| :---------------- | :------------------------------------------------------------------ | :--------------------------------------------------- | :---------------------------------------------------------------------------- | :-------------- |
| **Git Worktrees** | Create isolated working trees from the main repo.                   | True isolation, concurrent execution.                | High complexity (managing worktrees, non-git projects), `Task` cwd awareness. | Rejected        |
| **Mock FS**       | Virtualize the file system.                                         | High safety, fast.                                   | Low fidelity (tools like `ripgrep` won't work).                               | Rejected        |
| **Checkpoints**   | Sequential execution with rollback using `ShadowCheckpointService`. | High fidelity, high safety, leverages existing code. | Slower (sequential).                                                          | **Recommended** |

## 4. Recommended Solution: Sequential Execution with Checkpoints

We will leverage the existing `ShadowCheckpointService` to snapshot the workspace state before running the A/B test and rollback after each variant execution.

### Architecture

- **`EvolutionABTestService`**: The orchestrator service responsible for managing the A/B test lifecycle.
- **`ShadowCheckpointService`**: Used to save the baseline state and restore it between runs.
- **`HeadlessClineProvider`**: A mock or headless implementation of `ClineProvider` to run `Task` instances without attaching to the visible VSCode Webview.

### Workflow

1.  **Initialization**:

    - `EvolutionABTestService` receives a `taskId` (the original task triggering the evolution) and a list of `variants` (configurations to test).
    - It initializes the `ShadowCheckpointService` for the current workspace.

2.  **Baseline Snapshot**:

    - `saveCheckpoint("Pre-A/B Test Baseline")` is called to secure the current state.

3.  **Variant Execution Loop**:

    - For each variant (A, B, ...):
        1.  **Restore**: `restoreCheckpoint("Pre-A/B Test Baseline")` to ensure a clean slate.
        2.  **Configure**: Create a new `Task` instance with the variant's specific configuration (Mode, Model, Custom Instructions).
        3.  **Execute**: Run the `Task` using `HeadlessClineProvider`.
        4.  **Monitor**: Capture `TaskCompleted` events, token usage, and tool usage.
        5.  **Capture Result**:
            - Save a temporary checkpoint: `saveCheckpoint("Variant X Result")`.
            - Calculate Diff: `getDiff({ from: "Pre-A/B Test Baseline", to: "Variant X Result" })`.
            - Store metrics (cost, duration, success/failure).

4.  **Cleanup**:
    - `restoreCheckpoint("Pre-A/B Test Baseline")` to return the user's workspace to the original state.
    - (Optional) If a winner is automatically chosen and auto-apply is enabled, apply the winner's diff.

## 5. Data Model

### `ABTestConfig`

```typescript
interface ABTestConfig {
	originalTaskId: string
	taskPrompt: string // The user's original request
	variants: ABTestVariantConfig[]
	timeoutMs?: number // Safety timeout per variant
}

interface ABTestVariantConfig {
	id: string
	mode: string // e.g., "architect", "code"
	model?: string // e.g., "claude-3-5-sonnet"
	customInstructions?: string // Evolution changes to test
}
```

### `ABTestResult`

```typescript
interface ABTestResult {
	testId: string
	timestamp: number
	variants: VariantResult[]
	winnerId?: string // If determined automatically
}

interface VariantResult {
	configId: string
	status: "success" | "failure" | "timeout"
	error?: string
	metrics: {
		totalCost: number
		durationMs: number
		tokensIn: number
		tokensOut: number
	}
	diff: CheckpointDiff[] // The code changes made
	traceId: string // Link to the execution trace
}
```

## 6. Implementation Plan

### Phase 1: Core Infrastructure

1.  **`HeadlessClineProvider`**: Create a minimal implementation of `ClineProvider` that satisfies `Task` dependencies but logs to memory/file instead of a Webview.
2.  **`EvolutionABTestService`**: Implement the main orchestration logic (snapshot -> loop -> restore).

### Phase 2: Integration

1.  **Evolution Command**: Add a command to trigger A/B tests (e.g., from the Council UI).
2.  **Result Storage**: Save `ABTestResult` to `.kilocode/evolution/tests/`.

### Phase 3: Safety & UX

1.  **Side Effect Warning**: Detect if the task involves potentially irreversible side effects (e.g., `execute_command` with network access) and warn the user or skip A/B testing.
2.  **Progress Reporting**: Update the main UI with the progress of the background A/B test.

## 7. Edge Cases & Mitigation

| Edge Case                 | Mitigation                                                                                                                                                            |
| :------------------------ | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Infinite Loop / Hang**  | Enforce strict timeouts for `HeadlessTask`. Kill the process if it exceeds the limit.                                                                                 |
| **Dirty Workspace**       | `ShadowCheckpointService` handles dirty workspaces by staging changes. We must ensure `restoreCheckpoint` is robust (it uses `git reset --hard`).                     |
| **External Side Effects** | We cannot rollback external API calls. **Mitigation**: Only run A/B tests for tasks classified as "Safe" (code edits only) or prompt user for confirmation.           |
| **Crash during Test**     | If VSCode reloads, the A/B test is lost. **Mitigation**: Persist test state to disk. On startup, check for interrupted tests and offer to cleanup (restore baseline). |
| **Resource Exhaustion**   | Running multiple LLM tasks can be expensive. **Mitigation**: Strict budget caps per test run.                                                                         |

## 8. Future Work

- **Parallel Execution**: Explore using Docker containers or true sandboxing for parallel execution in the future (Level 4 Automation).
- **Shadow Mode**: Run a "Shadow" variant in the background during normal user tasks to gather data without blocking the user (requires copy-on-write FS or similar).
