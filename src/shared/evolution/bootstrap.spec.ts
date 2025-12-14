import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import * as path from "node:path"

import { applyEvolutionBootstrap, planEvolutionBootstrap } from "./bootstrap"

async function makeTempDir(): Promise<string> {
	return mkdtemp(path.join(tmpdir(), "kilocode-evolution-bootstrap-"))
}

describe("Evolution Layer bootstrap", () => {
	it("creates missing files in an empty directory and is idempotent", async () => {
		const dir = await makeTempDir()

		try {
			const plan1 = await planEvolutionBootstrap({ projectRoot: dir })
			expect(plan1.toCreate.length).toBeGreaterThan(0)

			const apply1 = await applyEvolutionBootstrap(plan1)
			expect(apply1.created).toHaveLength(plan1.toCreate.length)

			// Re-plan should be empty (create-missing-only + idempotent)
			const plan2 = await planEvolutionBootstrap({ projectRoot: dir })
			expect(plan2.toCreate).toHaveLength(0)

			// Verify a couple canonical files exist and look correct
			const readme = await readFile(path.join(dir, ".kilocode", "README.md"), "utf-8")
			expect(readme).toContain("Project Evolution Layer")

			const mcp = await readFile(path.join(dir, ".kilocode", "mcp.json"), "utf-8")
			expect(mcp).toContain('"mcpServers"')
		} finally {
			await rm(dir, { recursive: true, force: true })
		}
	})

	it("does not overwrite existing files", async () => {
		const dir = await makeTempDir()

		try {
			await mkdir(path.join(dir, ".kilocode"), { recursive: true })
			await writeFile(path.join(dir, ".kilocode", "README.md"), "custom", "utf-8")

			const plan = await planEvolutionBootstrap({ projectRoot: dir })
			expect(plan.toCreate.some((i) => i.path === ".kilocode/README.md")).toBe(false)
			expect(plan.skipped.some((i) => i.path === ".kilocode/README.md")).toBe(true)

			await applyEvolutionBootstrap(plan)

			const after = await readFile(path.join(dir, ".kilocode", "README.md"), "utf-8")
			expect(after).toBe("custom")
		} finally {
			await rm(dir, { recursive: true, force: true })
		}
	})

	it("suggests .gitignore entries when .gitignore exists but is missing them", async () => {
		const dir = await makeTempDir()

		try {
			await writeFile(path.join(dir, ".gitignore"), "node_modules/\n", "utf-8")
			const plan = await planEvolutionBootstrap({ projectRoot: dir })

			expect(plan.toCreate.some((i) => i.path === ".gitignore")).toBe(false)
			expect(plan.suggestions.join("\n")).toContain(".gitignore already exists")
			expect(plan.suggestions.join("\n")).toContain(".kilocode/traces/runs/")
			expect(plan.suggestions.join("\n")).toContain(".kilocode/evals/runs/")
		} finally {
			await rm(dir, { recursive: true, force: true })
		}
	})

	it("suggests missing modes when .kilocodemodes exists but lacks required profiles", async () => {
		const dir = await makeTempDir()

		try {
			await writeFile(
				path.join(dir, ".kilocodemodes"),
				JSON.stringify({ customModes: [{ slug: "context-manager" }] }, null, 2) + "\n",
				"utf-8",
			)

			const plan = await planEvolutionBootstrap({ projectRoot: dir })
			expect(plan.toCreate.some((i) => i.path === ".kilocodemodes")).toBe(false)
			expect(plan.suggestions.join("\n")).toContain("eval-engineer")
		} finally {
			await rm(dir, { recursive: true, force: true })
		}
	})
})
