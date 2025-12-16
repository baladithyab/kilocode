---
sidebar_position: 10
title: Evolution Layer
description: Learn how to bootstrap and use the Evolution Layer in Kilo Code.
---

# Evolution Layer

The **Evolution Layer** is Kilo Code's system for maintaining project-specific memory, skills, rubrics, and governance policies. It allows Kilo Code to "learn" about your project over time, enforcing rules and improving its responses based on past interactions and defined standards.

All Evolution Layer artifacts are stored locally in your project's `.kilocode` directory, ensuring that your project's intelligence is version-controlled and shared with your team.

💡 Tip: If you're new to the Evolution Layer, start with the 5-minute guide: [Evolution Layer: 5-Minute Quick Start](./evolution-quick-start.md).

## Setting Up via Settings UI

Kilo Code provides a dedicated **Evolution Settings Panel** to manage the entire lifecycle of your project's evolution. This is the recommended way to bootstrap and configure the Evolution Layer.

### Evolution Settings Panel

To access the panel:

1. Open VS Code Settings (`Cmd+,` or `Ctrl+,`).
2. Navigate to the **Evolution** tab.

📷 Screenshot: Evolution Settings Panel (Settings → Evolution)

<!-- TODO: Add screenshot asset under /docs/img/evolution/ and update this doc to reference it -->

The panel includes:

- **Status Dashboard**: Shows the current health of your Evolution Layer, including active policies, recent self-healing events, and pending proposals.
- **Council Configuration**: A UI to select and configure the "Council" of AI personas that review changes.
- **Automation Level Selector**: Choose how much automation you want:
    - **Level 0**: Manual review
    - **Level 1**: Auto-trigger reviews, manual approval
    - **Level 2**: Auto-apply low-risk proposals
    - **Level 3**: Full closed-loop (advanced)
- **Quick Actions**: One-click buttons for common tasks like "Bootstrap", "Sync Mode Map", and "Export Trace".

### Bootstrapping

If your project doesn't have an Evolution Layer yet, you'll see a prominent **"Bootstrap Evolution Layer"** button in the settings panel.

1.  Go to **Settings > Evolution**.
2.  Click **Bootstrap Evolution Layer**.
3.  Review the plan in the notification window.
4.  Confirm to generate the standard directory structure.

💡 Tip: Bootstrapping is safe to run multiple times. It only creates missing files and never overwrites existing ones.

### Getting Started (UI-first workflow)

After bootstrapping, most users follow this flow:

1.  **Configure your Council**
    - In **Council Configuration**, select 3-5 profiles.
    - Click **Configure Council**.
2.  **Choose an Automation Level**
    - Start with **Level 0** (manual) if you're evaluating the feature.
    - Move to **Level 1-2** once you're comfortable with the proposal workflow.
3.  **Use Quick Actions while you work**
    - Export a trace after finishing a task.
    - Run the Council review to generate a proposal.
    - Apply (or reject) the proposal.

⚠️ Note: UI labels and placement may vary slightly between versions. If you can't find the Evolution tab, search Settings for "Evolution".

## Alternative: Command Line

For advanced users or CI/CD pipelines, you can still use the Command Palette or CLI.

### Using VS Code Command Palette

1.  Open the Command Palette (`Cmd+Shift+P` or `Ctrl+Shift+P`).
2.  Run the command: **`Kilo Code: Bootstrap Evolution Layer`**.

### Using the CLI

```bash
# Primary command
kilocode evolution bootstrap

# Alias
kilocode init evolution
```

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

### Using Settings UI

1.  Go to **Settings > Evolution**.
2.  Under **Quick Actions**, click **Sync Mode Map**.
3.  Review the proposed changes and confirm.

### Alternative: Command Palette

1.  Open the Command Palette (`Cmd+Shift+P` or `Ctrl+Shift+P`).
2.  Run **`Kilo Code: Sync Evolution Mode Map (Preview)`**.
3.  Review the proposed changes (diff + proposal artifacts) before applying.

To apply the sync from VS Code, run **`Kilo Code: Sync Evolution Mode Map (Apply)`**.

### Alternative: CLI

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

You can configure these levels directly in the **Evolution Settings Panel**.

For a detailed guide on setting up and using these features, see [Evolution Automation](./evolution-automation.md).

## Daily Workflow

To keep your Evolution Layer active and healthy, Kilo Code provides tools to integrate it into your daily routine.

### Quick Actions

Use the **Quick Actions** in the Evolution Settings Panel to access common tasks:

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
