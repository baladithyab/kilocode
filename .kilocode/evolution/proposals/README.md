# Evolution Proposals

Create one markdown file per proposal.

## Naming

Use a monotonically increasing prefix for easy audit, e.g.

- `0001-add-rubric-foo.md`
- `0002-update-skill-bar.md`

## Required sections

- **Intent**: what problem are we solving and why now?
- **Scope**: exact directories/files to change
- **Risks**: what could go wrong? safety considerations?
- **Patch plan**: step-by-step change list
- **Verification**: how do we know this is correct?

Use [`0000-template.md`](.kilocode/evolution/proposals/0000-template.md:1) as a starting point.

## Generated proposal folders (proposal.v1)

The VS Code / CLI proposal generator writes **create-missing-only** folders under this directory:

- `proposal.v1.<timestamp>.<traceId>/`
    - `proposal.v1.json`
    - `proposal.md`

These are intended as an intermediate artifact you can copy/paste from into a numbered proposal file.
