import * as vscode from "vscode"
import { readdir, readFile, stat } from "node:fs/promises"
import * as nodePath from "node:path"

import { applyEvolutionBootstrap, planEvolutionBootstrap } from "../../shared/evolution/bootstrap"
import {
	applyModeMapSync,
	planModeMapSync,
	writeModeMapSyncProposalArtifacts,
} from "../../shared/evolution/modeMapSync"
import { runCouncilReview } from "../../shared/evolution/councilRunner"
import { generateEvolutionProposalFromScorecards as generateEvolutionProposalFromScorecardsShared } from "../../shared/evolution/proposalGenerator"
import { findLatestEvolutionArtifact, findLatestEvolutionArtifacts } from "../../shared/evolution/artifacts"
import { hoursToMs, shouldShowPeriodicNudge } from "../../shared/evolution/nudges"
import { isEvolutionBootstrapped } from "../../shared/evolution/workspace"
import { TraceExporter } from "../../core/traces/TraceExporter"
import { singleCompletionHandler } from "../../utils/single-completion-handler"

import { DIFF_VIEW_URI_SCHEME } from "../../integrations/editor/DiffViewProvider"

import { RooCodeEventName, type CommandId } from "@roo-code/types"

import { getCommand } from "../../utils/commands"
import { ClineProvider } from "../../core/webview/ClineProvider"

import type { RegisterCommandOptions } from "./types"

type EvolutionLogEvent = {
	event: string
	phase: "start" | "end" | "error"
	ts: string
	data?: Record<string, unknown>
}

function logEvolutionEvent(outputChannel: vscode.OutputChannel, event: EvolutionLogEvent): void {
	outputChannel.appendLine(`[evolution] ${JSON.stringify(event)}`)
}

let evolutionOutputChannel: vscode.OutputChannel | undefined

function getEvolutionOutputChannel(context: vscode.ExtensionContext): vscode.OutputChannel {
	if (!evolutionOutputChannel) {
		evolutionOutputChannel = vscode.window.createOutputChannel("Kilo Code: Evolution")
		context.subscriptions.push(evolutionOutputChannel)
	}
	return evolutionOutputChannel
}

type PeriodicNudgeWorkspaceState = {
	lastNudgeAtMs?: number
	lastTaskCompletedAtMs?: number
}

type PeriodicNudgeStateByWorkspace = Record<string, PeriodicNudgeWorkspaceState>

const PERIODIC_NUDGE_STATE_KEY = "kilo-code.evolution.nudges.periodicStateByWorkspace"

function loadPeriodicNudgeState(context: vscode.ExtensionContext): PeriodicNudgeStateByWorkspace {
	return (context.globalState.get(PERIODIC_NUDGE_STATE_KEY) as PeriodicNudgeStateByWorkspace | undefined) ?? {}
}

async function savePeriodicNudgeState(
	context: vscode.ExtensionContext,
	state: PeriodicNudgeStateByWorkspace,
): Promise<void> {
	await context.globalState.update(PERIODIC_NUDGE_STATE_KEY, state)
}

function getWorkspaceRootForEvolution(): string | undefined {
	return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
}

