import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"

import { ProposalApplicationService } from "./ProposalApplicationService"

async function writeYamlConfig(args: {
	projectRoot: string
	automationLevel: number
	autoApplyPatterns: string[]
	autoApplyExclusions?: string[]
}): Promise<void> {
	const q = (s: string) => JSON.stringify(s)

	const cfg = [
		"version: 1",
		`automation_level: ${args.automationLevel}`,
		"last_review_date: null",
		"ab_test_active: false",
		"auto_apply_patterns:",
		...args.autoApplyPatterns.map((p) => `  - ${q(p)}`),
		(args.autoApplyExclusions ?? []).length > 0
			? "auto_apply_exclusions:\n" + (args.autoApplyExclusions ?? []).map((p) => `  - ${q(p)}`).join("\n")
			: "auto_apply_exclusions: []",
	]
		.join("\n")
		.concat("\n")

	const abs = path.join(args.projectRoot, ".kilocode", "evolution", "config.yaml")
	await mkdir(path.dirname(abs), { recursive: true })
	await writeFile(abs, cfg, "utf8")
}

async function writeProposalPatch(args: {
	projectRoot: string
	proposalDirName: string
	patchFileName: string
	patch: string
}) {
	const proposalDirAbs = path.join(args.projectRoot, ".kilocode", "evolution", "proposals", args.proposalDirName)
	await mkdir(proposalDirAbs, { recursive: true })
	await writeFile(path.join(proposalDirAbs, args.patchFileName), args.patch, "utf8")
	return proposalDirAbs
}

