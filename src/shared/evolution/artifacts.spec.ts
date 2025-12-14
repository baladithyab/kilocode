import { mkdir, writeFile, utimes } from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "node:os"
import { mkdtemp } from "node:fs/promises"

import { findLatestDirEntry, findLatestEvolutionArtifact } from "./artifacts"

async function makeTempDir(): Promise<string> {
	return mkdtemp(path.join(tmpdir(), "kilocode-evolution-artifacts-"))
}

describe("evolution artifacts", () => {
	it("findLatestDirEntry picks newest matching file by mtime", async () => {
		const dir = await makeTempDir()
		const rel = path.join(".kilocode", "traces", "runs")
		const absDir = path.join(dir, rel)
		await mkdir(absDir, { recursive: true })

		const a = path.join(absDir, "trace.v1.aaa.json")
		const b = path.join(absDir, "trace.v1.bbb.json")
		await writeFile(a, "{}", "utf8")
		await writeFile(b, "{}", "utf8")

		await utimes(a, new Date(1_000), new Date(1_000))
		await utimes(b, new Date(2_000), new Date(2_000))

		const latest = await findLatestDirEntry({
			projectRoot: dir,
			dirRel: rel,
			filter: (ent) => ent.isFile() && ent.name.startsWith("trace.v1.") && ent.name.endsWith(".json"),
		})

		expect(latest?.name).toBe("trace.v1.bbb.json")
		expect(latest?.relPath).toBe(".kilocode/traces/runs/trace.v1.bbb.json")
	})

	it("findLatestEvolutionArtifact(trace) returns undefined when directory is missing", async () => {
		const dir = await makeTempDir()
		const latest = await findLatestEvolutionArtifact({ projectRoot: dir, kind: "trace" })
		expect(latest).toBeUndefined()
	})

	it("findLatestEvolutionArtifact(proposal) prefers proposal.md when present", async () => {
		const dir = await makeTempDir()
		const proposalsDir = path.join(dir, ".kilocode", "evolution", "proposals")
		await mkdir(proposalsDir, { recursive: true })

		const proposalA = path.join(proposalsDir, "proposal.v1.older")
		const proposalB = path.join(proposalsDir, "proposal.v1.newer")
		await mkdir(proposalA, { recursive: true })
		await mkdir(proposalB, { recursive: true })

		await writeFile(path.join(proposalA, "proposal.json"), "{}", "utf8")
		await writeFile(path.join(proposalB, "proposal.md"), "# hi", "utf8")

		await utimes(proposalA, new Date(1_000), new Date(1_000))
		await utimes(proposalB, new Date(2_000), new Date(2_000))

		const latest = await findLatestEvolutionArtifact({ projectRoot: dir, kind: "proposal" })
		expect(latest?.relPath).toBe(".kilocode/evolution/proposals/proposal.v1.newer")
		expect(latest?.openRelPath).toBe(".kilocode/evolution/proposals/proposal.v1.newer/proposal.md")
	})
})
