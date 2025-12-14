import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import * as path from "node:path"

import { generateEvolutionProposalFromScorecards } from "./proposalGenerator"

async function makeTempDir(): Promise<string> {
	return mkdtemp(path.join(tmpdir(), "kilocode-proposal-generator-"))
}

describe("proposal generator", () => {
	it("writes a create-missing-only proposal folder containing proposal.v1.json and proposal.md", async () => {
		const dir = await makeTempDir()

		try {
			const tracePath = path.join(dir, "trace.v1.test.json")
			await writeFile(
				tracePath,
				JSON.stringify(
					{
						version: "trace.v1",
						id: "trace_test_123",
						createdAt: new Date("2025-01-01T00:00:00.000Z").toISOString(),
						source: { kind: "cli" },
						uiMessages: [{ ts: 1, type: "say", say: "text", text: "hello" }],
					},
					null,
					2,
				),
				"utf8",
			)

			const reportsDir = path.join(dir, "reports")
			await mkdir(reportsDir, { recursive: true })

			await writeFile(
				path.join(reportsDir, "scorecard.v1.governance.json"),
				JSON.stringify(
					{
						version: "scorecard.v1",
						id: "scorecard_test_1",
						createdAt: new Date("2025-01-01T00:00:00.000Z").toISOString(),
						trace: { id: "trace_test_123", path: "trace.v1.test.json" },
						council: { role: "governance", profile: "default" },
						overall: { verdict: "pass", summary: "ok" },
					},
					null,
					2,
				),
				"utf8",
			)

			const result = await generateEvolutionProposalFromScorecards({
				projectRoot: dir,
				tracePath,
				reportsDir,
				now: new Date("2025-01-01T00:00:00.000Z"),
			})

			expect(result.proposal.tracePath).toBe("trace.v1.test.json")
			expect(result.loadedScorecards).toHaveLength(1)
			expect(result.jsonPath).toContain(path.join(result.proposalDir, "proposal.v1"))
			expect(result.markdownPath).toContain(path.join(result.proposalDir, "proposal"))

			// Second run should not overwrite; should produce a new file name.
			const result2 = await generateEvolutionProposalFromScorecards({
				projectRoot: dir,
				tracePath,
				reportsDir,
				now: new Date("2025-01-01T00:00:00.000Z"),
			})

			expect(result2.jsonPath).not.toBe(result.jsonPath)
		} finally {
			await rm(dir, { recursive: true, force: true })
		}
	})
})
