import { readFile, mkdir } from "node:fs/promises"
import * as path from "node:path"

import YAML from "yaml"

import {
	councilConfigSchema,
	createScorecardV1,
	scorecardV1Schema,
	traceV1Schema,
	type CouncilConfig,
	type ProviderSettings,
	type ScorecardV1,
	type TraceV1,
} from "@roo-code/types"

import { formatTimestampForFilename, toRepoRelativePath, writeJsonUnique } from "./fs"

export type CouncilPromptContext = {
	role: string
	profile: string
	rubricId?: string
	promptPath: string
	tracePath: string
	trace: TraceV1
	traceJson: string
}

export type CouncilRunResult = {
	trace: TraceV1
	councilConfig: CouncilConfig
	reportsDir: string
	scorecards: ScorecardV1[]
	scorecardPaths: string[]
}

export type CouncilRunOptions = {
	projectRoot: string
	tracePath: string
	councilConfigPath?: string
	outDir?: string
	now?: Date
	resolveProfile: (profileName: string) => Promise<ProviderSettings>
	completePrompt: (settings: ProviderSettings, prompt: string) => Promise<string>
}

export function parseCouncilConfigYaml(yamlText: string): CouncilConfig {
	const doc = YAML.parse(yamlText)
	return councilConfigSchema.parse(doc)
}

export async function loadTraceV1(tracePath: string): Promise<TraceV1> {
	const raw = await readFile(tracePath, "utf8")
	return traceV1Schema.parse(JSON.parse(raw))
}

export function fillCouncilPromptTemplate(template: string, ctx: CouncilPromptContext): string {
	// Minimal, dependency-free placeholder substitution.
	// Supported tokens:
	// - {{role}}, {{profile}}, {{rubricId}}, {{promptPath}}, {{tracePath}}, {{traceJson}}
	return template
		.replaceAll("{{role}}", ctx.role)
		.replaceAll("{{profile}}", ctx.profile)
		.replaceAll("{{rubricId}}", ctx.rubricId ?? "")
		.replaceAll("{{promptPath}}", ctx.promptPath)
		.replaceAll("{{tracePath}}", ctx.tracePath)
		.replaceAll("{{traceJson}}", ctx.traceJson)
}

function roleToFileSafe(role: string): string {
	return role
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, "-")
		.replace(/^-+|-+$/g, "")
}

function tryParseModelJson(text: string): unknown {
	const trimmed = text.trim()
	if (!trimmed) return undefined

	// Fast path for fenced JSON.
	const fenced = trimmed.match(/```json\s*([\s\S]*?)\s*```/i)
	if (fenced?.[1]) {
		try {
			return JSON.parse(fenced[1])
		} catch {
			return undefined
		}
	}

	// If it starts like JSON, try parsing as-is.
	if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
		try {
			return JSON.parse(trimmed)
		} catch {
			return undefined
		}
	}

	return undefined
}

export async function runCouncilReview(options: CouncilRunOptions): Promise<CouncilRunResult> {
	const {
		projectRoot,
		tracePath,
		councilConfigPath = path.join(".kilocode", "evolution", "council.yaml"),
		outDir = path.join(".kilocode", "evals", "reports"),
		now = new Date(),
		resolveProfile,
		completePrompt,
	} = options

	const [trace, configRaw] = await Promise.all([
		loadTraceV1(tracePath),
		readFile(path.resolve(projectRoot, councilConfigPath), "utf8"),
	])

	const councilConfig = parseCouncilConfigYaml(configRaw)

	const ts = formatTimestampForFilename(now)
	const reportsDir = path.resolve(projectRoot, outDir, `council.${ts}`)
	await mkdir(reportsDir, { recursive: true })

	const tracePathRel = toRepoRelativePath(projectRoot, path.resolve(tracePath))
	const traceJson = JSON.stringify(trace, null, 2)

	const scorecards: ScorecardV1[] = []
	const scorecardPaths: string[] = []

	for (const [role, roleConfig] of Object.entries(councilConfig.roles)) {
		const settings = await resolveProfile(roleConfig.profile)
		const promptTemplate = await readFile(path.resolve(projectRoot, roleConfig.promptPath), "utf8")

		const prompt = fillCouncilPromptTemplate(promptTemplate, {
			role,
			profile: roleConfig.profile,
			rubricId: roleConfig.rubricId,
			promptPath: roleConfig.promptPath,
			tracePath: tracePathRel,
			trace,
			traceJson,
		})

		const completionText = await completePrompt(settings, prompt)
		const parsed = tryParseModelJson(completionText)

		const baseScorecard = createScorecardV1({
			trace: { id: trace.id, path: tracePathRel },
			council: {
				role,
				profile: roleConfig.profile,
				rubricId: roleConfig.rubricId,
				promptPath: roleConfig.promptPath,
			},
			prompt,
			raw:
				parsed !== undefined
					? parsed
					: {
							text: completionText,
						},
		})

		// If the model output looked like a scorecard, merge it in (best-effort).
		const maybeScorecard = parsed && typeof parsed === "object" ? scorecardV1Schema.safeParse(parsed) : undefined
		const scorecard = maybeScorecard?.success
			? scorecardV1Schema.parse({
					...maybeScorecard.data,
					// force deterministic metadata
					id: baseScorecard.id,
					createdAt: baseScorecard.createdAt,
					trace: baseScorecard.trace,
					council: baseScorecard.council,
					prompt: baseScorecard.prompt,
					raw: baseScorecard.raw,
				})
			: baseScorecard

		scorecards.push(scorecard)

		const roleSafe = roleToFileSafe(role)
		const baseName = `scorecard.v1.${roleSafe}.${ts}.json`
		const outPath = await writeJsonUnique(reportsDir, baseName, scorecard)
		scorecardPaths.push(outPath)
	}

	return { trace, councilConfig, reportsDir, scorecards, scorecardPaths }
}
