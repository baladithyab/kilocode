# Darwin Analysis: Extracting Adaptable Patterns for Kilocode

## 1. Component Priority Matrix

| Component                        | Priority      | Justification                                                                                                                                                                 |
| -------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Core Darwin Loop**             | **Essential** | The fundamental "Trace → Analyze → Propose → Validate → Apply" loop is the engine of evolution. Kilocode needs this to move beyond simple task execution to self-improvement. |
| **State Management**             | **Essential** | Robust context tracking is required for the loop. Kilocode already has `ExtensionState`, but it needs to be extended to track "Evolution State".                              |
| **Safety (Write Boundaries)**    | **Essential** | Critical for autonomous evolution. Kilocode already has `FileRestrictionError`, which is a great start.                                                                       |
| **Council (Multi-Agent Review)** | **Valuable**  | Enhances quality and safety. Kilocode's existing `delegateParentAndOpenChild` provides the mechanism; we just need to formalize the "Council" roles.                          |
| **Tool Evolution (MCP)**         | **Valuable**  | Allows the agent to extend its capabilities. Kilocode has `McpHub`, making this a natural next step.                                                                          |
| **Analytics Dashboard**          | **Valuable**  | Visibility into the evolution process. `TelemetryService` exists, but a user-facing dashboard (like Darwin's) would be powerful.                                              |
| **Agent Evolution**              | **Optional**  | Dynamic creation of new Modes. High complexity, best left for Phase 3.                                                                                                        |
| **Sandbox Testing**              | **Optional**  | Git worktrees are powerful but complex to manage in a VS Code extension. Start with "Dry Runs" or "Diff Views".                                                               |
| **Plugin System**                | **N/A**       | Kilocode uses **Modes** and **Extensions**. We don't need a separate plugin system; we leverage the existing architecture.                                                    |

## 2. Architectural Adaptations

### Core Loop → Evolution Loop

- **Darwin**: Trace → Analyze → Propose → Validate → Apply
- **Kilocode**:
    - **Trace**: `TelemetryService` + `TaskHistory`. Capture every tool use, error, and user feedback.
    - **Analyze**: A new background process (or a specialized "Analyst Mode") that reviews `TaskHistory` for patterns (e.g., "User always corrects imports in Python files").
    - **Propose**: The Analyst Mode proposes a change (e.g., "Add a rule to `.kilocoderules`" or "Create a new MCP tool").
    - **Validate**: The "Council" (Orchestrator + Reviewer Mode) reviews the proposal.
    - **Apply**: The change is applied (e.g., writing to `.kilocoderules` or `kilocode-config.json`).

### Council → Orchestrator Delegation

- **Darwin**: Multi-agent council votes on changes.
- **Kilocode**: Leverage `delegateParentAndOpenChild`.
    - The **Orchestrator Mode** acts as the Chair.
    - It delegates subtasks to **Reviewer Mode** (for code safety), **Security Mode** (for permissions), etc.
    - The `completionResultSummary` from the subtask serves as the "Vote" or "Feedback".

### Tool Evolution → MCP Synthesis

- **Darwin**: Synthesizes new tools from code.
- **Kilocode**: Synthesize **MCP Servers**.
    - Instead of internal tools, Kilocode writes a small MCP server (e.g., in Python/Node) to handle a repetitive task.
    - It then uses `McpServerManager` to register it dynamically.

## 3. Trace System Design

**Goal**: Capture high-fidelity data for the "Analyze" phase.

**Data Schema (JSON)**:

```json
{
  "taskId": "uuid",
  "mode": "code",
  "timestamp": 123456789,
  "events": [
    {
      "type": "tool_use",
      "tool": "edit_file",
      "params": { ... },
      "result": "success",
      "duration": 150
    },
    {
      "type": "user_feedback",
      "sentiment": "negative",
      "correction": "Don't use 'any' type"
    },
    {
      "type": "error",
      "code": "FileRestrictionError",
      "context": "Attempted to edit .env"
    }
  ]
}
```

**Integration**:

- **Capture**: Hook into `ClineProvider.ts` event emitters (`TaskCompleted`, `TaskAborted`, `TaskUserMessage`).
- **Storage**:
    - **Short-term**: In-memory `Task` object (already exists).
    - **Long-term**: Persist to `globalStorage/trace_logs/` (JSON files). This allows local analysis without sending code to the cloud.
    - **Telemetry**: Send anonymized metrics to PostHog (already implemented).

## 4. Mode Evolution Strategy

Instead of "Plugins", we evolve **Modes**.

1.  **Rule Evolution**:

    - Analyze `TaskHistory` for repeated user instructions.
    - **Action**: Append to `.kilocoderules` (workspace-specific) or Global Custom Instructions.
    - **Mechanism**: `updateCustomInstructions` method in `ClineProvider`.

2.  **Tool Evolution**:

    - Identify missing capabilities (e.g., "I wish I could query the database").
    - **Action**: Propose creating a new MCP server.
    - **Mechanism**: `createTask` with instructions to write a new MCP server script, then add it to `kilocode_config.json`.

3.  **Mode Specialization**:
    - Identify a cluster of tasks (e.g., "SQL Optimization").
    - **Action**: Create a new **Custom Mode** ("SQL Optimizer").
    - **Mechanism**: `CustomModesManager.addCustomMode()` with specific `roleDefinition` and `groups`.

## 5. Council Implementation

**Structure**:

- **Chair**: `Orchestrator Mode` (manages the process).
- **Members**:
    - `Reviewer Mode`: Checks for bugs, style, and logic.
    - `Security Mode`: Checks for PII, secrets, and dangerous operations.
    - `Architect Mode`: Checks for alignment with system design.

**Workflow**:

1.  **Proposal**: A task generates a "Pull Request" or a "Proposed Change".
2.  **Delegation**: The Chair calls `delegateParentAndOpenChild` for each Member.
    - `Chair` -> `Reviewer`: "Review this diff for bugs."
    - `Chair` -> `Security`: "Check this diff for secrets."
3.  **Aggregation**: The Chair collects `completionResultSummary` from each subtask.
4.  **Decision**: If all positive, Chair proceeds. If negative, Chair requests revision.

## 6. Safety & Validation

**Existing Capabilities**:

- `FileRestrictionError`: Prevents modes from editing unauthorized files.
- `autoApprovalEnabled`: User can require approval for sensitive actions.
- `ShadowCheckpointService`: Git-based checkpoints (perfect for rollback!).

**New Requirements**:

- **Evolution Sandbox**: When creating a new Mode or Tool, it must be tested in a sandbox before being enabled globally.
    - _Implementation_: Create a temporary workspace/folder for the new tool, run a test suite against it.
- **Rate Limiting**: Prevent "Doom Loops" where the agent endlessly tries to fix itself.
    - _Implementation_: `consecutiveMistakeLimit` (already exists) + `EvolutionBudget` (max tokens/cost per evolution cycle).

## 7. Simplification Opportunities

- **Single Workspace Focus**: Darwin supports multi-repo. Kilocode is workspace-centric. We can simplify the "Context" to just the current VS Code workspace.
- **Leverage VS Code**: Use VS Code's native "Problems" tab for validation instead of building a custom linter harness.
- **User as Final Judge**: Darwin tries to be fully autonomous. Kilocode should lean on the user for the final "Apply" decision, simplifying the "Validation" phase.

## 8. Key Insights

1.  **"Modes are the Agents"**: We don't need a new "Agent" concept. Kilocode's Custom Modes _are_ the specialized agents we need.
2.  **"Task Delegation is the Council"**: The `delegateParentAndOpenChild` method is the primitive that enables multi-agent collaboration. We just need to orchestrate it.
3.  **"Telemetry is the Trace"**: We don't need to build a new tracing system. We just need to tap into the existing `TelemetryService` and `TaskHistory` and make it accessible to the "Analyst" mode.
4.  **"MCP is the Tool Layer"**: Dynamic tool creation should be purely based on MCP. It's the standard, it's extensible, and Kilocode already supports it.
5.  **"Evolution is a Task"**: Self-improvement shouldn't be a hidden background process. It should be a visible `Task` ("Optimizing your workflow...") that the user can see, approve, and interact with.
