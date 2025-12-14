import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import * as path from "node:path"

import { runCouncilReview } from "./councilRunner"

async function makeTempDir(): Promise<string> {
	return mkdtemp(path.join(tmpdir(), "kilocode-council-runner-"))
}

describe("council runner", () => {
	it("parses council.yaml, resolves profiles, and writes scorecards to .kilocode/evals/reports/", async () => {
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

			await mkdir(path.join(dir, ".kilocode", "evolution", "council-prompts"), { recursive: true })
			await writeFile(
				path.join(dir, ".kilocode", "evolution", "council-prompts", "governance.md"),
				[
					"# Council Role: {{role}}",
					"Profile: {{profile}}",
					"Trace: {{tracePath}}",
					"",
					"Return JSON with { version: 'scorecard.v1', ... } (MVP: minimal fields ok)",
					"",
					"TRACE JSON:",
					"{{traceJson}}",
				].join("\n"),
				"utf8",
			)

			await writeFile(
				path.join(dir, ".kilocode", "evolution", "council.yaml"),
				[
					"version: 1",
					"roles:",
					"  governance:",
					"    profile: default",
					"    rubricId: evo.maybe",
					"    promptPath: .kilocode/evolution/council-prompts/governance.md",
				].join("\n"),
				"utf8",
			)

			const resolvedProfiles: string[] = []

			const result = await runCouncilReview({
				projectRoot: dir,
				tracePath,
				now: new Date("2025-01-01T00:00:00.000Z"),
				resolveProfile: async (profileName) => {
					resolvedProfiles.push(profileName)
					return { apiProvider: "openai-native", openAiNativeApiKey: "test", apiModelId: "gpt-4o" }
				},
				completePrompt: async (_settings, prompt) => {
					// Ensure prompt got filled.
					expect(prompt).toContain("TRACE JSON")
					expect(prompt).toContain("trace_test_123")
					return JSON.stringify({
						version: "scorecard.v1",
						id: "scorecard_test_1",
						createdAt: new Date("2025-01-01T00:00:00.000Z").toISOString(),
						council: { role: "governance", profile: "default" },
						overall: { verdict: "pass", summary: "ok" },
					})
				},
			})

			expect(resolvedProfiles).toEqual(["default"])
			expect(result.scorecards).toHaveLength(1)
			expect(result.scorecards[0].council.role).toBe("governance")
			expect(result.reportsDir).toContain(path.join(".kilocode", "evals", "reports"))

			const firstOut = result.scorecardPaths[0]
			const written = JSON.parse(await readFile(firstOut, "utf8"))
			expect(written.version).toBe("scorecard.v1")
			expect(written.council.role).toBe("governance")
		} finally {
			await rm(dir, { recursive: true, force: true })
		}
	})
})
