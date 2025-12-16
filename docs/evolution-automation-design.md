# Evolution Layer Automation Architecture

## 1. Overview

This document outlines the architecture for automating the Evolution Layer workflow in Kilo Code. The goal is to move from a manual "Propose-and-Apply" cycle to a configurable, progressive automation pipeline that allows users to opt-in to higher levels of autonomy while maintaining safety and auditability.

## 2. Settings Schema

We will introduce a new configuration section `kilo-code.evolution.automation` in `package.json`.

```json
{
	"evolution.automation.level": {
		"type": "integer",
		"default": 0,
		"enum": [0, 1, 2, 3],
		"enumDescriptions": [
			"Level 0: Manual (Default) - No automated actions.",
			"Level 1: Auto-Trigger - Automatically export trace and run Council on failure or high cost.",
			"Level 2: Auto-Apply Low Risk - Auto-trigger Council, plus auto-apply low-risk proposals (e.g., docs, non-breaking config).",
			"Level 3: Full Closed-Loop - Auto-apply all approved proposals with A/B testing and auto-rollback (Future)."
		],
		"description": "Defines the level of automation for the Evolution Layer."
	},
	"evolution.automation.triggers": {
		"type": "object",
		"properties": {
			"onFailure": {
				"type": "boolean",
				"default": true,
				"description": "Trigger Council review when a task fails or errors."
			},
			"costThreshold": {
				"type": "number",
				"default": 2.0,
				"description": "Trigger Council review when task cost exceeds this amount (in USD). Set to 0 to disable."
			}
		},
		"default": {
			"onFailure": true,
			"costThreshold": 2.0
		}
	},
	"evolution.automation.safety": {
		"type": "object",
		"properties": {
			"autoApplyCategories": {
				"type": "array",
				"items": {
					"type": "string",
					"enum": ["documentation", "mode-map", "memory", "rubric"]
				},
				"default": ["documentation"],
				"description": "Categories of proposals that are safe to auto-apply in Level 2."
			},
			"requireHumanApprovalFor": {
				"type": "array",
				"items": {
					"type": "string"
				},
				"default": ["*"],
				"description": "Patterns or categories that always require human approval, even in high automation levels."
			}
		}
	}
}
```

## 3. Automation Levels

### Level 0: Manual (Default)

- **Behavior**: No background actions.
- **User Action**: User manually runs "Export Trace", "Run Council", "Generate Proposal", "Apply".
- **Nudges**: Periodic nudges (existing feature) may suggest actions but perform none.

### Level 1: Auto-Trigger

- **Behavior**:
    - Listens for `TaskCompleted` event.
    - Checks **Trigger Conditions** (Failure, Cost).
    - If triggered:
        1.  Auto-exports trace to `.kilocode/traces/runs/`.
        2.  Auto-runs Council Review.
        3.  Auto-generates Proposal.
    - **Outcome**: A notification appears: "Evolution Proposal Generated (Reason: High Cost). Click to Review."
- **No Auto-Apply**: The user must still manually review and apply the proposal.

### Level 2: Auto-Apply Low Risk

- **Behavior**:
    - Includes all Level 1 behaviors.
    - After Proposal Generation, checks **Safety Policies**.
    - If proposal is "Low Risk" (e.g., only modifies `docs/` or `llm-mode-map.yaml` with non-conflicting changes):
        1.  Auto-applies the proposal.
        2.  Commits the change (optional/configurable).
    - **Outcome**: Notification: "Evolution Applied: Updated Mode Map to route 'refactor' tasks to Architect mode."

### Level 3: Full Closed-Loop (Future)

- **Behavior**:
    - Auto-applies broader categories of changes.
    - **Verification**: Runs a shadow eval or A/B test (e.g., re-runs a similar task or checks next task performance).
    - **Rollback**: If subsequent metrics degrade, automatically reverts the change.
- **Note**: This requires a more mature Evaluation Engine and is out of scope for the initial implementation.

## 4. Safety Boundaries & Policies

### Safe to Auto-Apply (Level 2)

1.  **Documentation Updates**: Changes to `docs/**` (excluding governance policies if critical).
2.  **Mode Map Additions**: Adding new patterns to `docs/llm-mode-map.yaml` that do not conflict with existing high-priority rules.
3.  **Memory Bank Updates**: Appending to `.kilocode/memory/`.

### Requires Human Approval