async function maybeShowPeriodicEvolutionNudge(args: {
	context: vscode.ExtensionContext
	provider: ClineProvider
	evolutionOutputChannel: vscode.OutputChannel
	trigger: "startup" | "taskCompleted"
}): Promise<void> {
	const { context, provider, evolutionOutputChannel, trigger } = args

	const projectRoot = getWorkspaceRootForEvolution() ?? provider.cwd
	if (!projectRoot) return

	const config = vscode.workspace.getConfiguration("kilo-code")
	const enabled = config.get<boolean>("evolution.nudges.periodic", false)
	if (!enabled) return

	const intervalHours = config.get<number>("evolution.nudges.periodicIntervalHours", 24)
	const intervalMs = hoursToMs(intervalHours)
	if (intervalMs <= 0) return

	const bootstrapped = await isEvolutionBootstrapped(projectRoot)
	if (!bootstrapped) return

	const nowMs = Date.now()

	const stateByWorkspace = loadPeriodicNudgeState(context)
	const workspaceState: PeriodicNudgeWorkspaceState = stateByWorkspace[projectRoot] ?? {}

	if (trigger === "taskCompleted") {
		workspaceState.lastTaskCompletedAtMs = nowMs
	}

	// First-time init: avoid immediately showing a nudge when the setting is toggled on.
	if (typeof workspaceState.lastNudgeAtMs !== "number") {
		workspaceState.lastNudgeAtMs = nowMs
		stateByWorkspace[projectRoot] = workspaceState
		await savePeriodicNudgeState(context, stateByWorkspace)
		return
	}

	const shouldShow = shouldShowPeriodicNudge({
		enabled,
		isBootstrapped: bootstrapped,
		intervalMs,
		nowMs,
		lastNudgeAtMs: workspaceState.lastNudgeAtMs,
		lastTaskCompletedAtMs: workspaceState.lastTaskCompletedAtMs,
	})

	// Always persist updated lastTaskCompletedAtMs (if any).
	stateByWorkspace[projectRoot] = workspaceState
	await savePeriodicNudgeState(context, stateByWorkspace)

	if (!shouldShow) return

	// Snooze immediately to avoid repeated prompts if the message is ignored.
	workspaceState.lastNudgeAtMs = nowMs
	stateByWorkspace[projectRoot] = workspaceState
	await savePeriodicNudgeState(context, stateByWorkspace)

	logEvolutionEvent(evolutionOutputChannel, {
		event: "vscode.evolution.nudges.periodic",
		phase: "start",
		ts: new Date().toISOString(),
		data: {
			projectRoot,
			intervalHours,
		},
	})

	try {
		const choice = await vscode.window.showInformationMessage(
			"Kilo Code: Evolution: Suggestions",
			"Run Council on latest task",
			"Sync Mode Map (Preview)",
			"Dismiss",
		)

		if (choice === "Run Council on latest task") {
			const latestTrace = await findLatestEvolutionArtifact({ projectRoot, kind: "trace" })
			if (!latestTrace) {
				await vscode.window.showErrorMessage(
					"Kilo Code: No trace.v1 artifacts found. Export a trace first (Kilo Code: Export Trace for Council).",
				)
				return
			}

			// Run council directly on the latest trace to match the nudge intent.
			await runCouncilReviewForTrace({
				projectRoot,
				traceAbsPath: latestTrace.absPath,
				provider,
				evolutionOutputChannel,
			})
		} else if (choice === "Sync Mode Map (Preview)") {
			await vscode.commands.executeCommand(getCommand("syncEvolutionModeMapPreview"))
		}
	} finally {
		logEvolutionEvent(evolutionOutputChannel, {
			event: "vscode.evolution.nudges.periodic",
			phase: "end",
			ts: new Date().toISOString(),
			data: { projectRoot },
		})
	}
}

export function initializeEvolutionPeriodicNudge(options: RegisterCommandOptions): void {
	const { context, provider } = options
	const evoChannel = getEvolutionOutputChannel(context)

	const onTaskCompleted = () => {
		void maybeShowPeriodicEvolutionNudge({
			context,
			provider,
			evolutionOutputChannel: evoChannel,
			trigger: "taskCompleted",
		})
	}

	provider.on(RooCodeEventName.TaskCompleted, onTaskCompleted)
	context.subscriptions.push({
		dispose: () => provider.off(RooCodeEventName.TaskCompleted, onTaskCompleted),
	})

	// Also check on startup so nudges can appear after a long gap, even before the next task completes.
	setTimeout(() => {
		void maybeShowPeriodicEvolutionNudge({
			context,
			provider,
			evolutionOutputChannel: evoChannel,
			trigger: "startup",
		})
	}, 2_000)
}

async function runCouncilReviewForTrace(args: {
	projectRoot: string
	traceAbsPath: string
	provider: ClineProvider
	evolutionOutputChannel: vscode.OutputChannel
}): Promise<void> {
	const { projectRoot, traceAbsPath, provider, evolutionOutputChannel } = args

	logEvolutionEvent(evolutionOutputChannel, {
		event: "vscode.evolution.council.run",
		phase: "start",
		ts: new Date().toISOString(),
		data: {
			tracePath: nodePath.relative(projectRoot, traceAbsPath),
			councilConfigPath: ".kilocode/evolution/council.yaml",
			outDir: ".kilocode/evals/reports",
		},
	})

	try {
		const result = await runCouncilReview({
			projectRoot,
			tracePath: traceAbsPath,
			resolveProfile: async (profileName) => {
				const { name: _name, ...profile } = await provider.providerSettingsManager.getProfile({
					name: profileName,
				})
				return profile
			},
			completePrompt: async (settings, prompt) => await singleCompletionHandler(settings, prompt),
		})

		const relReportsDir = nodePath.relative(projectRoot, result.reportsDir)

		logEvolutionEvent(evolutionOutputChannel, {
			event: "vscode.evolution.council.run",
			phase: "end",
			ts: new Date().toISOString(),
			data: {
				reportsDir: relReportsDir,
				scorecards: result.scorecardPaths.length,
			},
		})

		evolutionOutputChannel.appendLine(`Council scorecards written: ${relReportsDir}`)
		evolutionOutputChannel.appendLine(
			`Open latest artifacts: Command Palette → "Kilo Code: Evolution: Open Latest Artifact…"`,
		)

		const choice = await vscode.window.showInformationMessage(
			`Council scorecards written: ${relReportsDir}. Open latest artifacts: Kilo Code: Evolution: Open Latest Artifact…`,
			"Open Reports Folder",
			"Open Latest Artifacts",
		)

		if (choice === "Open Reports Folder") {
			await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(result.reportsDir))
		} else if (choice === "Open Latest Artifacts") {
			await vscode.commands.executeCommand(getCommand("evolutionOpenLatestArtifact"))
		}
	} catch (error) {
		logEvolutionEvent(evolutionOutputChannel, {
			event: "vscode.evolution.council.run",
			phase: "error",
			ts: new Date().toISOString(),
			data: {
				error: error instanceof Error ? error.message : String(error),
				recovery:
					"Verify .kilocode/evolution/council.yaml is valid and referenced profiles exist. Re-export a trace from this workspace, then re-run council.",
			},
		})

		await vscode.window.showErrorMessage(
			`Kilo Code: Failed to run council review: ${error instanceof Error ? error.message : String(error)}`,
		)
	}
}

