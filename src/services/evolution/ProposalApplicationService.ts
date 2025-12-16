import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises"
import * as path from "node:path"

import { applyPatch } from "diff"
import YAML from "yaml"
import { z } from "zod"

import { proposalV1Schema, type ProposalV1 } from "@roo-code/types"

import {
	AutomationLevel,
	inferCategoryFromPath,
	requiresHumanApproval,
	type AutoApplyCategory,
} from "../../shared/evolution/automation"

export type ParsedProposalChange = {
	path: string
	changeType: "create" | "modify" | "delete"
	/** Absolute path to the patch/diff file inside the proposal directory (when available). */
	patchAbsPath?: string
	/** Raw unified diff / patch text. */
	patchText?: string
	reason?: string
	category?: AutoApplyCategory
}

export type ParsedProposal = {
	proposalDirAbs: string
	proposalJsonAbsPath?: string
	proposal?: ProposalV1
	changes: ParsedProposalChange[]
}

export type ApplyResult = {
	applied: boolean
	appliedRecordId?: string
	changedFiles: string[]
	errors?: string[]
}

type AppliedRecordV1 = {
	version: 1
	id: string
	proposalId?: string
	proposalDirRel: string
	appliedAt: string
	changedFiles: string[]
	backupFiles: Array<{
		path: string
		existed: boolean
		backupRelPath?: string
	}>
}

const appliedRecordSchema = z
	.object({
		version: z.literal(1),
		id: z.string().min(1),
		proposalId: z.string().optional(),
		proposalDirRel: z.string().min(1),
		appliedAt: z.string().datetime(),
		changedFiles: z.array(z.string()),
		backupFiles: z.array(
			z.object({
				path: z.string().min(1),
				existed: z.boolean(),
				backupRelPath: z.string().optional(),
			}),
		),
	})
	.strict()

type EvolutionUiConfig = {
	version: 1
	automation_level: number
	last_review_date: string | null
	ab_test_active: boolean
	auto_apply_patterns: string[]
	auto_apply_exclusions: string[]
	triggers?: {
		failure_rate: number
		cost_threshold: number
		cooldown_seconds: number
	}
	safety?: {
		max_daily_runs: number
		auto_apply_types: AutoApplyCategory[]
	}
}

const evolutionUiConfigSchema = z
	.object({
		version: z.literal(1).default(1),
		automation_level: z.number().int().min(0).max(3).default(0),
		last_review_date: z.string().datetime().nullable().default(null),
		ab_test_active: z.boolean().default(false),
		auto_apply_patterns: z.array(z.string()).default([]),
		auto_apply_exclusions: z.array(z.string()).default([]),
		triggers: z
			.object({
				failure_rate: z.number().min(0).max(1).default(0.3),
				cost_threshold: z.number().min(0).default(100),
				cooldown_seconds: z.number().int().min(0).default(3600),
			})
			.optional(),
		safety: z
			.object({
				max_daily_runs: z.number().int().min(0).default(5),
				auto_apply_types: z
					.array(z.enum(["mode-map", "docs", "memory", "rubric"]))
					.default(["mode-map", "docs"]),
			})
			.optional(),
	})
	.strict()

function normalizeRelPath(p: string): string {
	return p.replace(/\\/g, "/")
}

function globToRegExp(glob: string): RegExp {
	// Very small glob subset:
	// - `*` matches within a path segment
	// - `**` matches across path segments
	// Patterns are anchored.
	const normalized = glob.replace(/\\/g, "/")

	let re = "^"
	for (let i = 0; i < normalized.length; i++) {
		const ch = normalized[i]
		if (ch === "*") {
			const next = normalized[i + 1]
			if (next === "*") {
				re += ".*"
				i++
			} else {
				re += "[^/]*"
			}
			continue
		}

		// Escape regex special chars
		if (/[.+^${}()|[\]\\]/.test(ch)) {
			re += `\\${ch}`
		} else {
			re += ch
		}
	}
	return new RegExp(re + "$", "i")
}

function matchesAnyGlob(filePath: string, patterns: string[]): boolean {
	if (patterns.length === 0) return false
	const normalized = normalizeRelPath(filePath)
	return patterns.some((p) => globToRegExp(p).test(normalized))
}

function isPathAllowedByConfig(filePath: string, config: EvolutionUiConfig): boolean {
	const normalized = normalizeRelPath(filePath)
	if (matchesAnyGlob(normalized, config.auto_apply_exclusions)) {
		return false
	}
	if (config.auto_apply_patterns.length === 0) {
		// If not configured, default-deny for safety.
		return false
	}
	return matchesAnyGlob(normalized, config.auto_apply_patterns)
}

