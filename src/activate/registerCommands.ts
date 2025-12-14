import * as vscode from "vscode"
import delay from "delay"
import { readdir, readFile, stat } from "node:fs/promises"
import * as nodePath from "node:path"

import { applyEvolutionBootstrap, planEvolutionBootstrap } from "../shared/evolution/bootstrap"
import { applyModeMapSync, planModeMapSync, writeModeMapSyncProposalArtifacts } from "../shared/evolution/modeMapSync"
import { runCouncilReview } from "../shared/evolution/councilRunner"
import { generateEvolutionProposalFromScorecards as generateEvolutionProposalFromScorecardsShared } from "../shared/evolution/proposalGenerator"
import { findLatestEvolutionArtifacts } from "../shared/evolution/artifacts"
import { TraceExporter } from "../core/traces/TraceExporter"
import { singleCompletionHandler } from "../utils/single-completion-handler"

import { DIFF_VIEW_URI_SCHEME } from "../integrations/editor/DiffViewProvider"

import type { CommandId } from "@roo-code/types"
import { TelemetryService } from "@roo-code/telemetry"

import { getCommand } from "../utils/commands"
import { ClineProvider } from "../core/webview/ClineProvider"
import { exportSettings } from "../core/config/importExport" // kilocode_change
import { ContextProxy } from "../core/config/ContextProxy"
import { focusPanel } from "../utils/focusPanel"

import { registerHumanRelayCallback, unregisterHumanRelayCallback, handleHumanRelayResponse } from "./humanRelay"
import { handleNewTask } from "./handleTask"
import { CodeIndexManager } from "../services/code-index/manager"
import { importSettingsWithFeedback } from "../core/config/importExport"
import { MdmService } from "../services/mdm/MdmService"
import { t } from "../i18n"
import { getAppUrl } from "@roo-code/types" // kilocode_change
import { generateTerminalCommand } from "../utils/terminalCommandGenerator" // kilocode_change
import { AgentManagerProvider } from "../core/kilocode/agent-manager/AgentManagerProvider" // kilocode_change

/**
 * Helper to get the visible ClineProvider instance or log if not found.
 */
export function getVisibleProviderOrLog(outputChannel: vscode.OutputChannel): ClineProvider | undefined {
	const visibleProvider = ClineProvider.getVisibleInstance()
	if (!visibleProvider) {
		outputChannel.appendLine("Cannot find any visible Kilo Code instances.")
		return undefined
	}
	return visibleProvider
}

// Store panel references in both modes
let sidebarPanel: vscode.WebviewView | undefined = undefined
let tabPanel: vscode.WebviewPanel | undefined = undefined

/**
 * Get the currently active panel
 * @returns WebviewPanel或WebviewView
 */
export function getPanel(): vscode.WebviewPanel | vscode.WebviewView | undefined {
	return tabPanel || sidebarPanel
}

/**
 * Set panel references
 */
export function setPanel(
	newPanel: vscode.WebviewPanel | vscode.WebviewView | undefined,
	type: "sidebar" | "tab",
): void {
	if (type === "sidebar") {
		sidebarPanel = newPanel as vscode.WebviewView
		tabPanel = undefined
	} else {
		tabPanel = newPanel as vscode.WebviewPanel
		sidebarPanel = undefined
	}
}

export type RegisterCommandOptions = {
	context: vscode.ExtensionContext
	outputChannel: vscode.OutputChannel
	provider: ClineProvider
}

type EvolutionLogEvent = {
	event: string
	phase: "start" | "end" | "error"
	ts: string
	data?: Record<string, unknown>
}

function logEvolutionEvent(outputChannel: vscode.OutputChannel, event: EvolutionLogEvent): void {
	outputChannel.appendLine(`[evolution] ${JSON.stringify(event)}`)
}

// kilocode_change start - Agent Manager provider
let agentManagerProvider: AgentManagerProvider | undefined

