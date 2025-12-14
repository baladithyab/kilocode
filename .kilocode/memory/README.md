# Memory Bank

This folder contains **project memory** that should remain stable across tasks and contributors.

## What belongs here

- Architecture decisions and invariants
- Known constraints (security, performance, compliance)
- Vocabulary / domain glossary
- Operational knowledge that is hard to infer from code

## What does NOT belong here

- Large logs, trace dumps, or evaluation run outputs
- Secrets / API keys / credentials

## Change policy

Treat memory as versioned documentation:

- Prefer changes via the propose/apply workflow in [`../evolution/`](.kilocode/evolution/README.md:1)
- Keep entries concise and sourceable (link to PRs, issues, or code paths where relevant)
