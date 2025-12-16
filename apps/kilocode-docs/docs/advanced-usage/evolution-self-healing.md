---
sidebar_position: 14
title: Self-Healing
description: Understand how Kilo Code detects and fixes degradation automatically.
---

# Self-Healing

**Self-Healing** is the safety net of the Evolution Layer. It ensures that if an automated change (or even a manual one) causes Kilo Code's performance to degrade, the system can detect it and revert to a known good state.

## How It Works

Self-healing relies on continuous monitoring of **Evaluation Metrics**.

1.  **Baseline**: Kilo Code maintains a baseline of performance scores (e.g., success rate, code quality score) from previous tasks.
2.  **Detection**: After every task (or batch of tasks), the system compares current performance against the baseline.
3.  **Trigger**: If performance drops below a defined threshold (e.g., "Success rate dropped by 20%"), the Self-Healing mechanism is triggered.

## The Healing Process

When degradation is detected:

1.  **Diagnosis**: The system analyzes recent changes to the Evolution Layer (e.g., "Did we recently update the system prompt?").
2.  **Rollback**: It attempts to revert the most recent change that correlates with the degradation.
3.  **Verification**: It runs a quick test to verify that performance has stabilized.
4.  **Locking**: It may temporarily "lock" the problematic file or rule to prevent it from being re-applied automatically.

## Safety Limits

To prevent "flapping" (repeatedly applying and reverting changes), Self-Healing has strict limits:

- **Max Rollbacks**: It will only attempt a rollback a limited number of times per day.
- **Human Notification**: Every self-healing event triggers a high-priority notification to the user.
- **Conservative Action**: When in doubt, it prefers to do nothing and alert the user rather than making chaotic changes.

## Viewing History

You can view the history of self-healing events in the **Evolution Activity Log** or by checking the `.kilocode/evolution/applied/` directory for rollback records.

```bash
# Check for rollback records
ls -l .kilocode/evolution/applied/ | grep "rollback"
```

## Configuration

Self-healing is active by default in **Automation Level 3**, but can be configured in lower levels via settings.

```json
{
	"kilo-code.evolution.selfHealing.enabled": true,
	"kilo-code.evolution.selfHealing.threshold": 0.15
}
```
