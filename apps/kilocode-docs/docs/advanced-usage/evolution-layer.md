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
