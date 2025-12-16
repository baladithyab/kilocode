---
sidebar_position: 11
title: Evolution Automation
description: Learn how to automate your project's evolution with Kilo Code.
---

# Evolution Automation

Kilo Code's Evolution Layer isn't just a static storage system; it's an active engine that can automate the improvement of your project's rules, skills, and memory. By enabling automation, you allow Kilo Code to proactively suggest improvements, run experiments, and even fix itself when things go wrong.

## Automation Levels

We categorize automation into four distinct levels, giving you complete control over how much autonomy you grant the system.

### Level 0: Manual (Default)

In this mode, Kilo Code is passive. It will never change your Evolution Layer artifacts without your direct command.

- **Behavior**: You must manually run commands via the **Evolution Settings Panel** (e.g., clicking "Bootstrap" or "Sync Mode Map").
- **Best For**: Initial setup, sensitive projects, or users who want 100% control.

### Level 1: Auto-Trigger

Kilo Code proactively identifies when evolution work is needed and prepares proposals for you to review.

- **Behavior**:
    - Automatically exports traces and triggers Council reviews in common situations (for example: repeated failures or unusually high-cost tasks).
    - Generates a **Proposal** in `.kilocode/evolution/proposals/` and notifies you.
- **Action Required**: You review the proposal and explicitly approve/apply it.
- **Best For**: Teams who want proactive suggestions but require human sign-off.

### Level 2: Auto-Apply (Low Risk)

Kilo Code can automatically apply low-risk changes to Evolution Layer artifacts.

- **Behavior**:
    - Automatically triggers Council reviews (Level 1 behavior).
    - Auto-applies proposals categorized as low-risk (for example: docs-only updates, mode-map sync changes).
    - Higher-risk proposals still require manual approval.
- **Best For**: Reducing maintenance toil while keeping humans in control of risky changes.

### Level 3: Full Closed-Loop

The system operates autonomously to optimize your project's performance.

- **Behavior**:
    - Runs **A/B Tests** to compare different prompts or rules.
    - Applies approved proposals automatically.
    - Uses **Self-Healing** to rollback changes if performance degrades.
- **Best For**: Mature projects where rapid iteration and optimization are desired.

⚠️ Note: Some Level 3 capabilities (especially fully automated A/B testing + auto-rollback loops) may be version-dependent and marked as "Future" in your settings.

## Configuring Automation Levels

The easiest way to configure automation is through the **Evolution Settings Panel**.

### Using Settings UI

1.  Open Settings (`Cmd+,` or `Ctrl+,`).
2.  Navigate to the **Evolution** tab.
3.  Locate the **Automation Level** selector.
4.  Choose your desired level (0-3).

📷 Screenshot: Automation Level selector (Settings → Evolution)

<!-- TODO: Add screenshot asset under /docs/img/evolution/ and update this doc to reference it -->

Selecting a level automatically configures the appropriate defaults for that level.

💡 Tip: Start on **Level 0** for a week. Once you're comfortable reviewing proposals, move to **Level 1** (auto-trigger) or **Level 2** (auto-apply low risk).

## Manual Configuration (Level 0) — UI Workflow

At Level 0, everything is explicit and user-driven. The fastest workflow is through the Evolution Settings Panel:

1.  **Bootstrap**
    - Go to **Settings > Evolution** → click **Bootstrap Evolution Layer**.
2.  **Export Trace**
    - After completing a task, go to **Settings > Evolution** → click **Export Trace**.
3.  **Run Council Review**
    - In the same panel, click **Run Council Review** to generate a proposal.
4.  **Review & Apply**
    - Open the proposal under `.kilocode/evolution/proposals/`.
    - Apply changes manually (or use the "Apply" action if shown).

### Quick Actions (UI)

Common buttons in **Settings > Evolution** include:

- **Bootstrap Evolution Layer**
- **Export Trace**
- **Run Council Review**
- **Sync Mode Map**
- **Start A/B Test**
- **Open Latest Proposal / Applied Record**

⚠️ Note: Button names and availability can vary by version and by your selected automation level.

### Advanced: Manual Configuration

For advanced users who want to fine-tune specific behaviors, you can edit your `.vscode/settings.json`:

```json
{
	"kilo-code.evolution.automation.level": 1,
	"kilo-code.evolution.automation.autoApproveLowRisk": true,
	"kilo-code.evolution.automation.maxDailyProposals": 5
}
```

**Note**: When you change the level in the UI, Kilo Code automatically updates these settings for you. It also creates a backup of your previous configuration, allowing you to rollback if needed.

## Automated Proposal Application

Depending on your automation level, proposals are handled differently:

- **Level 0**: All proposals require manual review and application.
- **Level 1**: Proposals are generated automatically, but you must click **"Apply"** in the notification or proposal view.
- **Level 2+**: "Safe" proposals (as determined by the Council) are applied automatically. You will receive a notification that a change was applied, with a link to review or revert it.

## Safety Features

Automation is powerful, but safety is paramount. We've built several safeguards:

1.  **Sandboxed Execution**: Automated tasks run in a restricted environment and cannot modify your application code (`src/`) directly—only Evolution Layer artifacts.
2.  **Rate Limiting**: To prevent runaway costs or noise, there are strict limits on how many proposals or tests can run per day.
3.  **Human Override**: You can always revert a change or lock specific files to prevent automation from touching them.
4.  **Transparency**: Every automated action creates a trace and a log entry, so you can audit exactly what happened and why.

## Troubleshooting

**Q: Kilo Code isn't generating proposals.**
A: Ensure you are at least on Level 1. Also, check if you've reached the daily limit for proposals.

**Q: An automated change broke something.**
A: You can revert any change using git. The Evolution Layer artifacts are just files in your repo. After reverting, consider adding a rule to prevent that specific change from happening again.

## FAQ

### Is automation safe?

Yes. Automation is strictly scoped to the `.kilocode` directory. It cannot modify your source code, build scripts, or deployment configurations.

### Will automated changes affect my code unexpectedly?

No. Automated changes only affect _how Kilo Code behaves_ (its rules, memory, etc.), not your application logic. However, changing rules _can_ influence how Kilo Code writes code in future tasks.

### How much does automation cost?

Level 1 and 2 have minimal cost, mostly related to analyzing context for proposals. Level 3 (A/B testing) involves running multiple parallel tasks, which can increase API usage. We recommend monitoring your usage when enabling Level 3.

### Can I revert automated changes?

Absolutely. All changes are committed to git (or staged, depending on your settings). You can treat them like any other code change.

### What data is collected?

Automation runs locally on your machine. No code or private data is sent to our servers for the purpose of automation logic, though API calls to LLM providers (like OpenAI or Anthropic) are made as usual.
