# LLM Council (MVP1)

The “LLM Council” is a lightweight governance practice for reviewing Evolution Layer changes.

MVP1 goal: ensure Evolution Layer artifacts remain **local-first**, **auditable**, and **least-privilege**.

## Council scope

Council reviews are required for changes to the Evolution Layer surfaces:

- `.kilocode/memory/**`
- `.kilocode/skills/**`
- `.kilocode/rubrics/**`
- `.kilocode/evolution/**`
- `.kilocode/rules/**`
- `.kilocode/mcp.json`
- `docs/**`

Council reviews are **not** a substitute for normal code review of runtime/product changes.

## Workflow

1. **Proposal authored**
    - Add a proposal file under [`../.kilocode/evolution/proposals/`](.kilocode/evolution/proposals/README.md:1).
2. **Council review**
    - Validate scope, safety, and consistency with principles.
3. **Apply change**
    - Make the described edits.
4. **Applied record**
    - Add an applied record under [`../.kilocode/evolution/applied/`](.kilocode/evolution/applied/README.md:1) with verification notes.

## Review checklist

### Governance

- [ ] Change stays within the allowed write-scope (least privilege)
- [ ] Proposal includes intent, scope, risks, and verification
- [ ] Applied record references the proposal and captures verification notes

### Safety

- [ ] No secrets or credentials
- [ ] No large generated artifacts committed (traces/eval runs remain ignored)

### Quality

- [ ] Documentation is clear, concise, and linked to relevant code paths
- [ ] Rubrics/skills are actionable and unambiguous

## Escalation

If a change needs to touch forbidden surfaces (e.g., `src/**`), it must be handled via the normal engineering process, outside of the Evolution Layer bootstrap workflow.
