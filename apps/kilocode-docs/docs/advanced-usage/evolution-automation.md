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

- **Behavior**: You must manually run commands like `Kilo Code: Bootstrap Evolution Layer` or `Kilo Code: Sync Evolution Mode Map`.
- **Best For**: Initial setup, sensitive projects, or users who want 100% control.

### Level 1: Auto-Trigger

Kilo Code proactively identifies opportunities for improvement but stops short of making changes. It prepares everything for you to review.

- **Behavior**: If Kilo Code notices a recurring issue or a missing rule, it will generate a **Proposal** in `.kilocode/evolution/proposals/` and notify you.
- **Action Required**: You review the proposal and decide whether to apply it.
- **Best For**: Teams who want suggestions but need final sign-off.

### Level 2: Auto-Apply

Kilo Code is authorized to automatically apply low-risk changes.

- **Behavior**:
    - **Low-Risk**: Formatting fixes, non-conflicting rule additions, and minor documentation updates are applied automatically.
    - **High-Risk**: Complex changes or those affecting core policies still require manual approval (reverts to Level 1 behavior).
- **Best For**: Reducing toil on maintenance tasks.

### Level 3: Full Closed-Loop

The system operates autonomously to optimize your project's performance.

- **Behavior**:
    - Runs **A/B Tests** to compare different prompts or rules.
    - Updates the **Policy Engine** based on test results.
    - Activates **Self-Healing** to rollback changes if performance degrades.
- **Best For**: Mature projects where rapid iteration and optimization are desired.

## Getting Started

To change your automation level, you can use the VS Code settings or the CLI.

### Using VS Code Settings

1.  Open Settings (`Cmd+,` or `Ctrl+,`).
2.  Search for `Kilo Code Evolution`.
3.  Find **Automation Level** and select your desired level.

### Configuration

You can fine-tune the automation behavior in your `.vscode/settings.json`:

```json
{
	"kilo-code.evolution.automation.level": 1,
	"kilo-code.evolution.automation.autoApproveLowRisk": true,
	"kilo-code.evolution.automation.maxDailyProposals": 5
}
```

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
