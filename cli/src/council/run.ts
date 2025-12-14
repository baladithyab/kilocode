import * as fs from "fs/promises"
import * as path from "path"

import YAML from "yaml"

import {
	cliProfileMapSchema,
	providerSettingsSchema,
	type CliProfileMap,
	type CliProfileMapEntry,
	type ProviderSettings,
} from "@roo-code/types"

import type { ProviderConfig } from "../config/types.js"
import { loadConfig } from "../config/persistence.js"

import { singleCompletionHandler } from "../../../src/utils/single-completion-handler.js"
import { runCouncilReview } from "../../../src/shared/evolution/councilRunner.js"

export type CouncilRunCliArgs = {
	workspaceRoot: string
	tracePath: string
	councilConfigPath?: string
	cliProfileMapPath?: string
	outDir?: string
	verbose?: boolean
}

function logEvent(
	verbose: boolean,
	event: {
		event: string
		phase: "start" | "end" | "error"
		ts: string
		data?: Record<string, unknown>
	},
): void {
	if (!verbose) return
	console.log(JSON.stringify(event))
}

async function loadCliProfileMap(absPath: string): Promise<CliProfileMap> {
	const raw = await fs.readFile(absPath, "utf8")
	return cliProfileMapSchema.parse(YAML.parse(raw))
}

function providerConfigToProviderSettings(provider: ProviderConfig): ProviderSettings {
	const { provider: providerName, ...rest } = provider
	return providerSettingsSchema.parse({ apiProvider: providerName, ...rest })
}

function applyModelOverride(settings: ProviderSettings, model: string | undefined): ProviderSettings {
	if (!model) return settings
	if (!settings.apiProvider) return settings

	// Prefer provider-specific model keys.
	switch (settings.apiProvider) {
		case "kilocode":
			return { ...settings, kilocodeModel: model }
		case "openrouter":
			return { ...settings, openRouterModelId: model }
		case "openai":
			return { ...settings, openAiModelId: model }
		case "openai-native":
			return { ...settings, apiModelId: model }
		case "ollama":
			return { ...settings, ollamaModelId: model }
		case "lmstudio":
			return { ...settings, lmStudioModelId: model }
		case "unbound":
			return { ...settings, unboundModelId: model }
		case "requesty":
			return { ...settings, requestyModelId: model }
		case "litellm":
			return { ...settings, litellmModelId: model }
		case "huggingface":
			return { ...settings, huggingFaceModelId: model }
		case "io-intelligence":
			return { ...settings, ioIntelligenceModelId: model }
		case "vercel-ai-gateway":
			return { ...settings, vercelAiGatewayModelId: model }
		case "deepinfra":
			return { ...settings, deepInfraModelId: model }
		case "ovhcloud":
			return { ...settings, ovhCloudAiEndpointsModelId: model }
		case "inception":
			return { ...settings, inceptionLabsModelId: model }
		case "sap-ai-core":
			return { ...settings, sapAiCoreModelId: model }
		default:
			return { ...settings, apiModelId: model }
	}
}

function resolveCliProfileEntry(map: CliProfileMap, profileName: string): CliProfileMapEntry {
	const entry = map.profiles[profileName]
	if (!entry) {
		throw new Error(
			`CLI profile '${profileName}' not found in profile map. Add it to ${".kilocode/evolution/cli-profiles.yaml"} (or pass --cli-profile-map).`,
		)
	}
	return entry
}

export async function runCouncilRunCli(
	args: CouncilRunCliArgs,
): Promise<{ reportsDir: string; scorecardPaths: string[] }> {
	const {
		workspaceRoot,
		tracePath,
		councilConfigPath = path.join(".kilocode", "evolution", "council.yaml"),
		cliProfileMapPath = path.join(".kilocode", "evolution", "cli-profiles.yaml"),
		outDir = path.join(".kilocode", "evals", "reports"),
		verbose = false,
	} = args

	const absWorkspace = path.resolve(workspaceRoot)
	const absTracePath = path.resolve(absWorkspace, tracePath)
	const absCouncilConfigPath = path.resolve(absWorkspace, councilConfigPath)
	const absCliProfileMapPath = path.resolve(absWorkspace, cliProfileMapPath)

	logEvent(verbose, {
		event: "evolution.council.run",
		phase: "start",
		ts: new Date().toISOString(),
		data: {
			workspaceRoot: absWorkspace,
			tracePath: toPosixRel(absWorkspace, absTracePath),
			councilConfigPath: toPosixRel(absWorkspace, absCouncilConfigPath),
			cliProfileMapPath: toPosixRel(absWorkspace, absCliProfileMapPath),
			outDir,
		},
	})

	try {
		const [profileMap, { config }] = await Promise.all([loadCliProfileMap(absCliProfileMapPath), loadConfig()])

		const resolveProfile = async (profileName: string): Promise<ProviderSettings> => {
			const entry = resolveCliProfileEntry(profileMap, profileName)
			const provider = config.providers.find((p) => p.id === entry.providerId)
			if (!provider) {
				throw new Error(
					`Provider id '${entry.providerId}' referenced by CLI profile '${profileName}' was not found in CLI config (${config.providers.map((p) => p.id).join(", ")}).`,
				)
			}

			const base = providerConfigToProviderSettings(provider)
			return applyModelOverride(base, entry.model)
		}

		const result = await runCouncilReview({
			projectRoot: absWorkspace,
			tracePath: absTracePath,
			councilConfigPath: toPosixRel(absWorkspace, absCouncilConfigPath),
			outDir,
			resolveProfile,
			completePrompt: async (settings, prompt) => await singleCompletionHandler(settings, prompt),
		})

		logEvent(verbose, {
			event: "evolution.council.run",
			phase: "end",
			ts: new Date().toISOString(),
			data: {
				reportsDir: toPosixRel(absWorkspace, result.reportsDir),
				scorecards: result.scorecardPaths.length,
			},
		})

		return { reportsDir: result.reportsDir, scorecardPaths: result.scorecardPaths }
	} catch (error) {
		logEvent(verbose, {
			event: "evolution.council.run",
			phase: "error",
			ts: new Date().toISOString(),
			data: {
				error: error instanceof Error ? error.message : String(error),
				recovery:
					"Ensure .kilocode/evolution/council.yaml and .kilocode/evolution/cli-profiles.yaml exist and reference valid provider IDs. Then re-run with --trace pointing at a valid trace.v1.json.",
			},
		})
		throw error
	}
}

function toPosixRel(root: string, abs: string): string {
	return path.relative(root, abs).split(path.sep).join("/")
}
