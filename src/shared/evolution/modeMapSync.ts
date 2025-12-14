import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import * as path from "node:path"

import YAML from "yaml"
import { createTwoFilesPatch } from "diff"
import { z } from "zod"

import { createProposalV1, type CouncilConfig, type CouncilRoleConfig, type ProposalV1 } from "@roo-code/types"

import { fileExists, formatTimestampForFilename, toRepoRelativePath, writeJsonUnique, writeTextFileUnique } from "./fs"
import { parseCouncilConfigYaml } from "./councilRunner"

const DEFAULT_MODE_MAP_PATH = path.join("docs", "llm-mode-map.yaml")
const DEFAULT_COUNCIL_CONFIG_PATH = path.join(".kilocode", "evolution", "council.yaml")
const DEFAULT_PROPOSALS_DIR = path.join(".kilocode", "evolution", "proposals")

const modeMapCouncilRoleSchema = z
	.object({
		profile: z.string().min(1),
	})
	.strict()

const modeMapSchema = z
	.object({
		version: z.number().int(),
		council: z
			.object({
				roles: z.record(z.string().min(1), modeMapCouncilRoleSchema),
			})
			.strict()
			.optional(),
	})
	.passthrough()

type ModeMap = z.infer<typeof modeMapSchema>

export type ModeMapSyncRoleChange =
	| {
			kind: "update-profile"
			role: string
			from: string
			to: string
	  }
	| {
			kind: "add-role"
			role: string
			to: string
			generated: Pick<CouncilRoleConfig, "profile" | "promptPath" | "rubricId"> // best-effort defaults
	  }

export type ModeMapSyncDriftReport = {
	managedRoles: string[]
	unmanagedRoles: string[]
	changes: ModeMapSyncRoleChange[]
}

export type ModeMapSyncPlan = {
	projectRoot: string
	modeMapPath: string
	councilConfigPath: string
	proposalsDir: string
	beforeCouncilYaml: string | null
	afterCouncilYaml: string
	diffText: string
	drift: ModeMapSyncDriftReport
	summary: string
	proposal: ProposalV1
	proposalDirBaseName: string
}

export type ModeMapSyncWriteProposalResult = {
	proposalDir: string
	proposalJsonPath: string
	councilDiffPath: string
}

export type ModeMapSyncApplyResult = {
	councilConfigPath: string
	changed: boolean
	proposal?: ModeMapSyncWriteProposalResult
}

function normalizeNewlines(text: string): string {
	return text.replace(/\r\n/g, "\n")
}

function parseModeMapYaml(yamlText: string): ModeMap {
	const doc = YAML.parse(yamlText)
	return modeMapSchema.parse(doc)
}

function defaultRoleConfig(role: string, profile: string): CouncilRoleConfig {
	// Best-effort defaults so create-missing-only can still generate a viable council.yaml.
	// Users can customize rubricId/promptPath after bootstrap.
	return {
		profile,
		rubricId: `evolution.${role}.v1`,
		promptPath: `.kilocode/evolution/council-prompts/${role}.md`,
	}
}

function buildNormalizedCouncilConfigYaml(config: CouncilConfig): string {
	const orderedRoles = Object.entries(config.roles)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([role, roleCfg]) => {
			const orderedRoleCfg: CouncilRoleConfig = {
				profile: roleCfg.profile,
				...(roleCfg.rubricId ? { rubricId: roleCfg.rubricId } : {}),
				promptPath: roleCfg.promptPath,
			}
			return [role, orderedRoleCfg] as const
		})

	const normalized: CouncilConfig = {
		version: config.version,
		...(config.councilId ? { councilId: config.councilId } : {}),
		roles: Object.fromEntries(orderedRoles),
	}

	return normalizeNewlines(YAML.stringify(normalized, { indent: 2, lineWidth: 0 })).trimEnd() + "\n"
}