async function fileExists(absPath: string): Promise<boolean> {
	try {
		await stat(absPath)
		return true
	} catch {
		return false
	}
}

async function atomicWriteText(absPath: string, content: string): Promise<void> {
	await mkdir(path.dirname(absPath), { recursive: true })
	const tmpPath = `${absPath}.tmp.${process.pid}.${Date.now()}`
	await writeFile(tmpPath, content, { encoding: "utf8" })
	await rename(tmpPath, absPath)
}

function parseUnifiedDiffTargetPath(patchText: string): { oldPath: string | null; newPath: string | null } {
	const oldMatch = patchText.match(/^---\s+([^\t\n\r]+).*$/m)
	const newMatch = patchText.match(/^\+\+\+\s+([^\t\n\r]+).*$/m)

	const stripPrefix = (s: string) => s.replace(/^a\//, "").replace(/^b\//, "")

	const rawOld = oldMatch?.[1] ? stripPrefix(oldMatch[1]) : null
	const rawNew = newMatch?.[1] ? stripPrefix(newMatch[1]) : null

	const oldPath = rawOld === "/dev/null" ? null : rawOld
	const newPath = rawNew === "/dev/null" ? null : rawNew

	return { oldPath, newPath }
}

function inferChangeTypeFromPatch(patchText: string): "create" | "modify" | "delete" {
	const { oldPath, newPath } = parseUnifiedDiffTargetPath(patchText)
	if (oldPath === null && newPath) return "create"
	if (oldPath && newPath === null) return "delete"
	return "modify"
}

function isInsideProjectRoot(projectRootAbs: string, targetAbs: string): boolean {
	const rel = path.relative(projectRootAbs, targetAbs)
	return !!rel && !rel.startsWith("..") && !path.isAbsolute(rel)
}

function newAppliedRecordId(): string {
	return `applied.${new Date().toISOString().replace(/[:.]/g, "-")}.${Math.random().toString(36).slice(2, 8)}`
}

export class ProposalApplicationService {
	private readonly projectRootAbs: string
	private readonly evolutionConfigAbsPath: string

	constructor(args: { projectRoot: string; evolutionConfigPath?: string }) {
		this.projectRootAbs = args.projectRoot
		this.evolutionConfigAbsPath = path.resolve(
			this.projectRootAbs,
			args.evolutionConfigPath ?? path.join(".kilocode", "evolution", "config.yaml"),
		)
	}

	private async loadEvolutionUiConfig(): Promise<EvolutionUiConfig> {
		if (!(await fileExists(this.evolutionConfigAbsPath))) {
			return {
				version: 1,
				automation_level: 0,
				last_review_date: null,
				ab_test_active: false,
				auto_apply_patterns: [],
				auto_apply_exclusions: [],
			}
		}

		const raw = await readFile(this.evolutionConfigAbsPath, "utf8")
		const parsed = YAML.parse(raw)
		return evolutionUiConfigSchema.parse(parsed)
	}

	async parseProposal(proposalPath: string): Promise<ParsedProposal> {
		const proposalAbsPath = path.isAbsolute(proposalPath)
			? proposalPath
			: path.resolve(this.projectRootAbs, proposalPath)

		const proposalDirAbs = (await stat(proposalAbsPath)).isDirectory()
			? proposalAbsPath
			: path.dirname(proposalAbsPath)

		const entries = await readdir(proposalDirAbs, { withFileTypes: true })
		const jsonCandidates = entries
			.filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".json"))
			.map((e) => e.name)

		const proposalJsonFile =
			jsonCandidates.find((n) => n === "proposal.v1.json") ??
			jsonCandidates.find((n) => n === "proposal.json") ??
			jsonCandidates.find((n) => n.startsWith("proposal") && n.endsWith(".json"))

		let proposal: ProposalV1 | undefined
		let proposalJsonAbsPath: string | undefined
		if (proposalJsonFile) {
			proposalJsonAbsPath = path.join(proposalDirAbs, proposalJsonFile)
			try {
				const raw = await readFile(proposalJsonAbsPath, "utf8")
				proposal = proposalV1Schema.parse(JSON.parse(raw))
			} catch {
				// If parsing fails, treat it as absent; automation should refuse to apply.
				proposal = undefined
			}
		}

		const patchFiles = entries
			.filter((e) => e.isFile() && (e.name.endsWith(".diff") || e.name.endsWith(".patch")))
			.map((e) => path.join(proposalDirAbs, e.name))

		const changes: ParsedProposalChange[] = []
		const seen = new Set<string>()

		// Prefer patch artifacts because they are actionable.
		for (const patchAbsPath of patchFiles) {
			const patchText = await readFile(patchAbsPath, "utf8")
			const { oldPath, newPath } = parseUnifiedDiffTargetPath(patchText)
			const targetPath = newPath ?? oldPath
			if (!targetPath) continue

			const relTargetPath = normalizeRelPath(targetPath)
			if (seen.has(relTargetPath)) continue
			seen.add(relTargetPath)

			changes.push({
				path: relTargetPath,
				changeType: inferChangeTypeFromPatch(patchText),
				patchAbsPath,
				patchText,
				category: inferCategoryFromPath(relTargetPath),
			})
		}

		// Include declared proposal change paths even if there are no patches.
		for (const c of proposal?.changes ?? []) {
			const rel = normalizeRelPath(c.path)
			if (seen.has(rel)) continue
			seen.add(rel)
			changes.push({
				path: rel,
				changeType: "modify",
				reason: c.reason,
				category: inferCategoryFromPath(rel),
			})
		}

		return {
			proposalDirAbs,
			proposalJsonAbsPath,
			proposal,
			changes,
		}
	}

	private isEligibleToApply(proposal: ParsedProposal, config: EvolutionUiConfig): boolean {
		if (proposal.changes.length === 0) {
			return false
		}

		for (const change of proposal.changes) {
			if (requiresHumanApproval(change.path)) {
				return false
			}
			if (!isPathAllowedByConfig(change.path, config)) {
				return false
			}
			// For safety: refuse to apply if no patch is present.
			if (!change.patchText) {
				return false
			}
		}

		return true
	}

	async canApplyWithApproval(proposal: ParsedProposal): Promise<boolean> {
		const config = await this.loadEvolutionUiConfig()
		return this.isEligibleToApply(proposal, config)
	}

	async canAutoApply(proposal: ParsedProposal): Promise<boolean> {
		const config = await this.loadEvolutionUiConfig()
		if (config.automation_level < AutomationLevel.AutoApplyLowRisk) {
			return false
		}
		return this.isEligibleToApply(proposal, config)
	}

	async applyProposal(proposal: ParsedProposal): Promise<ApplyResult> {
		const errors: string[] = []

		const config = await this.loadEvolutionUiConfig()
		const eligible = this.isEligibleToApply(proposal, config)
		if (!eligible) {
			return {
				applied: false,
				changedFiles: [],
				errors: ["Proposal is not eligible to apply (blocked by config)"],
			}
		}

		const recordId = newAppliedRecordId()
		const appliedDirAbs = path.resolve(this.projectRootAbs, ".kilocode", "evolution", "applied")
		const backupsDirAbs = path.join(appliedDirAbs, "backups", recordId)
		await mkdir(backupsDirAbs, { recursive: true })

		const backups: AppliedRecordV1["backupFiles"] = []
		const changedFiles: string[] = []

		const rollbackUsingBackups = async () => {
			for (const b of backups.slice().reverse()) {
				const absTarget = path.resolve(this.projectRootAbs, b.path)
				try {
					if (!isInsideProjectRoot(this.projectRootAbs, absTarget)) {
						continue
					}
					if (!b.existed) {
						await rm(absTarget, { force: true })
						continue
					}
					if (!b.backupRelPath) continue
					const absBackup = path.resolve(appliedDirAbs, b.backupRelPath)
					const content = await readFile(absBackup, "utf8")
					await atomicWriteText(absTarget, content)
				} catch (e) {
					// best-effort rollback; collect only
					errors.push(`Rollback failed for ${b.path}: ${e instanceof Error ? e.message : String(e)}`)
				}
			}
		}

		try {
			for (const change of proposal.changes) {
				const relPath = normalizeRelPath(change.path)
				if (requiresHumanApproval(relPath)) {
					throw new Error(`Refusing to apply protected path: ${relPath}`)
				}

				const absTarget = path.resolve(this.projectRootAbs, relPath)
				if (!isInsideProjectRoot(this.projectRootAbs, absTarget)) {
					throw new Error(`Refusing to write outside project root: ${relPath}`)
				}

				const existed = await fileExists(absTarget)
				let backupRelPath: string | undefined
				if (existed) {
					backupRelPath = path.join("backups", recordId, relPath)
					const absBackup = path.resolve(appliedDirAbs, backupRelPath)
					await mkdir(path.dirname(absBackup), { recursive: true })
					const content = await readFile(absTarget, "utf8")
					await writeFile(absBackup, content, "utf8")
				}
				backups.push({ path: relPath, existed, backupRelPath })

				if (!change.patchText) {
					throw new Error(`Missing patch for ${relPath}`)
				}

				const before = existed ? await readFile(absTarget, "utf8") : ""
				const patched = applyPatch(before, change.patchText)
				if (patched === false) {
					throw new Error(`Failed to apply patch for ${relPath}`)
				}

				if (change.changeType === "delete") {
					await rm(absTarget, { force: true })
				} else {
					await atomicWriteText(absTarget, patched)
				}

				changedFiles.push(relPath)
			}
		} catch (e) {
			errors.push(e instanceof Error ? e.message : String(e))
			await rollbackUsingBackups()
			return { applied: false, changedFiles, errors }
		}

		const record: AppliedRecordV1 = {
			version: 1,
			id: recordId,
			proposalId: proposal.proposal?.id,
			proposalDirRel: path.relative(this.projectRootAbs, proposal.proposalDirAbs).replace(/\\/g, "/"),
			appliedAt: new Date().toISOString(),
			changedFiles,
			backupFiles: backups,
		}

		const recordJsonRel = path.join(".kilocode", "evolution", "applied", `${recordId}.json`)
		const recordJsonAbs = path.resolve(this.projectRootAbs, recordJsonRel)
		await mkdir(path.dirname(recordJsonAbs), { recursive: true })
		await atomicWriteText(recordJsonAbs, JSON.stringify(record, null, 2) + "\n")

		const recordMdAbs = path.resolve(this.projectRootAbs, ".kilocode", "evolution", "applied", `${recordId}.md`)
		const mdLines = [
			`# Applied: ${proposal.proposal?.id ?? recordId}`,
			"",
			"## Proposal reference",
			"",
			`- Proposal dir: \`${record.proposalDirRel}\``,
			proposal.proposal?.id ? `- Proposal ID: \`${proposal.proposal.id}\`` : "",
			"",
			"## Patch summary",
			"",
			"- Files changed:",
			...changedFiles.map((p) => `  - \`${p}\``),
			"",
			"## Verification notes",
			"",
			"- Auto-applied by ProposalApplicationService.",
		]
			.filter(Boolean)
			.join("\n")
		await atomicWriteText(recordMdAbs, mdLines + "\n")

		const auditLogAbs = path.resolve(this.projectRootAbs, ".kilocode", "evolution", "applied", "audit.log")
		await mkdir(path.dirname(auditLogAbs), { recursive: true })
		await writeFile(
			auditLogAbs,
			JSON.stringify({ ts: new Date().toISOString(), event: "proposal.applied", recordId, changedFiles }) + "\n",
			{ encoding: "utf8", flag: "a" },
		)

		return {
			applied: true,
			appliedRecordId: recordId,
			changedFiles,
			errors: errors.length > 0 ? errors : undefined,
		}
	}

	async rollbackProposal(appliedRecordId: string): Promise<void> {
		const recordAbs = path.resolve(
			this.projectRootAbs,
			".kilocode",
			"evolution",
			"applied",
			`${appliedRecordId}.json`,
		)
		if (!(await fileExists(recordAbs))) {
			throw new Error(`Applied record not found: ${appliedRecordId}`)
		}

		const raw = await readFile(recordAbs, "utf8")
		const record = appliedRecordSchema.parse(JSON.parse(raw))
		const appliedDirAbs = path.resolve(this.projectRootAbs, ".kilocode", "evolution", "applied")

		for (const b of record.backupFiles.slice().reverse()) {
			const absTarget = path.resolve(this.projectRootAbs, b.path)
			if (!isInsideProjectRoot(this.projectRootAbs, absTarget)) {
				continue
			}

			if (!b.existed) {
				await rm(absTarget, { force: true })
				continue
			}

			if (!b.backupRelPath) {
				throw new Error(`Missing backup path for ${b.path} in record ${appliedRecordId}`)
			}

			const absBackup = path.resolve(appliedDirAbs, b.backupRelPath)
			if (!(await fileExists(absBackup))) {
				throw new Error(`Backup file missing for ${b.path}: ${b.backupRelPath}`)
			}

			const content = await readFile(absBackup, "utf8")
			await atomicWriteText(absTarget, content)
		}

		const auditLogAbs = path.resolve(this.projectRootAbs, ".kilocode", "evolution", "applied", "audit.log")
		await writeFile(
			auditLogAbs,
			JSON.stringify({ ts: new Date().toISOString(), event: "proposal.rolledBack", recordId: appliedRecordId }) +
				"\n",
			{ encoding: "utf8", flag: "a" },
		)
	}
}
