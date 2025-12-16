---
sidebar_position: 13
title: A/B Testing
description: Learn how to run experiments to optimize Kilo Code's performance.
---

# A/B Testing

**A/B Testing** in the Evolution Layer allows you to scientifically determine the best prompts, rules, and configurations for your project. Instead of guessing what works best, you can run experiments and let the data decide.

## What is A/B Testing?

An A/B test involves running the same task multiple times with slight variations (Variant A vs. Variant B) to see which one produces better results.

- **Variant A (Control)**: The current configuration.
- **Variant B (Treatment)**: The proposed change (e.g., a new system prompt, a different tool definition).

Kilo Code executes both variants and evaluates them using your project's **Rubrics**.

## Running an A/B Test

You can trigger an A/B test manually via the Evolution Settings Panel, Command Palette, or CLI.

### Using Evolution Settings (Recommended)

1.  Go to **Settings > Evolution**.
2.  Under **Quick Actions**, click **Start A/B Test**.
3.  In the dialog that appears:
    - Enter a description of the task to test.
    - Select the configuration file you want to test against (Variant B).
4.  Click **Run Test**.

### Using VS Code Command Palette

1.  Open the Command Palette.
2.  Run **`Kilo Code: Evolution: Run A/B Test`**.
3.  Enter the task description.
4.  Select the configuration for Variant B.

### Using the CLI

```bash
kilocode evolution test --task "Refactor the auth service" --variant-b "path/to/new-prompt.md"
```

## Automated A/B Testing (Level 3)

At **Automation Level 3**, Kilo Code can autonomously design and run A/B tests. You don't need to manually trigger them.

1.  **Hypothesis Generation**: The system identifies a potential improvement (e.g., "Making the code review prompt stricter might reduce bugs").
2.  **Experiment Setup**: It creates a temporary configuration for Variant B.
3.  **Execution**: It runs the test on a sample task (often a synthetic task or a safe, read-only task).
4.  **Evaluation**: It compares the results using the LLM Council.
5.  **Conclusion**: If Variant B is statistically better, it proposes making it the new default.

## Interpreting Results

Results are saved in `.kilocode/evals/reports/`. A typical report includes:

- **Score**: A numerical score (0-100) for each variant based on the rubric.
- **Reasoning**: A detailed explanation from the evaluator on why one variant scored higher.
- **Winner**: The declared winner of the test.

### Example Report Summary

| Metric       | Variant A (Current) | Variant B (New) | Delta |
| :----------- | :------------------ | :-------------- | :---- |
| Code Quality | 85/100              | 92/100          | +7    |
| Safety       | 100/100             | 100/100         | 0     |
| Conciseness  | 70/100              | 88/100          | +18   |

_Winner: Variant B_
