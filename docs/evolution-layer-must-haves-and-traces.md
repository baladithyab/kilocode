# Evolution Layer: Must-Haves & Trace Architecture

This document outlines the "must-have" features for Kilo Code's Evolution Layer, focusing on a robust trace system and configurable LLM Council.

## 1. Evolution Layer Must-Haves & Gaps

To build a resilient "evolutionary context" system (inspired by Acontext) that is safe, reproducible, and effective, we must address the following:

### Privacy & Redaction (Critical Gap)

- **Requirement:** Traces often contain sensitive data (API keys, PII, internal IPs).
- **Gap:** Current task storage (`globalStorage`) is raw. Sharing traces for Council review (especially if committed or sent to an external LLM) requires sanitization.
- **Solution:** Implement a "Redaction Layer" that runs before any trace export.
    - **Must-Have:** Regex-based redaction for common patterns (keys, emails).
    - **Must-Have:** Allow-list for safe environment variables.

### Trace Schema & Versioning

- **Requirement:** The Council (and other tools) must reliably parse traces.
- **Gap:** `ui_messages.json` is an internal format that may change.
- **Solution:** Define a stable `v1` Trace Schema.
    - **Must-Have:** Version field (`schemaVersion: "1.0"`).
    - **Must-Have:** Metadata (Task ID, Timestamp, Mode, Git Commit Hash).
    - **Must-Have:** Structured events (User Message, Assistant Response, Tool Use, Tool Result).

### Reproducibility

- **Requirement:** To evaluate a trace or proposal, we must be able to reproduce the context.
- **Gap:** Traces currently capture _what happened_, but not necessarily the _state_ of the repo at that time.
- **Solution:** Capture context snapshots.
    - **Must-Have:** Record `git commit` hash at start of task.
    - **Must-Have:** Record active `mode` and `profile` configuration.

### Proposal Lifecycle & Governance

- **Requirement:** Changes to the Evolution Layer must be safe and auditable.
- **Gap:** The "Propose-and-Apply" workflow is manual.
- **Solution:** Automate validation.
    - **Must-Have:** CLI tool to validate proposal format (YAML frontmatter, required sections).
    - **Must-Have:** "Dry Run" capability for applying changes (especially for `llm-mode-map.yaml`).

---

## 2. First-Class Trace Access

We need a unified way to store and access traces across both the IDE (Extension) and CLI (Scripts).

### Storage Strategy: Hybrid Model

1.  **Hot Storage (IDE/Local):**

    - **Location:** VS Code `globalStorage` (existing behavior).
    - **Purpose:** Performance, privacy, user history, "Resume Task".
    - **Retention:** Managed by user settings (e.g., "Keep last 50 tasks").

2.  **Cold/Shared Storage (Evolution):**
    - **Location:** `.kilocode/traces/runs/<taskId>.json` (Project-local).
    - **Purpose:** Council review, debugging, sharing, "Evolution" proposals.
    - **Retention:** Git-ignored by default (`.gitignore` already exists).
    - **Action:** Explicit export required (e.g., `kilo trace export <id>`).

### Unified Trace Schema (`v1`)

```json
{
	"schemaVersion": "1.0",
	"metadata": {
		"id": "task-uuid",
		"timestamp": 1715432100000,
		"mode": "architect",
		"gitCommit": "a1b2c3d",
		"durationMs": 45000,
		"cost": 0.05
	},
	"events": [
		{
			"type": "user_message",
			"content": "Refactor the login logic...",
			"ts": 1715432100000
		},
		{
			"type": "assistant_response",
			"content": "I will start by...",
			"ts": 1715432105000
		},
		{
			"type": "tool_use",
			"tool": "read_file",
			"params": { "path": "src/auth.ts" },
			"ts": 1715432110000
		}
	]
}
```

### Consumption & Tooling

- **Export Command:** `kilo trace export <taskId> [--redact]`
    - Exports from `globalStorage` to `.kilocode/traces/runs/`.
- **Council Ingestion:** The Council script (`scripts/kilo/council-review.sh`) accepts a file path:
    - `./scripts/kilo/council-review.sh --trace .kilocode/traces/runs/task-123.json`

---

## 3. Council Configuration & Dynamic Mapping

The LLM Council needs to be configurable, and its recommendations should drive the project's evolution (specifically, mode routing).

### Council Roster Configuration

Define the Council's composition in `docs/llm-council-config.yaml` (new file). This maps "Seats" to "Profiles".

```yaml
# docs/llm-council-config.yaml
council:
    chair:
        profile: "architect"
        responsibilities: ["scope-check", "final-approval"]
    members:
        - profile: "code-skeptic"
          focus: "security, correctness"
        - profile: "context-manager"
          focus: "memory-consistency"
```

- **Profiles:** Reference the stable slugs defined in `docs/kilo-profiles.md` (and implemented in `.kilocodemodes`).

### Dynamic Mode Mapping & Governance

The goal is to allow the Council to recommend: _"This task failed in 'Code' mode. It should have been routed to 'Architect' mode."_

1.  **Source of Truth:** [`docs/llm-mode-map.yaml`](docs/llm-mode-map.yaml:1)

    - This file defines the rules for which mode handles which task.
    - It is currently documentation-only but must become **active configuration**.

2.  **Recommendation Loop:**

    - **Step 1 (Analyze):** Council reviews a trace.
    - **Step 2 (Recommend):** Council outputs a structured recommendation:
        ```json
        {
        	"recommendation": "update_mode_map",
        	"reason": "Complex refactoring requires planning first.",
        	"change": {
        		"pattern": "refactor.*complex",
        		"suggested_mode": "architect"
        	}
        }
        ```
    - **Step 3 (Propose):** A proposal is created to update `docs/llm-mode-map.yaml`.
    - **Step 4 (Apply):** Once approved/merged, the user runs a sync command.

3.  **UX: One-Click Apply**
    - **Command:** `kilo modes sync`
    - **Behavior:** Reads `docs/llm-mode-map.yaml` and updates the user's local `.kilocodemodes` or global settings to reflect the new routing rules.
    - **Safety:** Never silently changes settings. Always prompts for confirmation or requires explicit user action.

### Implementation Plan

1.  **Create `docs/llm-council-config.yaml`** to formalize the roster.
2.  **Implement `kilo trace export`** in the CLI/Extension to bridge the gap between Hot Storage and Cold Storage.
3.  **Update `scripts/kilo/council-review.sh`** to parse the `v1` Trace Schema.
4.  **Build `kilo modes sync`** to make `docs/llm-mode-map.yaml` actionable.
