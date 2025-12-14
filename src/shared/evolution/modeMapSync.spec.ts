import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import * as path from "node:path"

import { planModeMapSync } from "./modeMapSync"

async function makeTempDir(): Promise<string> {
	return mkdtemp(path.join(tmpdir(), "kilocode-mode-map-sync-"))
}

describe("mode map sync", () => {
	it("detects drift and generates a deterministic unified diff", async () => {
		const dir = await makeTempDir()
		try {
			await mkdir(path.join(dir, "docs"), { recursive: true })
			await mkdir(path.join(dir, ".kilocode", "evolution"), { recursive: true })

			await writeFile(
				path.join(dir, "docs", "llm-mode-map.yaml"),
				[
					"version: 1",
					"council:",
					"  roles:",
					"    governance:",
					"      profile: context-manager",
					"    quality:",
					"      profile: eval-engineer",
				].join("\n"),
				"utf8",
			)

			await writeFile(
				path.join(dir, ".kilocode", "evolution", "council.yaml"),
				[
					"version: 1",
					"councilId: evolution-mvp",
					"roles:",
					"  governance:",
					"    profile: default",
					"    rubricId: evolution.governance.v1",
					"    promptPath: .kilocode/evolution/council-prompts/governance.md",
					"  quality:",
					"    profile: default",
					"    rubricId: evolution.quality.v1",
					"    promptPath: .kilocode/evolution/council-prompts/quality.md",
				].join("\n"),
				"utf8",
			)

			const plan = await planModeMapSync({
				projectRoot: dir,
				now: new Date("2025-01-01T00:00:00.000Z"),
			})

			expect(plan.drift.changes).toHaveLength(2)
			expect(plan.summary).toBe("Council config drift detected: 2 profile update(s).")
			expect(plan.diffText).toMatchSnapshot()
		} finally {
			await rm(dir, { recursive: true, force: true })
		}
	})

	it("create-missing: generates a minimal council.yaml and diff when council.yaml is absent", async () => {
		const dir = await makeTempDir()
		try {
			await mkdir(path.join(dir, "docs"), { recursive: true })

			await writeFile(
				path.join(dir, "docs", "llm-mode-map.yaml"),
				[
					"version: 1",
					"council:",
					"  roles:",
					"    governance:",
					"      profile: default",
					"    quality:",
					"      profile: default",
				].join("\n"),
				"utf8",
			)

			const plan = await planModeMapSync({
				projectRoot: dir,
				now: new Date("2025-01-01T00:00:00.000Z"),
			})

			expect(plan.drift.changes).toHaveLength(2)
			expect(plan.drift.changes.map((c) => c.kind)).toEqual(["add-role", "add-role"])
			expect(plan.diffText).toMatchSnapshot()
		} finally {
			await rm(dir, { recursive: true, force: true })
		}
	})
})
