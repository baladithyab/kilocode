# Evolution workflow

This folder implements the MVP1 **propose-and-apply** workflow.

## Workflow

1. **Create a proposal** under [`proposals/`](.kilocode/evolution/proposals/README.md:1)
    - Describe intent, scope, risks, and the exact files to change.
2. **Review** (LLM Council or maintainers)
    - Ensure least-privilege scope and no forbidden surfaces are touched.
3. **Apply the change**
    - Make the edits to the allowed surfaces.
4. **Record the application** under [`applied/`](.kilocode/evolution/applied/README.md:1)
    - Reference the proposal and summarize what was changed and how it was verified.

## Notes

- Proposals and applied records are **git-tracked** for auditability.
- Large generated artifacts belong in `.kilocode/traces/runs/` and `.kilocode/evals/runs/` and are ignored.