function createUnifiedDiff({ filePath, before, after }: { filePath: string; before: string; after: string }): string {
	if (before === after) return ""

	return normalizeNewlines(
		createTwoFilesPatch(
			`a/${filePath.replace(/\\/g, "/")}`,
			`b/${filePath.replace(/\\/g, "/")}`,
			before,
			after,
			"",
			"",
			{ context: 3 },
		),
	)
}

function summarizeChanges(changes: ModeMapSyncRoleChange[]): string {
	if (changes.length === 0) return "No council.yaml drift detected (already in sync)."

	const updates = changes.filter((c) => c.kind === "update-profile").length
	const adds = changes.filter((c) => c.kind === "add-role").length
	const parts: string[] = []
	if (updates) parts.push(`${updates} profile update(s)`) // seat changes
	if (adds) parts.push(`${adds} role addition(s)`) // create-missing roles
	return `Council config drift detected: ${parts.join(", ")}.`
}

function buildProposal({
	now,
	projectRoot,
	modeMapPathAbs,
	proposalsDirAbs,
	changes,
}: {
	now: Date
	projectRoot: string
	modeMapPathAbs: string
	proposalsDirAbs: string
	changes: ModeMapSyncRoleChange[]
}): { proposal: ProposalV1; proposalDirBaseName: string } {
	const ts = formatTimestampForFilename(now)
	const proposalId = `proposal_mode_map_sync_${ts}`

	const summaryLines = [
		"Mode Map Sync: align .kilocode/evolution/council.yaml with docs/llm-mode-map.yaml.",
		changes.length > 0 ? "" : "(No drift detected.)",
		...changes.map((c) => {
			if (c.kind === "update-profile") {
				return `- roles.${c.role}.profile: ${c.from} → ${c.to}`
			}
			return `- roles.${c.role}: (new) profile=${c.to} (generated prompt/rubric defaults)`
		}),
	]

	const proposal = createProposalV1({
		id: proposalId,
		createdAt: now,
		tracePath: toRepoRelativePath(projectRoot, modeMapPathAbs),
		reportsDir: toRepoRelativePath(projectRoot, proposalsDirAbs),
		summary: summaryLines.filter(Boolean).join("\n"),
		intent: "Keep Evolution Layer governance (council profiles) in sync with the repo mode map.",
		scope: [".kilocode/evolution/council.yaml"],
		risks: [
			"If a referenced profile name does not exist in the active environment (VS Code profiles or CLI profile map), council runs may fail until profiles are created.",
		],
		verification: [
			"Run preview: kilocode evolution mode-map sync --dry-run",
			"If applying: run council review on a known trace to confirm profiles resolve.",
		],
		changes: [{ path: ".kilocode/evolution/council.yaml", reason: "Sync profile fields to mode map" }],
	})

	return { proposal, proposalDirBaseName: `mode-map-sync-${ts}` }
}

async function readOptionalTextFile(absPath: string): Promise<string | null> {
	try {
		return await readFile(absPath, "utf8")
	} catch {
		return null
	}
}

function applyProfileMappingToCouncilConfig({
	existing,
	desiredProfiles,
}: {
	existing: CouncilConfig | null
	desiredProfiles: Record<string, string>
}): { after: CouncilConfig; drift: ModeMapSyncDriftReport } {
	const base: CouncilConfig =
		existing ??
		({
			version: 1,
			councilId: "evolution-mvp",
			roles: {},
		} satisfies CouncilConfig)

	const managedRoles = Object.keys(desiredProfiles).sort((a, b) => a.localeCompare(b))
	const existingRoles = Object.keys(base.roles)
	const unmanagedRoles = existingRoles
		.filter((r) => !Object.prototype.hasOwnProperty.call(desiredProfiles, r))
		.sort((a, b) => a.localeCompare(b))

	const nextRoles: Record<string, CouncilRoleConfig> = { ...base.roles }
	const changes: ModeMapSyncRoleChange[] = []

	for (const role of managedRoles) {
		const desired = desiredProfiles[role]
		const current = base.roles[role]
		if (!current) {
			const generated = defaultRoleConfig(role, desired)
			nextRoles[role] = generated
			changes.push({ kind: "add-role", role, to: desired, generated })
			continue
		}

		if (current.profile !== desired) {
			nextRoles[role] = { ...current, profile: desired }
			changes.push({ kind: "update-profile", role, from: current.profile, to: desired })
		}
	}

	const after: CouncilConfig = {
		version: base.version,
		...(base.councilId ? { councilId: base.councilId } : {}),
		roles: nextRoles,
	}

	return { after, drift: { managedRoles, unmanagedRoles, changes } }
}

