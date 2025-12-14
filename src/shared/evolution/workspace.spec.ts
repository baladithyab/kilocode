import { mkdir } from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "node:os"
import { mkdtemp } from "node:fs/promises"

import { describe, it, expect } from "vitest"

import { getEvolutionRootDir, isEvolutionBootstrapped } from "./workspace"

async function makeTempDir(): Promise<string> {
	return mkdtemp(path.join(tmpdir(), "kilocode-evolution-workspace-"))
}

describe("evolution workspace detection", () => {
	it("isEvolutionBootstrapped returns false when .kilocode is missing", async () => {
		const dir = await makeTempDir()
		expect(await isEvolutionBootstrapped(dir)).toBe(false)
	})

	it("isEvolutionBootstrapped returns true when .kilocode exists", async () => {
		const dir = await makeTempDir()
		await mkdir(getEvolutionRootDir(dir), { recursive: true })
		expect(await isEvolutionBootstrapped(dir)).toBe(true)
	})
})