describe("ProposalApplicationService", () => {
	let projectRoot: string

	beforeEach(async () => {
		projectRoot = await mkdtemp(path.join(os.tmpdir(), "kilocode-proposal-"))
	})

	afterEach(async () => {
		await rm(projectRoot, { recursive: true, force: true })
	})

	test("parseProposal() extracts changes from patch files", async () => {
		await writeYamlConfig({
			projectRoot,
			automationLevel: 2,
			autoApplyPatterns: ["docs/**"],
		})

		const patch = [
			"--- a/docs/demo.md",
			"+++ b/docs/demo.md",
			"@@ -1,1 +1,1 @@",
			"-hello",
			"+hello world",
			"",
		].join("\n")

		const proposalDirAbs = await writeProposalPatch({
			projectRoot,
			proposalDirName: "proposal-1",
			patchFileName: "change.patch",
			patch,
		})

		const service = new ProposalApplicationService({ projectRoot })
		const parsed = await service.parseProposal(proposalDirAbs)

		expect(parsed.proposalDirAbs).toBe(proposalDirAbs)
		expect(parsed.changes).toHaveLength(1)
		expect(parsed.changes[0].path).toBe("docs/demo.md")
		expect(parsed.changes[0].changeType).toBe("modify")
		expect(parsed.changes[0].patchText).toContain("hello world")
	})

	test("canAutoApply() requires automation_level >= 2 but canApplyWithApproval() does not", async () => {
		await writeYamlConfig({
			projectRoot,
			automationLevel: 1,
			autoApplyPatterns: ["docs/**"],
		})

		const patch = [
			"--- a/docs/demo.md",
			"+++ b/docs/demo.md",
			"@@ -1,1 +1,1 @@",
			"-hello",
			"+hello world",
			"",
		].join("\n")

		const proposalDirAbs = await writeProposalPatch({
			projectRoot,
			proposalDirName: "proposal-2",
			patchFileName: "change.patch",
			patch,
		})

		const service = new ProposalApplicationService({ projectRoot })
		const parsed = await service.parseProposal(proposalDirAbs)

		expect(await service.canAutoApply(parsed)).toBe(false)
		expect(await service.canApplyWithApproval(parsed)).toBe(true)
	})

	test("applyProposal() applies patch, writes applied record + backups, and rollbackProposal() restores", async () => {
		await writeYamlConfig({
			projectRoot,
			automationLevel: 2,
			autoApplyPatterns: ["docs/**"],
		})

		const targetAbs = path.join(projectRoot, "docs", "demo.md")
		await mkdir(path.dirname(targetAbs), { recursive: true })
		await writeFile(targetAbs, "hello\n", "utf8")

		const patch = [
			"--- a/docs/demo.md",
			"+++ b/docs/demo.md",
			"@@ -1,1 +1,1 @@",
			"-hello",
			"+hello world",
			"",
		].join("\n")

		const proposalDirAbs = await writeProposalPatch({
			projectRoot,
			proposalDirName: "proposal-3",
			patchFileName: "change.patch",
			patch,
		})

		const service = new ProposalApplicationService({ projectRoot })
		const parsed = await service.parseProposal(proposalDirAbs)

		const applyResult = await service.applyProposal(parsed)
		expect(applyResult.applied).toBe(true)
		expect(applyResult.appliedRecordId).toBeTruthy()
		expect(applyResult.changedFiles).toEqual(["docs/demo.md"])

		const newContent = await readFile(targetAbs, "utf8")
		expect(newContent).toBe("hello world\n")

		const recordId = applyResult.appliedRecordId!
		const recordAbs = path.join(projectRoot, ".kilocode", "evolution", "applied", `${recordId}.json`)
		const recordJson = JSON.parse(await readFile(recordAbs, "utf8"))
		expect(recordJson.id).toBe(recordId)
		expect(recordJson.changedFiles).toEqual(["docs/demo.md"])

		const backupAbs = path.join(
			projectRoot,
			".kilocode",
			"evolution",
			"applied",
			recordJson.backupFiles[0].backupRelPath,
		)
		const backupContent = await readFile(backupAbs, "utf8")
		expect(backupContent).toBe("hello\n")

		await service.rollbackProposal(recordId)
		const rolledBack = await readFile(targetAbs, "utf8")
		expect(rolledBack).toBe("hello\n")
	})

	test("applyProposal() is atomic-ish: if patch fails, file contents are restored and no record is written", async () => {
		await writeYamlConfig({
			projectRoot,
			automationLevel: 2,
			autoApplyPatterns: ["docs/**"],
		})

		const targetAbs = path.join(projectRoot, "docs", "demo.md")
		await mkdir(path.dirname(targetAbs), { recursive: true })
		await writeFile(targetAbs, "hello\n", "utf8")

		const badPatch = [
			"--- a/docs/demo.md",
			"+++ b/docs/demo.md",
			"@@ -1,1 +1,1 @@",
			"-does-not-match",
			"+hello world",
			"",
		].join("\n")

		const proposalDirAbs = await writeProposalPatch({
			projectRoot,
			proposalDirName: "proposal-4",
			patchFileName: "change.patch",
			patch: badPatch,
		})

		const service = new ProposalApplicationService({ projectRoot })
		const parsed = await service.parseProposal(proposalDirAbs)

		const result = await service.applyProposal(parsed)
		expect(result.applied).toBe(false)

		// File should be restored.
		const content = await readFile(targetAbs, "utf8")
		expect(content).toBe("hello\n")

		// No applied record JSON should exist.
		const appliedDirAbs = path.join(projectRoot, ".kilocode", "evolution", "applied")
		let jsonFiles: string[] = []
		try {
			jsonFiles = (await readdir(appliedDirAbs)).filter((n) => n.endsWith(".json"))
		} catch {
			jsonFiles = []
		}
		expect(jsonFiles).toHaveLength(0)
	})

	test("applyProposal() respects exclusions even when patterns are permissive", async () => {
		await writeYamlConfig({
			projectRoot,
			automationLevel: 2,
			autoApplyPatterns: ["**"],
			autoApplyExclusions: ["package.json"],
		})

		const pkgAbs = path.join(projectRoot, "package.json")
		await writeFile(pkgAbs, '{\n  "name": "x"\n}\n', "utf8")

		const patch = [
			"--- a/package.json",
			"+++ b/package.json",
			"@@ -1,3 +1,3 @@",
			" {",
			'-  "name": "x"',
			'+  "name": "y"',
			" }",
			"",
		].join("\n")

		const proposalDirAbs = await writeProposalPatch({
			projectRoot,
			proposalDirName: "proposal-5",
			patchFileName: "pkg.patch",
			patch,
		})

		const service = new ProposalApplicationService({ projectRoot })
		const parsed = await service.parseProposal(proposalDirAbs)

		expect(await service.canApplyWithApproval(parsed)).toBe(false)

		const result = await service.applyProposal(parsed)
		expect(result.applied).toBe(false)

		const after = await readFile(pkgAbs, "utf8")
		expect(after).toContain('"name": "x"')
	})
})