const registerAgentManager = (options: RegisterCommandOptions) => {
	const { context, outputChannel, provider } = options

	agentManagerProvider = new AgentManagerProvider(context, outputChannel, provider)
	context.subscriptions.push(agentManagerProvider)
}
// kilocode_change end

export const registerCommands = (options: RegisterCommandOptions) => {
	const { context, outputChannel } = options

	// kilocode_change start
	registerAgentManager(options)
	// kilocode_change end

	for (const [id, callback] of Object.entries(getCommandsMap(options))) {
		const command = getCommand(id as CommandId)
		context.subscriptions.push(vscode.commands.registerCommand(command, callback))
	}
}

const getCommandsMap = ({ context, outputChannel, provider }: RegisterCommandOptions): Record<CommandId, any> => ({
	activationCompleted: () => {},
	// kilocode_change start
	agentManagerOpen: () => {
		agentManagerProvider?.openPanel()
	},
	// kilocode_change end
	cloudButtonClicked: () => {
		const visibleProvider = getVisibleProviderOrLog(outputChannel)

		if (!visibleProvider) {
			return
		}

		TelemetryService.instance.captureTitleButtonClicked("cloud")

		visibleProvider.postMessageToWebview({ type: "action", action: "cloudButtonClicked" })
	},
	plusButtonClicked: async () => {
		const visibleProvider = getVisibleProviderOrLog(outputChannel)

		if (!visibleProvider) {
			return
		}

		TelemetryService.instance.captureTitleButtonClicked("plus")

		await visibleProvider.removeClineFromStack()
		await visibleProvider.refreshWorkspace()
		await visibleProvider.postMessageToWebview({ type: "action", action: "chatButtonClicked" })
		// Send focusInput action immediately after chatButtonClicked
		// This ensures the focus happens after the view has switched
		await visibleProvider.postMessageToWebview({ type: "action", action: "focusInput" })
	},
	popoutButtonClicked: () => {
		TelemetryService.instance.captureTitleButtonClicked("popout")

		return openClineInNewTab({ context, outputChannel })
	},
	openInNewTab: () => openClineInNewTab({ context, outputChannel }),
	settingsButtonClicked: () => {
		const visibleProvider = getVisibleProviderOrLog(outputChannel)

		if (!visibleProvider) {
			return
		}

		TelemetryService.instance.captureTitleButtonClicked("settings")

		visibleProvider.postMessageToWebview({ type: "action", action: "settingsButtonClicked" })
		// Also explicitly post the visibility message to trigger scroll reliably
		visibleProvider.postMessageToWebview({ type: "action", action: "didBecomeVisible" })
	},
	historyButtonClicked: () => {
		const visibleProvider = getVisibleProviderOrLog(outputChannel)

		if (!visibleProvider) {
			return
		}

		TelemetryService.instance.captureTitleButtonClicked("history")

		visibleProvider.postMessageToWebview({ type: "action", action: "historyButtonClicked" })
	},
	// kilocode_change begin
	mcpButtonClicked: () => {
		const visibleProvider = getVisibleProviderOrLog(outputChannel)

		if (!visibleProvider) {
			return
		}

		TelemetryService.instance.captureTitleButtonClicked("mcp")

		visibleProvider.postMessageToWebview({ type: "action", action: "mcpButtonClicked" })
	},
	promptsButtonClicked: () => {
		const visibleProvider = getVisibleProviderOrLog(outputChannel)

		if (!visibleProvider) {
			return
		}

		TelemetryService.instance.captureTitleButtonClicked("prompts")

		visibleProvider.postMessageToWebview({ type: "action", action: "promptsButtonClicked" })
	},
	profileButtonClicked: () => {
		const visibleProvider = getVisibleProviderOrLog(outputChannel)

		if (!visibleProvider) {
			return
		}

		visibleProvider.postMessageToWebview({ type: "action", action: "profileButtonClicked" })
	},
	helpButtonClicked: () => {
		vscode.env.openExternal(vscode.Uri.parse(getAppUrl()))
	},
	// kilocode_change end
	marketplaceButtonClicked: () => {
		const visibleProvider = getVisibleProviderOrLog(outputChannel)
		if (!visibleProvider) return
		visibleProvider.postMessageToWebview({ type: "action", action: "marketplaceButtonClicked" })
	},
	showHumanRelayDialog: (params: { requestId: string; promptText: string }) => {
		const panel = getPanel()

		if (panel) {
			panel?.webview.postMessage({
				type: "showHumanRelayDialog",
				requestId: params.requestId,
				promptText: params.promptText,
			})
		}
	},
	registerHumanRelayCallback: registerHumanRelayCallback,
	unregisterHumanRelayCallback: unregisterHumanRelayCallback,
	handleHumanRelayResponse: handleHumanRelayResponse,
	newTask: handleNewTask,
	setCustomStoragePath: async () => {
		const { promptForCustomStoragePath } = await import("../utils/storage")
		await promptForCustomStoragePath()
	},
	importSettings: async (filePath?: string) => {
		const visibleProvider = getVisibleProviderOrLog(outputChannel)
		if (!visibleProvider) {
			return
		}

		await importSettingsWithFeedback(
			{
				providerSettingsManager: visibleProvider.providerSettingsManager,
				contextProxy: visibleProvider.contextProxy,
				customModesManager: visibleProvider.customModesManager,
				provider: visibleProvider,
			},
			filePath,
		)
	},
	focusPanel: async () => {
		try {
			await focusPanel(tabPanel, sidebarPanel)
		} catch (error) {
			outputChannel.appendLine(`Error focusing panel: ${error}`)
		}
	},
	acceptInput: () => {
		const visibleProvider = getVisibleProviderOrLog(outputChannel)

		if (!visibleProvider) {
			return
		}

		visibleProvider.postMessageToWebview({ type: "acceptInput" })
	}, // kilocode_change begin
	focusChatInput: async () => {
		try {
			await vscode.commands.executeCommand("kilo-code.SidebarProvider.focus")
			await delay(100)

			let visibleProvider = getVisibleProviderOrLog(outputChannel)

			if (!visibleProvider) {
				// If still no visible provider, try opening in a new tab
				const tabProvider = await openClineInNewTab({ context, outputChannel })
				await delay(100)
				visibleProvider = tabProvider
			}

			visibleProvider?.postMessageToWebview({
				type: "action",
				action: "focusChatInput",
			})
		} catch (error) {
			outputChannel.appendLine(`Error in focusChatInput: ${error}`)
		}
	},
	generateTerminalCommand: async () => await generateTerminalCommand({ outputChannel, context }), // kilocode_change
	exportSettings: async () => {
		const visibleProvider = getVisibleProviderOrLog(outputChannel)
		if (!visibleProvider) return

		await exportSettings({
			providerSettingsManager: visibleProvider.providerSettingsManager,
			contextProxy: visibleProvider.contextProxy,
		})
	},
	// Handle external URI - used by JetBrains plugin to forward auth tokens
	handleExternalUri: async (uriString: string) => {
		const visibleProvider = getVisibleProviderOrLog(outputChannel)
		if (!visibleProvider) {
			return
		}

		try {
			// Parse the URI string and create a VSCode URI object
			const uri = vscode.Uri.parse(uriString)

			// Import and use the existing handleUri function
			const { handleUri } = await import("./handleUri")
			await handleUri(uri)

			outputChannel.appendLine(`Successfully handled external URI: ${uriString}`)
		} catch (error) {
			outputChannel.appendLine(`Error handling external URI: ${uriString}, error: ${error}`)
		}
	},
	// kilocode_change end
	bootstrapEvolution: async () => {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
		if (!workspaceFolder) {
			await vscode.window.showErrorMessage("Kilo Code: No workspace folder is open.")
			return
		}

		const projectRoot = workspaceFolder.uri.fsPath

		const plan = await planEvolutionBootstrap({ projectRoot })

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
			return
		}

		const result = await applyEvolutionBootstrap(plan)

		outputChannel.appendLine(`[evolution bootstrap] Project root: ${projectRoot}`)
		for (const created of result.created) {
			outputChannel.appendLine(`[evolution bootstrap] created: ${created}`)
		}
		for (const suggestion of plan.suggestions) {
			outputChannel.appendLine(`[evolution bootstrap] suggestion: ${suggestion}`)
		}

		await vscode.window.showInformationMessage(
			`Kilo Code: Evolution Layer bootstrap complete (created ${result.created.length} file(s)).`,
		)

		if (plan.suggestions.length > 0) {
			await vscode.window.showWarningMessage(
				"Kilo Code: Evolution Layer bootstrap suggestions were generated. See Output → Kilo-Code.",
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
		logEvolutionEvent(outputChannel, {
			event: "vscode.evolution.modeMapSync.preview",
			phase: "start",
			ts: new Date().toISOString(),
			data: { projectRoot },
		})

		try {
			const plan = await planModeMapSync({ projectRoot })
			if (plan.drift.changes.length === 0) {
				logEvolutionEvent(outputChannel, {
					event: "vscode.evolution.modeMapSync.preview",
					phase: "end",
					ts: new Date().toISOString(),
					data: { changed: false },
				})

				await vscode.window.showInformationMessage("Kilo Code: Mode map is already in sync.")
				return
			}

			const artifacts = await writeModeMapSyncProposalArtifacts(plan)
			logEvolutionEvent(outputChannel, {
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
			logEvolutionEvent(outputChannel, {
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
		logEvolutionEvent(outputChannel, {
			event: "vscode.evolution.modeMapSync.apply",
			phase: "start",
			ts: new Date().toISOString(),
			data: { projectRoot },
		})

		try {
			const plan = await planModeMapSync({ projectRoot })
			if (plan.drift.changes.length === 0) {
				logEvolutionEvent(outputChannel, {
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
			logEvolutionEvent(outputChannel, {
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
			logEvolutionEvent(outputChannel, {
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

		try {
			logEvolutionEvent(outputChannel, {
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

			logEvolutionEvent(outputChannel, {
				event: "vscode.evolution.trace.export",
				phase: "end",
				ts: new Date().toISOString(),
				data: { outputPath: result.outputPath },
			})

			await vscode.window.showInformationMessage(`Trace exported: ${result.outputPath}`)
		} catch (error) {
			logEvolutionEvent(outputChannel, {
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

		logEvolutionEvent(outputChannel, {
			event: "vscode.evolution.council.run",
			phase: "start",
			ts: new Date().toISOString(),
			data: {
				tracePath: nodePath.relative(projectRoot, pickedTrace.absPath),
				councilConfigPath: ".kilocode/evolution/council.yaml",
				outDir: ".kilocode/evals/reports",
			},
		})

		try {
			const result = await runCouncilReview({
				projectRoot,
				tracePath: pickedTrace.absPath,
				resolveProfile: async (profileName) => {
					const { name: _name, ...profile } = await visibleProvider.providerSettingsManager.getProfile({
						name: profileName,
					})
					return profile
				},
				completePrompt: async (settings, prompt) => await singleCompletionHandler(settings, prompt),
			})

			logEvolutionEvent(outputChannel, {
				event: "vscode.evolution.council.run",
				phase: "end",
				ts: new Date().toISOString(),
				data: {
					reportsDir: nodePath.relative(projectRoot, result.reportsDir),
					scorecards: result.scorecardPaths.length,
				},
			})

			await vscode.window.showInformationMessage(
				`Council scorecards written: ${nodePath.relative(projectRoot, result.reportsDir)}`,
			)
		} catch (error) {
			logEvolutionEvent(outputChannel, {
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

		try {
			const result = await generateEvolutionProposalFromScorecardsShared({
				projectRoot,
				tracePath,
				reportsDir: pickedReportsDir.absPath,
			})

			await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(result.markdownPath))
			await vscode.window.showInformationMessage(
				`Evolution proposal generated: ${nodePath.relative(projectRoot, result.proposalDir)}`,
			)
		} catch (error) {
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
		logEvolutionEvent(outputChannel, {
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

			logEvolutionEvent(outputChannel, {
				event: `vscode.evolution.openLatestArtifact`,
				phase: "end",
				ts: new Date().toISOString(),
				data: { kind: artifact.kind },
			})
		} catch (error) {
			logEvolutionEvent(outputChannel, {
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

	toggleAutoApprove: async () => {
		const visibleProvider = getVisibleProviderOrLog(outputChannel)

		if (!visibleProvider) {
			return
		}

		visibleProvider.postMessageToWebview({
			type: "action",
			action: "toggleAutoApprove",
		})
	},
})

export const openClineInNewTab = async ({ context, outputChannel }: Omit<RegisterCommandOptions, "provider">) => {
	// (This example uses webviewProvider activation event which is necessary to
	// deserialize cached webview, but since we use retainContextWhenHidden, we
	// don't need to use that event).
	// https://github.com/microsoft/vscode-extension-samples/blob/main/webview-sample/src/extension.ts
	const contextProxy = await ContextProxy.getInstance(context)
	const codeIndexManager = CodeIndexManager.getInstance(context)

	// Get the existing MDM service instance to ensure consistent policy enforcement
	let mdmService: MdmService | undefined
	try {
		mdmService = MdmService.getInstance()
	} catch (error) {
		// MDM service not initialized, which is fine - extension can work without it
		mdmService = undefined
	}

	const tabProvider = new ClineProvider(context, outputChannel, "editor", contextProxy, mdmService)
	const lastCol = Math.max(...vscode.window.visibleTextEditors.map((editor) => editor.viewColumn || 0))

	// Check if there are any visible text editors, otherwise open a new group
	// to the right.
	const hasVisibleEditors = vscode.window.visibleTextEditors.length > 0

	if (!hasVisibleEditors) {
		await vscode.commands.executeCommand("workbench.action.newGroupRight")
	}

	const targetCol = hasVisibleEditors ? Math.max(lastCol + 1, 1) : vscode.ViewColumn.Two

	const newPanel = vscode.window.createWebviewPanel(ClineProvider.tabPanelId, "Kilo Code", targetCol, {
		enableScripts: true,
		retainContextWhenHidden: true,
		localResourceRoots: [context.extensionUri],
	})

	// Save as tab type panel.
	setPanel(newPanel, "tab")

	newPanel.iconPath = {
		light: vscode.Uri.joinPath(context.extensionUri, "assets", "icons", "kilo.png"),
		dark: vscode.Uri.joinPath(context.extensionUri, "assets", "icons", "kilo-dark.png"),
	}

	await tabProvider.resolveWebviewView(newPanel)

	// Add listener for visibility changes to notify webview
	newPanel.onDidChangeViewState(
		(e) => {
			const panel = e.webviewPanel
			if (panel.visible) {
				panel.webview.postMessage({ type: "action", action: "didBecomeVisible" }) // Use the same message type as in SettingsView.tsx
			}
		},
		null, // First null is for `thisArgs`
		context.subscriptions, // Register listener for disposal
	)

	// Handle panel closing events.
	newPanel.onDidDispose(
		() => {
			setPanel(undefined, "tab")
		},
		null,
		context.subscriptions, // Also register dispose listener
	)

	// Lock the editor group so clicking on files doesn't open them over the panel.
	await delay(100)
	await vscode.commands.executeCommand("workbench.action.lockEditorGroup")

	return tabProvider
}
