import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises"
import * as path from "node:path"

import YAML from "yaml"
import { z } from "zod"

import { councilConfigSchema, type CouncilConfig } from "@roo-code/types"

import type { ClineProvider } from "../../core/webview/ClineProvider"
import type { ExtensionMessage } from "../../shared/ExtensionMessage"
import type { WebviewMessage } from "../../shared/WebviewMessage"
import { DEFAULT_AUTOMATION_CONFIG, type AutoApplyCategory } from "../../shared/evolution/automation"

import * as vscode from "vscode"

type EvolutionConfigV1 = {
	version: 1
	automation_level: number
	last_review_date: string | null
	ab_test_active: boolean
	auto_apply_patterns: string[]
	auto_apply_exclusions: string[]
	triggers: {
		failure_rate: number
		cost_threshold: number
		cooldown_seconds: number
	}
	safety: {
		max_daily_runs: number
		auto_apply_types: AutoApplyCategory[]
	}
}

const evolutionConfigSchema = z
	.object({
		version: z.literal(1).default(1),
		automation_level: z.number().int().min(0).max(3).default(0),
		last_review_date: z.string().datetime().nullable().default(null),
		ab_test_active: z.boolean().default(false),
		auto_apply_patterns: z.array(z.string()).default([]),
		auto_apply_exclusions: z.array(z.string()).default([]),
		triggers: z
			.object({
				failure_rate: z.number().min(0).max(1).default(DEFAULT_AUTOMATION_CONFIG.triggers.failureRate),
				cost_threshold: z.number().min(0).default(DEFAULT_AUTOMATION_CONFIG.triggers.costThreshold),
				cooldown_seconds: z.number().int().min(0).default(DEFAULT_AUTOMATION_CONFIG.triggers.cooldown),
			})
			.default({
				failure_rate: DEFAULT_AUTOMATION_CONFIG.triggers.failureRate,
				cost_threshold: DEFAULT_AUTOMATION_CONFIG.triggers.costThreshold,
				cooldown_seconds: DEFAULT_AUTOMATION_CONFIG.triggers.cooldown,
			}),
		safety: z
			.object({
				max_daily_runs: z.number().int().min(0).default(DEFAULT_AUTOMATION_CONFIG.safety.maxDailyRuns),
				auto_apply_types: z
					.array(z.enum(["mode-map", "docs", "memory", "rubric"]))
					.default(DEFAULT_AUTOMATION_CONFIG.safety.autoApplyTypes),
			})
			.default({
				max_daily_runs: DEFAULT_AUTOMATION_CONFIG.safety.maxDailyRuns,
				auto_apply_types: DEFAULT_AUTOMATION_CONFIG.safety.autoApplyTypes,
			}),
	})
	.strict()

function normalizeNewlines(text: string): string {
	return text.replace(/\r\n/g, "\n")
}

async function fileExists(absPath: string): Promise<boolean> {
	try {
		await stat(absPath)
		return true
	} catch {
		return false
	}
}

