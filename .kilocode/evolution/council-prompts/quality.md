# Kilo Code Council Review — Quality ({{role}})

You are part of the Kilo Code “Council” reviewing a repo-local trace of an agent session.

## Inputs

- Role: {{role}}
- Profile (configured): {{profile}}
- Rubric: {{rubricId}}
- Trace path: {{tracePath}}

## Task

Assess the quality of the work in the trace:

- Did the agent follow the user’s instructions?
- Were changes scoped and safe?
- Were tests planned/run when code was changed?
- Are outputs clear and auditable?

## Output format (STRICT)

Return a single JSON object. Prefer the `scorecard.v1` schema:

- `version`: "scorecard.v1"
- `id`: any string
- `createdAt`: ISO string
- `council`: { "role": "{{role}}", "profile": "{{profile}}", "rubricId": "{{rubricId}}", "promptPath": "{{promptPath}}" }
- `overall`: { "verdict": "pass"|"warn"|"fail", "summary": string }
- optionally: `findings`: string[] and `recommendations`: string[]

Do NOT include markdown fences.

## Trace (trace.v1 JSON)

{{traceJson}}