export async function planModeMapSync({
	projectRoot,
	modeMapPath = DEFAULT_MODE_MAP_PATH,
	councilConfigPath = DEFAULT_COUNCIL_CONFIG_PATH,
	proposalsDir = DEFAULT_PROPOSALS_DIR,
	now = new Date(),
}: {
	projectRoot: string
	modeMapPath?: string
	councilConfigPath?: string
	proposalsDir?: string
	now?: Date
}): Promise<ModeMapSyncPlan> {
	const modeMapAbs = path.resolve(projectRoot, modeMapPath)
	const councilAbs = path.resolve(projectRoot, councilConfigPath)
	const proposalsAbs = path.resolve(projectRoot, proposalsDir)

	const modeMapRaw = await readOptionalTextFile(modeMapAbs)
	if (modeMapRaw === null) {
		throw new Error(
			`Mode map YAML not found at ${modeMapPath}. Expected at ${DEFAULT_MODE_MAP_PATH} (relative to repo root).`,
		)
	}

	let modeMap: ModeMap
	try {
		modeMap = parseModeMapYaml(modeMapRaw)
	} catch (error) {
		throw new Error(
			`Invalid mode map YAML (${modeMapPath}). ${error instanceof Error ? error.message : String(error)}`,
		)
	}

	if (!modeMap.council?.roles) {
		throw new Error(
			`Mode map YAML (${modeMapPath}) is missing required 'council.roles' mapping. Add it to define desired council profile names.`,
		)
	}

	const desiredProfiles = Object.fromEntries(
		Object.entries(modeMap.council.roles)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([role, cfg]) => [role, cfg.profile] as const),
	)

	const beforeCouncilYamlRaw = await readOptionalTextFile(councilAbs)

	let beforeCouncilConfig: CouncilConfig | null = null
	if (beforeCouncilYamlRaw !== null) {
		try {
			beforeCouncilConfig = parseCouncilConfigYaml(beforeCouncilYamlRaw)
		} catch (error) {
			throw new Error(
				`Invalid council YAML (${councilConfigPath}). ${error instanceof Error ? error.message : String(error)}`,
			)
		}
	}

	const { after: afterCouncilConfig, drift } = applyProfileMappingToCouncilConfig({
		existing: beforeCouncilConfig,
		desiredProfiles,
	})

	const afterCouncilYaml = buildNormalizedCouncilConfigYaml(afterCouncilConfig)
	const beforeCouncilYaml =
		beforeCouncilYamlRaw === null
			? null
			: buildNormalizedCouncilConfigYaml(parseCouncilConfigYaml(beforeCouncilYamlRaw))

	const diffText = createUnifiedDiff({
		filePath: councilConfigPath,
		before: normalizeNewlines(beforeCouncilYaml ?? ""),
		after: normalizeNewlines(afterCouncilYaml),
	})

	const summary = summarizeChanges(drift.changes)

	const proposalBuild = buildProposal({
		now,
		projectRoot,
		modeMapPathAbs: modeMapAbs,
		proposalsDirAbs: proposalsAbs,
		changes: drift.changes,
	})

	return {
		projectRoot,
		modeMapPath,
		councilConfigPath,
		proposalsDir,
		beforeCouncilYaml: beforeCouncilYaml === null ? null : beforeCouncilYamlRaw,
		afterCouncilYaml,
		diffText: drift.changes.length === 0 ? "" : diffText,
		drift,
		summary,
		proposal: proposalBuild.proposal,
		proposalDirBaseName: proposalBuild.proposalDirBaseName,
	}
}

