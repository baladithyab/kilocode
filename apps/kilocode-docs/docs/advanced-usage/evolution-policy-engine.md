---
sidebar_position: 12
title: Policy Engine
description: Understand how Kilo Code routes tasks and enforces rules dynamically.
---

# Policy Engine

The **Policy Engine** is the brain of the Evolution Layer. It determines how Kilo Code handles different types of tasks, which tools it can use, and what rules it must follow. Unlike static instructions, the Policy Engine is dynamic and can evolve over time.

## Managing Policies

If your version of Kilo Code includes policy visibility in the **Evolution Settings Panel**, you can use it to inspect which policies are active.

1.  Go to **Settings > Evolution**.
2.  Look for a **Policy Engine** (or **Policies**) section.
3.  Review the currently active routing rules and constraints.

⚠️ Note: Full visual editing of policies is a planned enhancement. For now, policy changes are typically made by editing the underlying YAML files.

## How It Works

When you give Kilo Code a task, the Policy Engine analyzes it against a set of active policies.

1.  **Task Analysis**: The engine looks at the user's request and the current context.
2.  **Policy Matching**: It finds relevant policies in `.kilocode/rules/` and `.kilocode/evolution/policies/`.
3.  **Routing**: Based on the matched policies, it decides:
    - Which **Mode** to use (e.g., Code, Architect, Ask).
    - Which **Profile** (persona) to adopt.
    - Any specific **Constraints** (e.g., "Do not use `rm -rf`").

## Dynamic Routing

One of the most powerful features is **Dynamic Routing**. Instead of you manually selecting a mode, the Policy Engine can do it for you.

For example, if you ask "How do I implement auth?", the engine might route this to **Architect** mode first to design the solution, and then to **Code** mode for implementation.

## Policy Evolution

Policies aren't set in stone. Through the **LLM Council** (a simulated panel of expert personas), Kilo Code can review its own performance and suggest policy updates.

- **Feedback Loop**: After a task is completed, the Council can review the outcome.
- **Suggestion**: If the Council finds that a certain rule was ambiguous or unhelpful, it can propose a refinement.
- **Update**: If you approve (or if you're on Automation Level 2+), the policy is updated in your local files.

## Examples

### Basic Routing Rule

```yaml
# .kilocode/evolution/policies/routing.yaml
- trigger: "test|spec|coverage"
  mode: "test-engineer"
  reason: "Task involves testing or quality assurance."
```

### Safety Constraint

```yaml
# .kilocode/evolution/policies/safety.yaml
- trigger: "delete|remove|drop"
  constraint: "require_confirmation"
  message: "Destructive actions require explicit user approval."
```

### Context-Aware Rule

```yaml
# .kilocode/evolution/policies/context.yaml
- condition: "file_count > 1000"
  action: "suggest_indexing"
  message: "Large project detected. Recommend running managed indexing."
```
