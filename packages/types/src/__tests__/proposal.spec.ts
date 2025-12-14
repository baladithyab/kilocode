// pnpm --filter @roo-code/types test src/__tests__/proposal.spec.ts

import { createProposalV1, formatProposalMarkdownV1, proposalV1Schema } from "../proposal.js"

describe("proposal.v1", () => {
	it("formats a minimal proposal markdown", () => {
		const proposal = createProposalV1({
			tracePath: ".kilocode/traces/runs/trace.v1.20250101T000000Z.json",
			reportsDir: ".kilocode/evals/reports/20250101T000000Z",
			summary: "Council found no scope violations. Minor doc improvements recommended.",
			intent: "Update governance docs for clarity.",
			scope: ["docs/**", ".kilocode/rules/**"],
			risks: ["Low"],
			verification: ["Open markdown files in VS Code", "Run lint"],
			changes: [{ path: "docs/llm-council.md", reason: "clarify checklist" }],
		})

		expect(proposalV1Schema.parse(proposal)).toEqual(proposal)

		const md = formatProposalMarkdownV1(proposal)
		expect(md).toContain("# Evolution Proposal (v1)")
		expect(md).toContain("## Summary")
		expect(md).toContain("docs/llm-council.md")
	})
})
