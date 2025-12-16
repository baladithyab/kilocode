---
sidebar_position: 10
title: Evolution Layer
description: Learn how to bootstrap and use the Evolution Layer in Kilo Code.
---

# Evolution Layer

The **Evolution Layer** is Kilo Code's system for maintaining project-specific memory, skills, rubrics, and governance policies. It allows Kilo Code to "learn" about your project over time, enforcing rules and improving its responses based on past interactions and defined standards.

All Evolution Layer artifacts are stored locally in your project's `.kilocode` directory, ensuring that your project's intelligence is version-controlled and shared with your team.

## Bootstrapping the Evolution Layer

Kilo Code provides a built-in "bootstrap" feature to quickly set up the standard Evolution Layer directory structure. This process is designed to be safe and transparent.

### Using VS Code

1.  Open the Command Palette (`Cmd+Shift+P` or `Ctrl+Shift+P`).
2.  Run the command: **`Kilo Code: Bootstrap Evolution Layer`**.
3.  Review the proposed changes in the notification or output window.
4.  Confirm the action to generate the files.

### Using the CLI

You can also bootstrap the Evolution Layer using the Kilo Code CLI:

```bash
# Primary command
kilocode evolution bootstrap

# Alias
kilocode init evolution
```

The CLI will display a plan of the files to be created and ask for confirmation before proceeding.

## Safety Guarantees

The bootstrap process is designed with the following safety measures:

- **Preview**: You will always see a plan of what files will be created before any changes are made.
- **Create-Missing-Only**: The process is **idempotent** and **non-destructive**. It will never overwrite existing files. If a file already exists, it will be skipped.
- **Confirmation Required**: No changes are applied without your explicit confirmation.

## Generated Files

The bootstrap process creates the following structure under the `.kilocode` directory:

- **`.kilocode/README.md`**: Overview of the Evolution Layer.
- **`.kilocode/rules/evolution-layer.md`**: Governance rules for the Evolution Layer.
- **`.kilocode/memory/README.md`**: Documentation for project memory.
- **`.kilocode/skills/README.md`**: Documentation for custom skills.
- **`.kilocode/rubrics/README.md`**: Documentation for evaluation rubrics.
- **`.kilocode/traces/README.md`**: Documentation for execution traces.
- **`.kilocode/traces/runs/.gitignore`**: Ignores trace run logs.
- **`.kilocode/evals/README.md`**: Documentation for evaluations.
- **`.kilocode/evals/runs/.gitignore`**: Ignores evaluation run logs.
- **`.kilocode/evolution/README.md`**: Documentation for the evolution process itself.
- **`.kilocode/evolution/proposals/README.md`**: Directory for evolution proposals.
- **`.kilocode/evolution/proposals/0000-template.md`**: Template for new proposals.
- **`.kilocode/evolution/applied/README.md`**: Directory for applied evolution records.
- **`.kilocode/evolution/applied/0000-template.md`**: Template for applied records.
- **`.kilocode/mcp.json`**: Configuration for the Model Context Protocol (MCP).

## Mode Map Sync

The Evolution Layer includes a **Mode Map Sync** capability that keeps your Evolution Mode Map in sync (seat → profile mappings), ensuring `.kilocode/evolution/council.yaml` stays aligned with `docs/llm-mode-map.yaml`.

### Using VS Code

1.  Open the Command Palette (`Cmd+Shift+P` or `Ctrl+Shift+P`).
2.  Run **`Kilo Code: Sync Evolution Mode Map (Preview)`**.
3.  Review the proposed changes (diff + proposal artifacts) before applying.

To apply the sync from VS Code, run **`Kilo Code: Sync Evolution Mode Map (Apply)`**.

### Using the CLI

```bash
# Preview (default)
kilocode evolution mode-map sync

# Apply
kilocode evolution mode-map sync --apply
```

### Safety & Proposals

Mode Map Sync follows the **Propose-and-Apply** pattern:

- **Preview**: It generates proposal artifacts under `.kilocode/evolution/proposals/` showing the exact YAML changes.
- **Review**: You can inspect the diff before applying.
- **Apply**: Once confirmed, the changes are written to `.kilocode/evolution/council.yaml` and an applied record is created.

## Automation Levels

The Evolution Layer supports four levels of automation to help you scale your project's intelligence:

- **Level 0: Manual (Default)** - You manually review and apply all changes.
- **Level 1: Auto-Trigger** - Kilo Code automatically detects when changes are needed and prepares proposals, but waits for your approval.
- **Level 2: Auto-Apply** - Low-risk changes (like minor rule updates) are applied automatically.
- **Level 3: Full Closed-Loop** - The system autonomously runs A/B tests, updates policies, and heals itself based on outcomes.

For a detailed guide on setting up and using these features, see [Evolution Automation](./evolution-automation.md).

## Daily Workflow

To keep your Evolution Layer active and healthy, Kilo Code provides tools to integrate it into your daily routine.

### Quick Actions

Use the **`Kilo Code: Evolution: Quick Actions`** command in VS Code to access common tasks:

- Open the latest proposal or applied record.
- Run a mode map sync.
- Bootstrap missing files.
- View recent traces or evaluation reports.

### Nudges (Opt-in)

You can configure Kilo Code to gently remind you to check the Evolution Layer status.

Add these settings to your `.vscode/settings.json` or user settings:

```json
{
	"kilo-code.evolution.nudges.postTask": true,
	"kilo-code.evolution.nudges.periodic": true,
	"kilo-code.evolution.nudges.periodicIntervalHours": 24
}
```

- **`postTask`**: Checks for pending proposals after completing a task.
- **`periodic`**: Checks periodically (default every 24 hours) for stale artifacts or needed updates.

## Where Outputs Live

The Evolution Layer generates several types of runtime data that are ignored by git (via `.gitignore`) to keep your repository clean:

- **`.kilocode/traces/runs/`**: Execution traces from agent tasks.
- **`.kilocode/evals/reports/`**: Reports from evaluation runs.
- **`.kilocode/evolution/proposals/`**: Pending proposals for governance or configuration changes (these _are_ committed until applied).