1.  **Council Constitution**: Changes to `.kilocode/evolution/council.yaml` (changing the judges themselves).
2.  **Critical Rules**: Changes to `.kilocode/rules/rules.md`.
3.  **High-Risk Patterns**: Regex patterns that are too broad (e.g., `.*`).

### Rollback Strategy

- **Git Integration**: All auto-applied changes should ideally be their own git commit.
- **Revert**: `git revert <hash>` is the primary rollback mechanism.
- **State Backup**: Before applying, backup the target files to `.kilocode/evolution/backups/`.

## 5. Trigger Conditions

### Failure Detection

- **Source**: `TaskCompleted` event payload or `HistoryItem`.
- **Logic**: If `task.error` is present or `completionResult` indicates failure (e.g., "I could not complete the task").

### High Cost Detection

- **Source**: `TaskCompleted` event `tokenUsage`.
- **Logic**: Calculate total cost based on model rates. If `totalCost > config.evolution.automation.triggers.costThreshold`, trigger.

### Rate Limiting

- **Cooldown**: Prevent triggering Council more than once every X hours for the same "reason" to save API costs.
- **Budget**: Hard cap on daily Council spend (e.g., "Max $5/day on Council").

## 6. Orchestration Flow

```mermaid
graph TD
    A[Task Completed] --> B{Automation Level > 0?}
    B -- No --> C[End]
    B -- Yes --> D{Check Triggers}
    D -- Failure/Cost --> E[Export Trace]
    D -- None --> C
    E --> F[Run Council Review]
    F --> G[Generate Proposal]
    G --> H{Level >= 2 & Low Risk?}
    H -- Yes --> I[Apply Proposal]
    H -- No --> J[Notify User (Review Pending)]
    I --> K[Notify User (Applied)]
```

### Background Process

- **Listener**: `src/activate/commands/evolution.ts` registers a listener for `RooCodeEventName.TaskCompleted`.
- **Handler**: `handleEvolutionAutomation(taskId, tokenUsage, toolUsage)`
    - Evaluates config.
    - Calls `TraceExporter`.
    - Calls `CouncilRunner`.
    - Calls `ProposalGenerator`.
    - Calls `ProposalApplier` (if Level 2).

## 7. UX Implications

### Discovery

- **Settings**: Prominent section in Settings UI.
- **First Run**: After the first manual Council run, ask: "Would you like to automate this for future failures?"

### Visibility

- **Status Bar**: Show a spinner/icon when Council is running in background.
- **Notifications**:
    - "Council is reviewing task #123..." (Transient)
    - "Proposal Ready: Optimize Architect Mode" (Actionable)
    - "Auto-Applied: Updated Mode Map" (Informational)
- **Logs**: Detailed logs in "Kilo Code: Evolution" output channel.

### Auditability

- **Applied Records**: Every auto-applied change creates a record in `.kilocode/evolution/applied/` with `automator: "system"`.

## 8. Integration Points

### Files to Modify

1.  `package.json`: Add configuration schema.
2.  `src/activate/commands/evolution.ts`:
    - Update `initializeEvolutionPeriodicNudge` to `initializeEvolutionAutomation`.
    - Implement `handleEvolutionAutomation`.
3.  `src/shared/evolution/automation.ts` (New):
    - Core logic for evaluating triggers and running the pipeline.
4.  `src/core/webview/ClineProvider.ts`: Ensure `TaskCompleted` emits necessary data (already confirmed).

### New Files

- `src/shared/evolution/automation.ts`: Automation logic.
- `src/shared/evolution/safety.ts`: Safety checks for auto-apply.

## 9. Implementation Roadmap

1.  **Phase 1: Foundation**

    - Add settings to `package.json`.
    - Create `src/shared/evolution/automation.ts`.
    - Implement Trigger Logic (Cost/Failure checks).

2.  **Phase 2: Level 1 (Auto-Trigger)**

    - Wire up `TaskCompleted` listener in `evolution.ts`.
    - Implement the "Export -> Council -> Proposal" chain.
    - Add Notifications.

3.  **Phase 3: Level 2 (Auto-Apply)**

    - Implement `src/shared/evolution/safety.ts`.
    - Add "Apply" step to the chain.
    - Add "Applied" notifications.

4.  **Phase 4: Refinement**
    - Add Rate Limiting/Budgeting.
    - Improve UX (Status bar integration).