function getVisibleProviderOrLog(outputChannel: vscode.OutputChannel): ClineProvider | undefined {
	const visibleProvider = ClineProvider.getVisibleInstance()
	if (!visibleProvider) {
		outputChannel.appendLine("Cannot find any visible Kilo Code instances.")
		return undefined
	}
	return visibleProvider
}

type EvolutionCommandId = Extract<
	CommandId,
	| "bootstrapEvolution"
	| "syncEvolutionModeMapPreview"
	| "syncEvolutionModeMapApply"
	| "exportTraceForCouncil"
	| "runCouncilReviewTrace"
	| "generateEvolutionProposalFromScorecards"
	| "evolutionQuickActions"
	| "evolutionOpenLatestArtifact"
>

export function getEvolutionCommandsMap(options: RegisterCommandOptions): Record<EvolutionCommandId, any> {
	const { context, outputChannel, provider } = options

	return {
		bootstrapEvolution: async () => {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
			if (!workspaceFolder) {
				await vscode.window.showErrorMessage("Kilo Code: No workspace folder is open.")
				return
			}

			const projectRoot = workspaceFolder.uri.fsPath
			const evoChannel = getEvolutionOutputChannel(context)

			logEvolutionEvent(evoChannel, {
				event: "vscode.evolution.bootstrap",
				phase: "start",
				ts: new Date().toISOString(),
				data: { projectRoot },
			})

			let plan
			try {
				plan = await planEvolutionBootstrap({ projectRoot })
			} catch (error) {
				logEvolutionEvent(evoChannel, {
					event: "vscode.evolution.bootstrap",
					phase: "error",
					ts: new Date().toISOString(),
					data: {
						error: error instanceof Error ? error.message : String(error),
						recovery:
							"Try reloading the workspace, then re-run bootstrap. Ensure the extension has file system access.",
					},
				})
				await vscode.window.showErrorMessage(
					`Kilo Code: Evolution bootstrap failed: ${error instanceof Error ? error.message : String(error)}`,
				)
				return
			}

			const linesToCreate = plan.toCreate.map((i) => `+ ${i.path}`)
			const linesSkipped = plan.skipped.map((i) => `= ${i.path} (${i.reason})`)

			const detailLines = [
				`Project root: ${projectRoot}`,
				"",
				"Would create (create-missing-only; never overwrites):",
				...(linesToCreate.length > 0 ? linesToCreate : ["(nothing)"]),
				"",
				"Skipped:",
				...(linesSkipped.length > 0 ? linesSkipped : ["(nothing)"]),
			]

			if (plan.suggestions.length > 0) {
				detailLines.push("", "Suggestions (not applied automatically):")
				for (const suggestion of plan.suggestions) {
					detailLines.push(`- ${suggestion.replaceAll("\n", "\n  ")}`)
				}
			}

			const projectName = nodePath.basename(projectRoot)

			if (plan.toCreate.length === 0) {
				logEvolutionEvent(evoChannel, {
					event: "vscode.evolution.bootstrap",
					phase: "end",
					ts: new Date().toISOString(),
					data: { projectRoot, changed: false },
				})

				await vscode.window.showInformationMessage(
					`Kilo Code: Evolution Layer already bootstrapped for ${projectName}`,
					{
						modal: true,
						detail: detailLines.join("\n"),
					},
				)
				return
			}

			const choice = await vscode.window.showInformationMessage(
				`Kilo Code: Bootstrap Evolution Layer for ${projectName}? (${plan.toCreate.length} file(s) to create)`,
				{
					modal: true,
					detail: detailLines.join("\n"),
				},
				"Create",
			)

			if (choice !== "Create") {
				logEvolutionEvent(evoChannel, {
					event: "vscode.evolution.bootstrap",
					phase: "end",
					ts: new Date().toISOString(),
					data: { projectRoot, changed: false, canceled: true },
				})
				return
			}

			let result
			try {
				result = await applyEvolutionBootstrap(plan)
			} catch (error) {
				logEvolutionEvent(evoChannel, {
					event: "vscode.evolution.bootstrap",
					phase: "error",
					ts: new Date().toISOString(),
					data: {
						error: error instanceof Error ? error.message : String(error),
						recovery:
							"Verify you have write permissions in this workspace. Re-run in a local workspace (not a read-only virtual file system).",
					},
				})
				await vscode.window.showErrorMessage(
					`Kilo Code: Evolution bootstrap failed: ${error instanceof Error ? error.message : String(error)}`,
				)
				return
			}

			logEvolutionEvent(evoChannel, {
				event: "vscode.evolution.bootstrap",
				phase: "end",
				ts: new Date().toISOString(),
				data: {
					projectRoot,
					changed: result.created.length > 0,
					created: result.created.length,
					suggestions: plan.suggestions.length,
				},
			})

			evoChannel.appendLine(`[evolution bootstrap] Project root: ${projectRoot}`)
			for (const created of result.created) {
				evoChannel.appendLine(`[evolution bootstrap] created: ${created}`)
			}
			for (const suggestion of plan.suggestions) {
				evoChannel.appendLine(`[evolution bootstrap] suggestion: ${suggestion}`)
			}

			await vscode.window.showInformationMessage(
				`Kilo Code: Evolution Layer bootstrap complete (created ${result.created.length} file(s)).`,
			)

			if (plan.suggestions.length > 0) {
				await vscode.window.showWarningMessage(
					"Kilo Code: Evolution Layer bootstrap suggestions were generated. See Output → Kilo Code: Evolution.",
				)
			}
		},

		syncEvolutionModeMapPreview: async () => {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
			if (!workspaceFolder) {
				await vscode.window.showErrorMessage("Kilo Code: No workspace folder is open.")
				return
			}

			const projectRoot = workspaceFolder.uri.fsPath
			const evoChannel = getEvolutionOutputChannel(context)
			logEvolutionEvent(evoChannel, {
				event: "vscode.evolution.modeMapSync.preview",
				phase: "start",
				ts: new Date().toISOString(),
				data: { projectRoot },
			})

			try {
				const plan = await planModeMapSync({ projectRoot })
				if (plan.drift.changes.length === 0) {
					logEvolutionEvent(evoChannel, {
						event: "vscode.evolution.modeMapSync.preview",
						phase: "end",
						ts: new Date().toISOString(),
						data: { changed: false },
					})

					await vscode.window.showInformationMessage("Kilo Code: Mode map is already in sync.")
					return
				}

				const artifacts = await writeModeMapSyncProposalArtifacts(plan)
				logEvolutionEvent(evoChannel, {
					event: "vscode.evolution.modeMapSync.preview",
					phase: "end",
					ts: new Date().toISOString(),
					data: {
						modeMapPath: plan.modeMapPath,
						councilConfigPath: plan.councilConfigPath,
						proposalDir: nodePath.relative(projectRoot, artifacts.proposalDir),
						changes: plan.drift.changes.length,
					},
				})

				const detailLines = [
					`Project root: ${projectRoot}`,
					`Mode map: ${plan.modeMapPath}`,
					`Council config: ${plan.councilConfigPath}`,
					"",
					"Seat changes:",
					...plan.drift.changes.map((c) =>
						c.kind === "update-profile"
							? `~ ${c.role}: ${c.from} -> ${c.to}`
							: `+ ${c.role}: profile=${c.to} (generated)`,
					),
					"",
					`Proposal artifacts: ${nodePath.relative(projectRoot, artifacts.proposalDir)}`,
				]

				const choice = await vscode.window.showInformationMessage(
					"Kilo Code: Sync Evolution Mode Map (Preview)",
					{ modal: true, detail: detailLines.join("\n") },
					"Show Diff",
					"Open Proposal Folder",
				)

				if (choice === "Show Diff") {
					const left = vscode.Uri.parse(`${DIFF_VIEW_URI_SCHEME}:council.yaml`).with({
						query: Buffer.from(plan.beforeCouncilYaml ?? "", "utf8").toString("base64"),
					})
					const right = vscode.Uri.parse(`${DIFF_VIEW_URI_SCHEME}:council.yaml.next`).with({
						query: Buffer.from(plan.afterCouncilYaml, "utf8").toString("base64"),
					})
					await vscode.commands.executeCommand(
						"vscode.diff",
						left,
						right,
						"Evolution Mode Map Sync: council.yaml (preview)",
					)
				} else if (choice === "Open Proposal Folder") {
					await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(artifacts.proposalDir))
				}
			} catch (error) {
				logEvolutionEvent(evoChannel, {
					event: "vscode.evolution.modeMapSync.preview",
					phase: "error",
					ts: new Date().toISOString(),
					data: {
						error: error instanceof Error ? error.message : String(error),
						recovery:
							"Verify docs/llm-mode-map.yaml and .kilocode/evolution/council.yaml exist and are valid YAML. Run 'Kilo Code: Bootstrap Evolution Layer' if needed.",
					},
				})

				await vscode.window.showErrorMessage(
					`Kilo Code: Mode map sync preview failed: ${error instanceof Error ? error.message : String(error)}`,
				)
			}
		},

		syncEvolutionModeMapApply: async () => {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
			if (!workspaceFolder) {
				await vscode.window.showErrorMessage("Kilo Code: No workspace folder is open.")
				return
			}

			const projectRoot = workspaceFolder.uri.fsPath
			const evoChannel = getEvolutionOutputChannel(context)
			logEvolutionEvent(evoChannel, {
				event: "vscode.evolution.modeMapSync.apply",
				phase: "start",
				ts: new Date().toISOString(),
				data: { projectRoot },
			})

			try {
				const plan = await planModeMapSync({ projectRoot })
				if (plan.drift.changes.length === 0) {
					logEvolutionEvent(evoChannel, {
						event: "vscode.evolution.modeMapSync.apply",
						phase: "end",
						ts: new Date().toISOString(),
						data: { changed: false },
					})

					await vscode.window.showInformationMessage("Kilo Code: Mode map is already in sync.")
					return
				}

				const detailLines = [
					`Project root: ${projectRoot}`,
					`Mode map: ${plan.modeMapPath}`,
					`Council config: ${plan.councilConfigPath}`,
					"",
					"Seat changes:",
					...plan.drift.changes.map((c) =>
						c.kind === "update-profile"
							? `~ ${c.role}: ${c.from} -> ${c.to}`
							: `+ ${c.role}: profile=${c.to} (generated)`,
					),
				]

				// Always show diff before confirmation.
				const left = vscode.Uri.parse(`${DIFF_VIEW_URI_SCHEME}:council.yaml`).with({
					query: Buffer.from(plan.beforeCouncilYaml ?? "", "utf8").toString("base64"),
				})
				const right = vscode.Uri.parse(`${DIFF_VIEW_URI_SCHEME}:council.yaml.next`).with({
					query: Buffer.from(plan.afterCouncilYaml, "utf8").toString("base64"),
				})
				await vscode.commands.executeCommand(
					"vscode.diff",
					left,
					right,
					"Evolution Mode Map Sync: council.yaml (apply)",
				)

				const confirm = await vscode.window.showWarningMessage(
					"Kilo Code: Apply Mode Map Sync to council.yaml?",
					{ modal: true, detail: detailLines.join("\n") },
					"Apply",
				)
				if (confirm !== "Apply") {
					return
				}

				// Validate profiles against VS Code provider profiles.
				const profiles = await provider.providerSettingsManager.listConfig()
				const profileNames = new Set(profiles.map((p) => p.name))

				const result = await applyModeMapSync({
					plan,
					writeProposal: true,
					validateProfileExists: async (name) => profileNames.has(name),
				})

				const proposalDir = result.proposal?.proposalDir
				logEvolutionEvent(evoChannel, {
					event: "vscode.evolution.modeMapSync.apply",
					phase: "end",
					ts: new Date().toISOString(),
					data: {
						councilConfigPath: nodePath.relative(projectRoot, result.councilConfigPath),
						changed: result.changed,
						proposalDir: proposalDir ? nodePath.relative(projectRoot, proposalDir) : undefined,
					},
				})

				const msg = result.changed
					? "Kilo Code: Mode map sync applied to council.yaml."
					: "Kilo Code: No changes were applied."

				if (proposalDir) {
					const open = await vscode.window.showInformationMessage(msg, "Open Proposal Folder")
					if (open === "Open Proposal Folder") {
						await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(proposalDir))
					}
				} else {
					await vscode.window.showInformationMessage(msg)
				}
			} catch (error) {
				logEvolutionEvent(evoChannel, {
					event: "vscode.evolution.modeMapSync.apply",
					phase: "error",
					ts: new Date().toISOString(),
					data: {
						error: error instanceof Error ? error.message : String(error),
						recovery:
							"If this is a profile validation failure, ensure required profile names exist (Profiles UI / cli-profiles.yaml). Re-run preview to inspect the diff.",
					},
				})

				await vscode.window.showErrorMessage(
					`Kilo Code: Mode map sync apply failed: ${error instanceof Error ? error.message : String(error)}`,
				)
			}
		},

		exportTraceForCouncil: async () => {
			const visibleProvider = getVisibleProviderOrLog(outputChannel)
			if (!visibleProvider) return

			const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
			if (!workspaceFolder) {
				await vscode.window.showErrorMessage("Kilo Code: No workspace folder is open.")
				return
			}

			const projectRoot = workspaceFolder.uri.fsPath
			const currentTaskId = visibleProvider.getCurrentTask()?.taskId

			let selectedTaskId: string | undefined = undefined
			let selectedHistoryItem = undefined

			if (currentTaskId) {
				const choice = await vscode.window.showQuickPick(
					[
						{ label: "Use current task", description: currentTaskId },
						{ label: "Pick from history…", description: "Select a past task" },
					],
					{ title: "Kilo Code: Export Trace for Council" },
				)

				if (!choice) return
				if (choice.label === "Use current task") {
					selectedTaskId = currentTaskId
				} else {
					// fall through to history selection
				}
			}

			if (!selectedTaskId) {
				const history = visibleProvider.getTaskHistory()
				const items = history
					.slice()
					.sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0))
					.slice(0, 200)
					.map((h) => ({
						label: `#${h.number} ${h.task}`,
						description: h.id,
						detail: h.workspace ? `${h.workspace}${h.mode ? ` • ${h.mode}` : ""}` : h.mode,
						h,
					}))

				const picked = await vscode.window.showQuickPick(items, {
					title: "Select task to export",
					matchOnDescription: true,
					matchOnDetail: true,
				})

				if (!picked) return
				selectedTaskId = picked.h.id
				selectedHistoryItem = picked.h
			} else {
				selectedHistoryItem = visibleProvider.getTaskHistory().find((h) => h.id === selectedTaskId)
			}

			const redactChoice = await vscode.window.showQuickPick(
				[
					{ label: "Export with redaction (recommended)", value: true },
					{ label: "Export without redaction", value: false },
				],
				{ title: "Trace redaction" },
			)
			if (!redactChoice) return

			const evoChannel = getEvolutionOutputChannel(context)
			try {
				logEvolutionEvent(evoChannel, {
					event: "vscode.evolution.trace.export",
					phase: "start",
					ts: new Date().toISOString(),
					data: {
						taskId: selectedTaskId,
						redact: redactChoice.value,
						outDir: ".kilocode/traces/runs",
					},
				})

				const result = await TraceExporter.exportTraceForCouncil({
					workspaceRoot: projectRoot,
					globalStoragePath: visibleProvider.contextProxy.globalStorageUri.fsPath,
					taskId: selectedTaskId,
					historyItem: selectedHistoryItem,
					redact: redactChoice.value,
				})

				logEvolutionEvent(evoChannel, {
					event: "vscode.evolution.trace.export",
					phase: "end",
					ts: new Date().toISOString(),
					data: { outputPath: result.outputPath },
				})

				await vscode.window.showInformationMessage(`Trace exported: ${result.outputPath}`)
			} catch (error) {
				logEvolutionEvent(evoChannel, {
					event: "vscode.evolution.trace.export",
					phase: "error",
					ts: new Date().toISOString(),
					data: {
						error: error instanceof Error ? error.message : String(error),
						recovery:
							"Try selecting a different task from history, or ensure the task exists in local storage. Then re-run export.",
					},
				})

				await vscode.window.showErrorMessage(
					`Kilo Code: Failed to export trace: ${error instanceof Error ? error.message : String(error)}`,
				)
			}
		},

		runCouncilReviewTrace: async () => {
			const visibleProvider = getVisibleProviderOrLog(outputChannel)
			if (!visibleProvider) return

			const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
			if (!workspaceFolder) {
				await vscode.window.showErrorMessage("Kilo Code: No workspace folder is open.")
				return
			}

			const projectRoot = workspaceFolder.uri.fsPath
			const tracesDir = nodePath.join(projectRoot, ".kilocode", "traces", "runs")

			type TracePickItem = vscode.QuickPickItem & { absPath: string; mtimeMs: number }
			const traceItems: TracePickItem[] = []

			try {
				const entries = await readdir(tracesDir, { withFileTypes: true })
				for (const ent of entries) {
					if (!ent.isFile()) continue
					if (!ent.name.startsWith("trace.v1.")) continue
					if (!ent.name.endsWith(".json")) continue

					const absPath = nodePath.join(tracesDir, ent.name)
					const s = await stat(absPath)
					traceItems.push({
						label: ent.name,
						description: nodePath.relative(projectRoot, absPath),
						detail: new Date(s.mtimeMs).toLocaleString(),
						absPath,
						mtimeMs: s.mtimeMs,
					})
				}
			} catch {
				// no traces dir yet
			}

			if (traceItems.length === 0) {
				await vscode.window.showErrorMessage(
					"Kilo Code: No exported traces found. Run 'Kilo Code: Export Trace for Council' first.",
				)
				return
			}

			traceItems.sort((a, b) => b.mtimeMs - a.mtimeMs)

			const pickedTrace = await vscode.window.showQuickPick(traceItems, {
				title: "Kilo Code: Run Council Review (Trace)",
				matchOnDescription: true,
				matchOnDetail: true,
			})
			if (!pickedTrace) return

			await runCouncilReviewForTrace({
				projectRoot,
				traceAbsPath: pickedTrace.absPath,
				provider: visibleProvider,
				evolutionOutputChannel: getEvolutionOutputChannel(context),
			})
		},

		generateEvolutionProposalFromScorecards: async () => {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
			if (!workspaceFolder) {
				await vscode.window.showErrorMessage("Kilo Code: No workspace folder is open.")
				return
			}

			const projectRoot = workspaceFolder.uri.fsPath
			const reportsRoot = nodePath.join(projectRoot, ".kilocode", "evals", "reports")

			type ReportsPickItem = vscode.QuickPickItem & { absPath: string; mtimeMs: number }
			const reportDirs: ReportsPickItem[] = []

			try {
				const entries = await readdir(reportsRoot, { withFileTypes: true })
				for (const ent of entries) {
					if (!ent.isDirectory()) continue
					const absPath = nodePath.join(reportsRoot, ent.name)
					const s = await stat(absPath)
					reportDirs.push({
						label: ent.name,
						description: nodePath.relative(projectRoot, absPath),
						detail: new Date(s.mtimeMs).toLocaleString(),
						absPath,
						mtimeMs: s.mtimeMs,
					})
				}
			} catch {
				// no reports yet
			}

			if (reportDirs.length === 0) {
				await vscode.window.showErrorMessage(
					"Kilo Code: No council report directories found. Run 'Kilo Code: Run Council Review (Trace)' first.",
				)
				return
			}

			reportDirs.sort((a, b) => b.mtimeMs - a.mtimeMs)
			const pickedReportsDir = await vscode.window.showQuickPick(reportDirs, {
				title: "Select council reports directory",
				matchOnDescription: true,
				matchOnDetail: true,
			})
			if (!pickedReportsDir) return

			let tracePath: string | undefined = undefined

			// Best-effort infer trace path from first scorecard file.
			try {
				const files = await readdir(pickedReportsDir.absPath, { withFileTypes: true })
				const firstJson = files.find((f) => f.isFile() && f.name.endsWith(".json"))
				if (firstJson) {
					const raw = await readFile(nodePath.join(pickedReportsDir.absPath, firstJson.name), "utf8")
					const parsed = JSON.parse(raw) as any
					const traceRef = parsed?.trace?.path
					if (typeof traceRef === "string" && traceRef.length > 0) {
						tracePath = nodePath.isAbsolute(traceRef) ? traceRef : nodePath.join(projectRoot, traceRef)
					}
				}
			} catch {
				// ignore
			}

			if (!tracePath) {
				await vscode.window.showErrorMessage(
					"Kilo Code: Could not infer trace from scorecards (missing trace.path). Please re-run council review with a trace exported from this workspace.",
				)
				return
			}

			const evoChannel = getEvolutionOutputChannel(context)
			logEvolutionEvent(evoChannel, {
				event: "vscode.evolution.proposal.generate",
				phase: "start",
				ts: new Date().toISOString(),
				data: {
					tracePath: nodePath.relative(projectRoot, tracePath),
					reportsDir: nodePath.relative(projectRoot, pickedReportsDir.absPath),
					outDir: ".kilocode/evolution/proposals",
				},
			})

			try {
				const result = await generateEvolutionProposalFromScorecardsShared({
					projectRoot,
					tracePath,
					reportsDir: pickedReportsDir.absPath,
				})

				const relProposalDir = nodePath.relative(projectRoot, result.proposalDir)
				const relMarkdownPath = nodePath.relative(projectRoot, result.markdownPath)

				logEvolutionEvent(evoChannel, {
					event: "vscode.evolution.proposal.generate",
					phase: "end",
					ts: new Date().toISOString(),
					data: {
						proposalDir: relProposalDir,
						markdownPath: relMarkdownPath,
					},
				})

				evoChannel.appendLine(`Evolution proposal generated: ${relProposalDir}`)
				evoChannel.appendLine(`Proposal markdown: ${relMarkdownPath}`)
				evoChannel.appendLine(
					`Open latest artifacts: Command Palette → "Kilo Code: Evolution: Open Latest Artifact…"`,
				)

				await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(result.markdownPath))

				const choice = await vscode.window.showInformationMessage(
					`Evolution proposal generated: ${relProposalDir}. Open latest artifacts: Kilo Code: Evolution: Open Latest Artifact…`,
					"Open Proposal Folder",
					"Open Latest Artifacts",
				)

				if (choice === "Open Proposal Folder") {
					await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(result.proposalDir))
				} else if (choice === "Open Latest Artifacts") {
					await vscode.commands.executeCommand(getCommand("evolutionOpenLatestArtifact"))
				}
			} catch (error) {
				logEvolutionEvent(evoChannel, {
					event: "vscode.evolution.proposal.generate",
					phase: "error",
					ts: new Date().toISOString(),
					data: {
						error: error instanceof Error ? error.message : String(error),
						recovery:
							"Ensure the selected council report directory contains scorecard.v1 JSON files, then re-run. Use 'Kilo Code: Evolution: Open Latest Artifact…' to confirm paths.",
					},
				})

				await vscode.window.showErrorMessage(
					`Kilo Code: Failed to generate proposal: ${error instanceof Error ? error.message : String(error)}`,
				)
			}
		},

		evolutionQuickActions: async () => {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
			if (!workspaceFolder) {
				await vscode.window.showErrorMessage("Kilo Code: No workspace folder is open.")
				return
			}

			const projectRoot = workspaceFolder.uri.fsPath

			const revealWorkspaceFolder = async (relDir: string): Promise<void> => {
				const absDir = nodePath.join(projectRoot, relDir)
				try {
					const s = await stat(absDir)
					if (!s.isDirectory()) {
						throw new Error("not a directory")
					}
				} catch {
					await vscode.window.showErrorMessage(
						`Kilo Code: Folder does not exist yet: ${relDir}. Run the relevant Evolution command first.`,
					)
					return
				}

				await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(absDir))
			}

			type QuickActionItem = vscode.QuickPickItem & { run: () => Promise<void> }

			const items: QuickActionItem[] = [
				{
					label: "Export Trace for Council",
					description: "Kilo Code: Export Trace for Council",
					run: async () => await vscode.commands.executeCommand(getCommand("exportTraceForCouncil")),
				},
				{
					label: "Run Council Review (Trace)",
					description: "Kilo Code: Run Council Review (Trace)",
					run: async () => await vscode.commands.executeCommand(getCommand("runCouncilReviewTrace")),
				},
				{
					label: "Generate Evolution Proposal (from scorecards)",
					description: "Kilo Code: Generate Evolution Proposal (from scorecards)",
					run: async () =>
						await vscode.commands.executeCommand(getCommand("generateEvolutionProposalFromScorecards")),
				},
				{
					label: "Sync Evolution Mode Map (Preview)",
					description: "Kilo Code: Sync Evolution Mode Map (Preview)",
					run: async () => await vscode.commands.executeCommand(getCommand("syncEvolutionModeMapPreview")),
				},
				{
					label: "Sync Evolution Mode Map (Apply)",
					description: "Kilo Code: Sync Evolution Mode Map (Apply)",
					run: async () => await vscode.commands.executeCommand(getCommand("syncEvolutionModeMapApply")),
				},
				{
					label: "Open .kilocode/evals/reports/ folder",
					description: ".kilocode/evals/reports",
					run: async () => await revealWorkspaceFolder(nodePath.join(".kilocode", "evals", "reports")),
				},
				{
					label: "Open .kilocode/evolution/proposals/ folder",
					description: ".kilocode/evolution/proposals",
					run: async () => await revealWorkspaceFolder(nodePath.join(".kilocode", "evolution", "proposals")),
				},
				{
					label: "Open .kilocode/traces/runs/ folder",
					description: ".kilocode/traces/runs",
					run: async () => await revealWorkspaceFolder(nodePath.join(".kilocode", "traces", "runs")),
				},
			]

			const picked = await vscode.window.showQuickPick(items, {
				title: "Kilo Code: Evolution: Quick Actions",
				matchOnDescription: true,
			})
			if (!picked) return

			await picked.run()
		},

		evolutionOpenLatestArtifact: async () => {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
			if (!workspaceFolder) {
				await vscode.window.showErrorMessage("Kilo Code: No workspace folder is open.")
				return
			}

			const projectRoot = workspaceFolder.uri.fsPath

			type ArtifactPickItem = vscode.QuickPickItem & {
				artifact: Awaited<ReturnType<typeof findLatestEvolutionArtifacts>>[number]
			}

			const artifacts = await findLatestEvolutionArtifacts(projectRoot)
			const byKind = new Map(artifacts.map((a) => [a.kind, a] as const))

			const items: ArtifactPickItem[] = []
			const pushIf = (kind: "trace" | "report" | "proposal", label: string) => {
				const a = byKind.get(kind)
				if (!a) return
				items.push({
					label,
					description: a.openRelPath ?? a.relPath,
					detail: new Date(a.mtimeMs).toLocaleString(),
					artifact: a,
				})
			}

			pushIf("trace", "Latest Trace")
			pushIf("report", "Latest Council Report")
			pushIf("proposal", "Latest Evolution Proposal")

			if (items.length === 0) {
				await vscode.window.showErrorMessage(
					"Kilo Code: No Evolution artifacts found yet. Export a trace, run council, or generate a proposal first.",
				)
				return
			}

			const picked = await vscode.window.showQuickPick(items, {
				title: "Kilo Code: Evolution: Open Latest Artifact…",
				matchOnDescription: true,
				matchOnDetail: true,
			})
			if (!picked) return

			const { artifact } = picked
			const evoChannel = getEvolutionOutputChannel(context)
			logEvolutionEvent(evoChannel, {
				event: `vscode.evolution.openLatestArtifact`,
				phase: "start",
				ts: new Date().toISOString(),
				data: { kind: artifact.kind, path: artifact.openRelPath ?? artifact.relPath },
			})

			try {
				if (artifact.openAbsPath) {
					await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(artifact.openAbsPath))
				} else if (artifact.isDirectory) {
					await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(artifact.absPath))
				} else {
					await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(artifact.absPath))
				}

				logEvolutionEvent(evoChannel, {
					event: `vscode.evolution.openLatestArtifact`,
					phase: "end",
					ts: new Date().toISOString(),
					data: { kind: artifact.kind },
				})
			} catch (error) {
				logEvolutionEvent(evoChannel, {
					event: `vscode.evolution.openLatestArtifact`,
					phase: "error",
					ts: new Date().toISOString(),
					data: {
						kind: artifact.kind,
						error: error instanceof Error ? error.message : String(error),
						recovery: "Try opening the containing folder instead, or re-run the generating command.",
					},
				})

				await vscode.window.showErrorMessage(
					`Kilo Code: Failed to open artifact: ${error instanceof Error ? error.message : String(error)}`,
				)
			}
		},
	}
}