function parseProfilesFromDocs(md: string): string[] {
	// docs/kilo-profiles.md defines profiles as markdown headings.
	// Historically we accepted "## Profile: <name>". The current repo format uses
	// code-styled slugs like: "### `context-manager`".
	//
	// We accept:
	// - "##/### Profile: <name>" (legacy / explicit)
	// - "##/### `<slug>`" (preferred for this repo)
	// - "##/### <slug>" where <slug> is lowercase-with-dashes (fallback)
	const lines = md.split(/\r?\n/)
	const names = new Set<string>()
	for (const line of lines) {
		const mProfile = line.match(/^#{2,3}\s+Profile:\s+(.+)\s*$/i)
		if (mProfile?.[1]) {
			names.add(mProfile[1].trim())
			continue
		}

		const mBacktick = line.match(/^#{2,3}\s+`([^`]+)`\s*$/)
		if (mBacktick?.[1]) {
			names.add(mBacktick[1].trim())
			continue
		}

		// Avoid accidentally treating headings like "### Existing repo modes" as profiles.
		const mSlug = line.match(/^#{2,3}\s+([a-z0-9][a-z0-9-]{0,80})\s*$/)
		if (mSlug?.[1]) {
			names.add(mSlug[1].trim())
		}
	}
	return Array.from(names).sort((a, b) => a.localeCompare(b))
}

function buildNormalizedCouncilYaml(config: CouncilConfig): string {
	const orderedRoles = Object.entries(config.roles)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([role, roleCfg]) => {
			const orderedRoleCfg = {
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

function configDefaultsForLevel(
	level: number,
): Pick<EvolutionConfigV1, "ab_test_active" | "auto_apply_patterns" | "auto_apply_exclusions" | "triggers" | "safety"> {
	const commonExclusions = [
		".github/**",
		"package.json",
		"pnpm-lock.yaml",
		".kilocode/evolution/**",
		".kilocode/rules/**",
	]

	// For safety: default-deny until level 2+.
	const basePatterns: string[] = []
	const level2Patterns = ["docs/**", "mode-map.json"]

	if (level >= 3) {
		return {
			ab_test_active: true,
			auto_apply_patterns: level2Patterns,
			auto_apply_exclusions: commonExclusions,
			triggers: {
				failure_rate: DEFAULT_AUTOMATION_CONFIG.triggers.failureRate,
				cost_threshold: DEFAULT_AUTOMATION_CONFIG.triggers.costThreshold,
				cooldown_seconds: DEFAULT_AUTOMATION_CONFIG.triggers.cooldown,
			},
			safety: {
				max_daily_runs: DEFAULT_AUTOMATION_CONFIG.safety.maxDailyRuns,
				auto_apply_types: ["mode-map", "docs", "memory", "rubric"],
			},
		}
	}

	if (level >= 2) {
		return {
			ab_test_active: false,
			auto_apply_patterns: level2Patterns,
			auto_apply_exclusions: commonExclusions,
			triggers: {
				failure_rate: DEFAULT_AUTOMATION_CONFIG.triggers.failureRate,
				cost_threshold: DEFAULT_AUTOMATION_CONFIG.triggers.costThreshold,
				cooldown_seconds: DEFAULT_AUTOMATION_CONFIG.triggers.cooldown,
			},
			safety: {
				max_daily_runs: DEFAULT_AUTOMATION_CONFIG.safety.maxDailyRuns,
				auto_apply_types: ["mode-map", "docs"],
			},
		}
	}

	if (level >= 1) {
		return {
			ab_test_active: false,
			// Level 1 is user-approved (not automatic), but we still populate safe patterns so
			// the user can apply low-risk proposals with an explicit confirmation.
			auto_apply_patterns: level2Patterns,
			auto_apply_exclusions: commonExclusions,
			triggers: {
				failure_rate: DEFAULT_AUTOMATION_CONFIG.triggers.failureRate,
				cost_threshold: DEFAULT_AUTOMATION_CONFIG.triggers.costThreshold,
				cooldown_seconds: DEFAULT_AUTOMATION_CONFIG.triggers.cooldown,
			},
			safety: {
				max_daily_runs: DEFAULT_AUTOMATION_CONFIG.safety.maxDailyRuns,
				auto_apply_types: DEFAULT_AUTOMATION_CONFIG.safety.autoApplyTypes,
			},
		}
	}

	return {
		ab_test_active: false,
		auto_apply_patterns: basePatterns,
		auto_apply_exclusions: commonExclusions,
		triggers: {
			failure_rate: DEFAULT_AUTOMATION_CONFIG.triggers.failureRate,
			cost_threshold: DEFAULT_AUTOMATION_CONFIG.triggers.costThreshold,
			cooldown_seconds: DEFAULT_AUTOMATION_CONFIG.triggers.cooldown,
		},
		safety: {
			max_daily_runs: DEFAULT_AUTOMATION_CONFIG.safety.maxDailyRuns,
			auto_apply_types: DEFAULT_AUTOMATION_CONFIG.safety.autoApplyTypes,
		},
	}
}

async function readEvolutionConfig(configAbsPath: string): Promise<EvolutionConfigV1> {
	if (!(await fileExists(configAbsPath))) {
		const defaults = configDefaultsForLevel(0)
		return evolutionConfigSchema.parse({
			version: 1,
			automation_level: 0,
			last_review_date: null,
			ab_test_active: defaults.ab_test_active,
			auto_apply_patterns: defaults.auto_apply_patterns,
			auto_apply_exclusions: defaults.auto_apply_exclusions,
			triggers: defaults.triggers,
			safety: defaults.safety,
		})
	}

	const raw = await readFile(configAbsPath, "utf8")
	const doc = YAML.parse(raw)
	return evolutionConfigSchema.parse(doc)
}

async function writeEvolutionConfig(configAbsPath: string, cfg: EvolutionConfigV1): Promise<void> {
	await mkdir(path.dirname(configAbsPath), { recursive: true })
	const yaml = normalizeNewlines(YAML.stringify(cfg, { indent: 2, lineWidth: 0 })).trimEnd() + "\n"
	await writeFile(configAbsPath, yaml, "utf8")
}

async function countPendingProposals(projectRoot: string): Promise<number> {
	const proposalsAbs = path.resolve(projectRoot, ".kilocode", "evolution", "proposals")
	const appliedAbs = path.resolve(projectRoot, ".kilocode", "evolution", "applied")

	const proposalsExists = await fileExists(proposalsAbs)
	if (!proposalsExists) return 0

	const proposalDirs = (await readdir(proposalsAbs, { withFileTypes: true }))
		.filter((e) => e.isDirectory())
		.map((e) => e.name)

	const appliedExists = await fileExists(appliedAbs)
	if (!appliedExists) return proposalDirs.length

	const appliedJsonFiles = (await readdir(appliedAbs, { withFileTypes: true }))
		.filter((e) => e.isFile() && e.name.endsWith(".json"))
		.map((e) => e.name)

	const appliedProposalDirs = new Set<string>()
	for (const file of appliedJsonFiles) {
		try {
			const raw = await readFile(path.join(appliedAbs, file), "utf8")
			const parsed = JSON.parse(raw)
			if (typeof parsed?.proposalDirRel === "string") {
				appliedProposalDirs.add(parsed.proposalDirRel.replace(/\\/g, "/"))
			}
		} catch {
			// ignore
		}
	}

	let pending = 0
	for (const dirName of proposalDirs) {
		const rel = path.posix.join(".kilocode", "evolution", "proposals", dirName)
		if (!appliedProposalDirs.has(rel)) pending++
	}
	return pending
}

async function updateVscodeAutomationSettings(cfg: EvolutionConfigV1): Promise<void> {
	const config = vscode.workspace.getConfiguration("kilo-code")
	// best-effort: update settings for runtime automation.
	await config.update("evolution.automation.level", cfg.automation_level, vscode.ConfigurationTarget.Workspace)
	await config.update(
		"evolution.automation.triggers.failureRate",
		cfg.triggers.failure_rate,
		vscode.ConfigurationTarget.Workspace,
	)
	await config.update(
		"evolution.automation.triggers.costThreshold",
		cfg.triggers.cost_threshold,
		vscode.ConfigurationTarget.Workspace,
	)
	await config.update(
		"evolution.automation.triggers.cooldown",
		cfg.triggers.cooldown_seconds,
		vscode.ConfigurationTarget.Workspace,
	)
	await config.update(
		"evolution.automation.safety.maxDailyRuns",
		cfg.safety.max_daily_runs,
		vscode.ConfigurationTarget.Workspace,
	)
	await config.update(
		"evolution.automation.safety.autoApplyTypes",
		cfg.safety.auto_apply_types,
		vscode.ConfigurationTarget.Workspace,
	)
}

export class EvolutionWebviewHandler {
	constructor(
		private readonly args: {
			provider: ClineProvider
			projectRoot: string
		},
	) {}

	async handle(message: WebviewMessage): Promise<boolean> {
		switch (message.type) {
			case "evolution.requestState": {
				await this.handleRequestState()
				return true
			}
			case "evolution.configure": {
				await this.handleConfigure(message)
				return true
			}
			case "evolution.setAutomationLevel": {
				await this.handleSetAutomationLevel(message)
				return true
			}
			default:
				return false
		}
	}

	private async post(msg: ExtensionMessage): Promise<void> {
		await this.args.provider.postMessageToWebview(msg)
	}

	private async handleRequestState(): Promise<void> {
		const councilAbsPath = path.resolve(this.args.projectRoot, ".kilocode", "evolution", "council.yaml")
		const configAbsPath = path.resolve(this.args.projectRoot, ".kilocode", "evolution", "config.yaml")

		const config = await readEvolutionConfig(configAbsPath)

		let councilMembers: string[] = []
		if (await fileExists(councilAbsPath)) {
			try {
				const councilRaw = await readFile(councilAbsPath, "utf8")
				const council = councilConfigSchema.parse(YAML.parse(councilRaw))
				councilMembers = Object.values(council.roles)
					.map((r) => r.profile)
					.filter(Boolean)
			} catch {
				councilMembers = []
			}
		}

		const pendingProposalsCount = await countPendingProposals(this.args.projectRoot)

		await this.post({
			type: "evolution.state",
			data: {
				councilMembers,
				automationLevel: config.automation_level,
				lastReviewDate: config.last_review_date,
				pendingProposalsCount,
				abTestActive: config.ab_test_active,
			},
		} as ExtensionMessage)
	}

	private async handleConfigure(message: WebviewMessage): Promise<void> {
		const councilMembers = (message as any).data?.councilMembers as unknown
		if (!Array.isArray(councilMembers) || councilMembers.some((m) => typeof m !== "string")) {
			await this.post({
				type: "evolution.actionResult",
				success: false,
				error: "Invalid councilMembers payload",
			} as ExtensionMessage)
			return
		}

		const profilesMdAbs = path.resolve(this.args.projectRoot, "docs", "kilo-profiles.md")
		if (!(await fileExists(profilesMdAbs))) {
			await this.post({
				type: "evolution.actionResult",
				success: false,
				error: "docs/kilo-profiles.md not found",
			} as ExtensionMessage)
			return
		}

		const profilesMd = await readFile(profilesMdAbs, "utf8")
		const available = new Set(parseProfilesFromDocs(profilesMd))

		const invalid = councilMembers.filter((m) => !available.has(m))
		if (invalid.length > 0) {
			await this.post({
				type: "evolution.actionResult",
				success: false,
				error: `Unknown profile(s): ${invalid.join(", ")}`,
			} as ExtensionMessage)
			return
		}

		const councilAbsPath = path.resolve(this.args.projectRoot, ".kilocode", "evolution", "council.yaml")

		let council: CouncilConfig
		if (await fileExists(councilAbsPath)) {
			const raw = await readFile(councilAbsPath, "utf8")
			council = councilConfigSchema.parse(YAML.parse(raw))
		} else {
			council = {
				version: 1,
				councilId: "evolution-mvp",
				roles: {
					governance: {
						profile: "default",
						rubricId: "evolution.governance.v1",
						promptPath: ".kilocode/evolution/council-prompts/governance.md",
					},
					quality: {
						profile: "default",
						rubricId: "evolution.quality.v1",
						promptPath: ".kilocode/evolution/council-prompts/quality.md",
					},
				},
			}
		}

		const roles = Object.keys(council.roles).sort((a, b) => a.localeCompare(b))
		for (let i = 0; i < roles.length; i++) {
			const role = roles[i]
			const selected = councilMembers[i] ?? councilMembers[councilMembers.length - 1]
			if (!selected) continue
			council.roles[role] = { ...council.roles[role], profile: selected }
		}

		await mkdir(path.dirname(councilAbsPath), { recursive: true })
		const yaml = buildNormalizedCouncilYaml(council)
		await writeFile(councilAbsPath, yaml, "utf8")

		await this.post({
			type: "evolution.actionResult",
			success: true,
			data: { councilMembers },
		} as ExtensionMessage)
		await this.handleRequestState()
	}

	private async handleSetAutomationLevel(message: WebviewMessage): Promise<void> {
		const rawLevel = ((message as any).data?.level ?? (message as any).data?.automationLevel) as unknown
		const level = typeof rawLevel === "number" ? rawLevel : Number(rawLevel)
		if (!Number.isInteger(level) || level < 0 || level > 3) {
			await this.post({
				type: "evolution.actionResult",
				success: false,
				error: "Invalid automation level (expected integer 0-3)",
			} as ExtensionMessage)
			return
		}

		const configAbsPath = path.resolve(this.args.projectRoot, ".kilocode", "evolution", "config.yaml")
		const existing = await readEvolutionConfig(configAbsPath)
		const defaults = configDefaultsForLevel(level)

		const updated: EvolutionConfigV1 = evolutionConfigSchema.parse({
			...existing,
			automation_level: level,
			ab_test_active: defaults.ab_test_active,
			auto_apply_patterns: defaults.auto_apply_patterns,
			auto_apply_exclusions: defaults.auto_apply_exclusions,
			triggers: defaults.triggers,
			safety: defaults.safety,
		})

		await writeEvolutionConfig(configAbsPath, updated)
		await updateVscodeAutomationSettings(updated)

		await this.post({
			type: "evolution.actionResult",
			success: true,
			data: { automationLevel: level },
		} as ExtensionMessage)
		await this.handleRequestState()
	}
}