async function mkdirUnique(parentDirAbs: string, baseName: string): Promise<string> {
	await mkdir(parentDirAbs, { recursive: true })

	for (let i = 0; i < 1000; i++) {
		const suffix = i === 0 ? "" : `-${String(i).padStart(3, "0")}`
		const dirName = `${baseName}${suffix}`
		const abs = path.join(parentDirAbs, dirName)

		try {
			await mkdir(abs, { recursive: false })
			return abs
		} catch (error: any) {
			if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") {
				continue
			}
			throw error
		}
	}

	throw new Error(`Failed to find an unused directory name for '${baseName}' in '${parentDirAbs}'.`)
}

export async function writeModeMapSyncProposalArtifacts(
	plan: ModeMapSyncPlan,
): Promise<ModeMapSyncWriteProposalResult> {
	const proposalParentAbs = path.resolve(plan.projectRoot, plan.proposalsDir)
	const proposalDirAbs = await mkdirUnique(proposalParentAbs, plan.proposalDirBaseName)

	const proposalJsonPath = await writeJsonUnique(proposalDirAbs, "proposal.json", plan.proposal)
	const councilDiffPath = await writeTextFileUnique(proposalDirAbs, "council.yaml.diff", plan.diffText || "")

	return { proposalDir: proposalDirAbs, proposalJsonPath, councilDiffPath }
}

async function atomicWriteText(absPath: string, content: string, createOnly: boolean): Promise<void> {
	await mkdir(path.dirname(absPath), { recursive: true })

	if (createOnly) {
		// Create-missing-only: refuse to overwrite.
		await writeFile(absPath, content, { encoding: "utf8", flag: "wx" })
		return
	}

	const tmpPath = `${absPath}.tmp.${process.pid}.${Date.now()}`
	await writeFile(tmpPath, content, { encoding: "utf8" })
	await rename(tmpPath, absPath)
}

export async function applyModeMapSync({
	plan,
	writeProposal = true,
	validateProfileExists,
}: {
	plan: ModeMapSyncPlan
	writeProposal?: boolean
	/**
	 * Optional profile validator.
	 * - VS Code: validate against ProviderSettingsManager profiles
	 * - CLI: validate against .kilocode/evolution/cli-profiles.yaml map
	 */
	validateProfileExists?: (profileName: string) => Promise<boolean>
}): Promise<ModeMapSyncApplyResult> {
	const changed = plan.drift.changes.length > 0

	if (validateProfileExists && changed) {
		const nextProfiles = new Set<string>()
		for (const c of plan.drift.changes) {
			nextProfiles.add(c.to)
		}

		const missing: string[] = []
		for (const profileName of Array.from(nextProfiles).sort((a, b) => a.localeCompare(b))) {
			if (!(await validateProfileExists(profileName))) {
				missing.push(profileName)
			}
		}
		if (missing.length > 0) {
			throw new Error(
				`Cannot apply: the following profile name(s) are not available in this environment: ${missing.join(", ")}.`,
			)
		}
	}

	const proposalResult = writeProposal ? await writeModeMapSyncProposalArtifacts(plan) : undefined

	if (!changed) {
		return {
			councilConfigPath: path.resolve(plan.projectRoot, plan.councilConfigPath),
			changed: false,
			proposal: proposalResult,
		}
	}

	const absCouncil = path.resolve(plan.projectRoot, plan.councilConfigPath)
	const councilExists = await fileExists(absCouncil)

	await atomicWriteText(absCouncil, plan.afterCouncilYaml, !councilExists)

	return {
		councilConfigPath: absCouncil,
		changed: true,
		proposal: proposalResult,
	}
}
