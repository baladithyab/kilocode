# Phase 4 Usage Guide: Autonomous Evolution

This guide explains how to configure and use the Phase 4 capabilities of the Darwin Evolution System, including autonomous execution, multi-agent council review, and LLM-powered skill synthesis.

## Table of Contents

1. [Enabling Autonomous Execution](#enabling-autonomous-execution)
2. [Configuring Risk Thresholds](#configuring-risk-thresholds)
3. [Setting Up Multi-Agent Council](#setting-up-multi-agent-council)
4. [Enabling LLM Skill Synthesis](#enabling-llm-skill-synthesis)
5. [Using the Analytics Dashboard](#using-the-analytics-dashboard)
6. [Troubleshooting](#troubleshooting)

---

## Enabling Autonomous Execution

Autonomous execution allows Darwin to automatically apply improvements and fixes without manual intervention, based on risk assessment.

### Configuration

1. Open **Settings** > **Darwin Evolution**.
2. Locate the **Autonomy Level** setting.
3. Choose one of the following levels:

| Level | Name         | Description                                                                           |
| ----- | ------------ | ------------------------------------------------------------------------------------- |
| **0** | **Manual**   | All proposals require manual approval. No changes are applied automatically.          |
| **1** | **Assisted** | Low-risk proposals are auto-applied. Medium and High risk proposals require approval. |
| **2** | **Auto**     | All proposals are auto-applied unless they fail critical safety checks.               |

### Safety Features

- **Daily Limits**: By default, Darwin is limited to 50 executions per day. This can be adjusted in `config.autonomousExecutor.dailyLimit`.
- **Quiet Hours**: Execution can be paused during specific hours (e.g., 10 PM - 6 AM) to prevent overnight changes.
- **Rollback**: If an auto-applied change fails validation, it is automatically rolled back.

---

## Configuring Risk Thresholds

Darwin assesses the risk of every proposal before execution. You can customize how risk is calculated and handled.

### Risk Factors

Risk is calculated based on 5 factors:

1. **Complexity**: Number of files and lines changed.
2. **Impact**: Criticality of affected files (e.g., core system vs. docs).
3. **Reversibility**: How easily the change can be undone.
4. **Test Coverage**: Whether the change includes tests.
5. **Security**: Potential security implications.

### Custom Rules

You can define custom rules to override default behavior. For example, to always require approval for changes to `package.json`:

```json
{
	"customRules": [
		{
			"name": "Protect Dependencies",
			"conditions": {
				"scope": "project",
				"affectedFiles": ["package.json"]
			},
			"action": "escalate",
			"priority": 10
		}
	]
}
```

---

## Setting Up Multi-Agent Council

The Multi-Agent Council uses specialized AI agents to review proposals, providing a higher level of safety and quality assurance than a single model.

### Enabling the Council

1. In **Settings**, enable **Multi-Agent Council**.
2. Configure the **Max Concurrent Agents** (default: 4).
3. Set the **Agent Timeout** (default: 5 minutes).

### Council Roles

The council consists of four specialized roles:

1. **Analyst**: Checks technical feasibility and architectural alignment.
2. **Reviewer**: Reviews code quality, style, and maintainability.
3. **Security**: Scans for vulnerabilities and security risks.
4. **Performance**: Assesses impact on system performance.

### Voting Policy

The council uses a **Majority** voting policy by default. A proposal is approved if >50% of agents vote "Approve".

---

## Enabling LLM Skill Synthesis

LLM Skill Synthesis allows Darwin to write new tools and capabilities for itself using a Large Language Model.

### Configuration

1. In **Settings**, enable **Skill Synthesis**.
2. Select the **Synthesis Strategy**:
    - **Template**: Uses pre-defined templates (safer, less flexible).
    - **LLM**: Uses LLM to generate code from scratch (more powerful, higher risk).
    - **Hybrid** (Recommended): Tries LLM first, falls back to templates if validation fails.

### Cost Management

- **Max Cost Per Synthesis**: Limit the cost of a single synthesis attempt (default: $0.10).
- **Daily Budget**: Set a daily budget for synthesis operations.
- **Prompt Caching**: Enabled by default to reduce costs for similar problems.

---

## Using the Analytics Dashboard

The Analytics Dashboard provides real-time visibility into Darwin's operations.

### Accessing the Dashboard

Click the **Chart Icon** in the Darwin Settings header to open the dashboard.

### Key Metrics

- **Health Status**: Overall system health (Healthy, Degraded, Unhealthy).
- **Success Rate**: Percentage of successful autonomous executions.
- **Doom Loops**: Number of repetitive failures detected and resolved.
- **Skills Created**: Number of new capabilities synthesized.
- **Cost Tracking**: Estimated cost of LLM operations.

### Activity Feed

The dashboard shows recent activity:

- **Proposals**: Generated, approved, and rejected proposals.
- **Executions**: Status of autonomous execution attempts.
- **Council Reviews**: Detailed breakdown of agent votes.

---

## Troubleshooting

### Common Issues

**1. "Doom Loop Detected" keeps appearing**

- This means Darwin is failing to fix a repetitive error.
- **Action**: Check the error logs and manually intervene if necessary. You can also increase the `doomLoopThreshold` in settings.

**2. Autonomous Execution is paused**

- Check if **Quiet Hours** are active.
- Check if the **Daily Limit** has been reached.
- Check if the system health is **Unhealthy** (too many recent failures).

**3. Council Review is taking too long**

- Reduce the **Agent Timeout**.
- Check your LLM provider's latency and rate limits.
- Switch to **Simulated Council** (faster, but less thorough) if needed.

**4. Skill Synthesis fails repeatedly**

- Check the **Max Refinement Attempts** setting.
- Ensure the LLM model has sufficient coding capabilities (e.g., Claude 3.5 Sonnet, GPT-4o).
- Switch to **Template** strategy for more reliable (but limited) results.
