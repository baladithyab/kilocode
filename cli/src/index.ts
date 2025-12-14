#!/usr/bin/env node

// Load .env file before any other imports or initialization
import { loadEnvFile } from "./utils/env-loader.js"
loadEnvFile()

import { Command } from "commander"
import { existsSync } from "fs"
import path from "path"
import { CLI } from "./cli.js"
import { DEFAULT_MODES, getAllModes } from "./constants/modes/defaults.js"
import { getTelemetryService } from "./services/telemetry/index.js"
import { Package } from "./constants/package.js"
import openConfigFile from "./config/openConfig.js"
import authWizard from "./auth/index.js"
import { configExists } from "./config/persistence.js"
import { loadCustomModes } from "./config/customModes.js"
import { envConfigExists, getMissingEnvVars } from "./config/env-config.js"
import { getParallelModeParams } from "./parallel/parallel.js"
import { DEBUG_MODES, DEBUG_FUNCTIONS } from "./debug/index.js"
import { logs } from "./services/logs.js"
import { runEvolutionBootstrapCli } from "./evolution/bootstrap.js"
import { runEvolutionModeMapSyncCli } from "./evolution/mode-map-sync.js"
import { runEvolutionOpenCli } from "./evolution/open.js"
import { runTraceExportCli } from "./trace/export.js"
import { runCouncilRunCli } from "./council/run.js"
import { runEvolveProposeCli } from "./evolution/propose.js"

const program = new Command()
let cli: CLI | null = null

// Get list of valid mode slugs from default modes
// Custom modes will be loaded and validated per workspace
const validModes = DEFAULT_MODES.map((mode) => mode.slug)

program
	.name("kilocode")
	.description("Kilo Code Terminal User Interface - AI-powered coding assistant")
	.version(Package.version)
	.option("-m, --mode <mode>", `Set the mode of operation (${validModes.join(", ")})`)
	.option("-w, --workspace <path>", "Path to the workspace directory", process.cwd())
	.option("-a, --auto", "Run in autonomous mode (non-interactive)", false)
	.option("--yolo", "Auto-approve all tool permissions", false)
	.option("-j, --json", "Output messages as JSON (requires --auto)", false)
	.option("-i, --json-io", "Bidirectional JSON mode (no TUI, stdin/stdout enabled)", false)
	.option("-c, --continue", "Resume the last conversation from this workspace", false)
	.option("-t, --timeout <seconds>", "Timeout in seconds for autonomous mode (requires --auto)", parseInt)
	.option(
		"-p, --parallel",
		"Run in parallel mode - the agent will create a separate git branch, unless you provide the --existing-branch option",
	)
	.option("-eb, --existing-branch <branch>", "(Parallel mode only) Instructs the agent to work on an existing branch")
	.option("-pv, --provider <id>", "Select provider by ID (e.g., 'kilocode-1')")
	.option("-mo, --model <model>", "Override model for the selected provider")
	.option("-s, --session <sessionId>", "Restore a session by ID")
	.option("-f, --fork <shareId>", "Fork a session by ID")
	.option("--nosplash", "Disable the welcome message and update notifications", false)
	.argument("[prompt]", "The prompt or command to execute")
	.action(async (prompt, options) => {
		// Validate that --existing-branch requires --parallel
		if (options.existingBranch && !options.parallel) {
			console.error("Error: --existing-branch option requires --parallel flag to be enabled")
			process.exit(1)
		}

		// Validate workspace path exists
		if (!existsSync(options.workspace)) {
			console.error(`Error: Workspace path does not exist: ${options.workspace}`)
			process.exit(1)
		}

		// Load custom modes from workspace
		const customModes = await loadCustomModes(options.workspace)
		const allModes = getAllModes(customModes)
		const allValidModes = allModes.map((mode) => mode.slug)

		// Validate mode if provided
		if (options.mode && !allValidModes.includes(options.mode)) {
			console.error(`Error: Invalid mode "${options.mode}". Valid modes are: ${allValidModes.join(", ")}`)
			process.exit(1)
		}

		// Read from stdin if no prompt argument is provided and stdin is piped
		let finalPrompt = prompt || ""
		if (!finalPrompt && !process.stdin.isTTY) {
			// Read from stdin
			const chunks: Buffer[] = []
			for await (const chunk of process.stdin) {
				chunks.push(chunk)
			}
			finalPrompt = Buffer.concat(chunks).toString("utf-8").trim()
		}

		// Validate that autonomous mode requires a prompt
		if (options.auto && !finalPrompt) {
			console.error(
				"Error: autonomous mode (--auto) and parallel mode (--parallel) require a prompt argument or piped input",
			)
			process.exit(1)
		}

		// Validate that timeout requires autonomous mode
		if (options.timeout && !options.auto) {
			console.error("Error: --timeout option requires --auto flag to be enabled")
			process.exit(1)
		}

		// Validate timeout is a positive number
		if (options.timeout && (isNaN(options.timeout) || options.timeout <= 0)) {
			console.error("Error: --timeout must be a positive number")
			process.exit(1)
		}

		// Validate that continue mode is not used with autonomous mode
		if (options.continue && options.auto) {
			console.error("Error: --continue option cannot be used with --auto flag")
			process.exit(1)
		}

		// Validate that continue mode is not used with a prompt
		if (options.continue && finalPrompt) {
			console.error("Error: --continue option cannot be used with a prompt argument")
			process.exit(1)
		}

		// Validate that --fork and --session are not used together
		if (options.fork && options.session) {
			console.error("Error: --fork and --session options cannot be used together")
			process.exit(1)
		}

		// Validate that piped stdin requires autonomous mode or json-io mode
		if (!process.stdin.isTTY && !options.auto && !options.jsonIo) {
			console.error("Error: Piped input requires --auto or --json-io flag to be enabled")
			process.exit(1)
		}

		// Validate that --json requires --auto (--json-io is independent)
		if (options.json && !options.auto) {
			console.error("Error: --json option requires --auto flag to be enabled")
			process.exit(1)
		}

		// Validate provider if specified
		if (options.provider) {
			// Load config to check if provider exists
			const { loadConfig } = await import("./config/persistence.js")
			const { config } = await loadConfig()
			const providerExists = config.providers.some((p) => p.id === options.provider)
			if (!providerExists) {
				const availableIds = config.providers.map((p) => p.id).join(", ")
				console.error(`Error: Provider "${options.provider}" not found. Available providers: ${availableIds}`)
				process.exit(1)
			}
		}

		// Track autonomous mode start if applicable
		if (options.auto && finalPrompt) {
			getTelemetryService().trackCIModeStarted(finalPrompt.length, options.timeout)
		}

		// Check if config exists or if we have minimal env config
		const hasConfig = await configExists()

		// Check if we have env config with all required fields
		const hasEnvConfig = envConfigExists()

		if (!hasConfig && !hasEnvConfig) {
			// No config file and no env config - show auth wizard
			console.info("Welcome to the Kilo Code CLI! 🎉\n")
			console.info("To get you started, please fill out these following questions.")
			await authWizard()
		} else if (!hasConfig && hasEnvConfig) {
			// Running with env config only
			logs.info("Running in ephemeral mode with environment variable configuration", "Index")

			const providerType = process.env.KILO_PROVIDER_TYPE
			if (providerType) {
				const missing = getMissingEnvVars(providerType)
				if (missing.length > 0) {
					console.error(`\nError: Missing required environment variables for provider "${providerType}":`)
					console.error(`  ${missing.join("\n  ")}`)
					console.error(
						`\nPlease set these environment variables or run 'kilocode auth' to configure via wizard.\n`,
					)
					process.exit(1)
				}
			}
		} else if (hasConfig && hasEnvConfig) {
			// Both exist - env vars will override config file values
			logs.debug("Using config file with environment variable overrides", "Index")
		}

		let finalWorkspace = options.workspace
		let worktreeBranch

		if (options.parallel) {
			const parallelParams = await getParallelModeParams({
				cwd: options.workspace,
				prompt: finalPrompt,
				timeout: options.timeout,
				existingBranch: options.existingBranch,
			})

			finalWorkspace = parallelParams.worktreePath
			worktreeBranch = parallelParams.worktreeBranch

			getTelemetryService().trackParallelModeStarted(
				!!options.existingBranch,
				finalPrompt.length,
				options.timeout,
			)
		}

		logs.debug("Starting Kilo Code CLI", "Index", { options })

		const jsonIoMode = options.jsonIo

		cli = new CLI({
			mode: options.mode,
			workspace: finalWorkspace,
			ci: options.auto,
			yolo: options.yolo,
			// json-io mode implies json output (both modes output JSON to stdout)
			json: options.json || jsonIoMode,
			jsonInteractive: jsonIoMode,
			prompt: finalPrompt,
			timeout: options.timeout,
			customModes: customModes,
			parallel: options.parallel,
			worktreeBranch,
			continue: options.continue,
			provider: options.provider,
			model: options.model,
			session: options.session,
			fork: options.fork,
			noSplash: options.nosplash,
		})
		await cli.start()
		await cli.dispose()
	})

program
	.command("auth")
	.description("Manage authentication for the Kilo Code CLI")
	.action(async () => {
		await authWizard()
	})

// Config command - opens the config file in the default editor
program
	.command("config")
	.description("Open the configuration file in your default editor")
	.action(async () => {
		try {
			await openConfigFile()
		} catch (_error) {
			// Error already logged by openConfigFile
			process.exit(1)
		}
	})

// Debug command - checks hardware and OS compatibility
program
	.command("debug")
	.description("Run a system compatibility check for the Kilo Code CLI")
	.argument("[mode]", `The mode to debug (${DEBUG_MODES.join(", ")})`, "")
	.action(async (mode: string) => {
		if (!mode || !DEBUG_MODES.includes(mode)) {
			console.error(`Error: Invalid debug mode. Valid modes are: ${DEBUG_MODES.join(", ")}`)
			process.exit(1)
		}

		const debugFunction = DEBUG_FUNCTIONS[mode as keyof typeof DEBUG_FUNCTIONS]
		if (!debugFunction) {
			console.error(`Error: Debug function not implemented for mode: ${mode}`)
			process.exit(1)
		}

		await debugFunction()
	})

// Evolution Layer utilities
const evolution = program.command("evolution").description("Evolution Layer utilities")

// Bootstrap
// (create-missing-only)
evolution
	.command("bootstrap")
	.description("Bootstrap the Evolution Layer scaffold in the current directory (create-missing-only)")
	.action(async () => {
		try {
			await runEvolutionBootstrapCli({ projectRoot: process.cwd() })
		} catch (error) {
			console.error(error instanceof Error ? error.message : String(error))
			process.exit(1)
		}
	})

// Mode Map Sync
// Source of truth: docs/llm-mode-map.yaml
// Target: .kilocode/evolution/council.yaml
// Produces rollback-friendly artifacts in .kilocode/evolution/proposals/
evolution
	.command("mode-map")
	.description("Evolution mode map utilities")
	.command("sync")
	.description("Sync Evolution Mode Map (council.yaml profiles)")
	.option("-w, --workspace <path>", "Workspace directory (repo root)", process.cwd())
	.option("--dry-run", "Preview changes (default)", true)
	.option("--apply", "Apply changes to .kilocode/evolution/council.yaml", false)
	.option(
		"--cli-profile-map <path>",
		"CLI profile map YAML path (relative to workspace)",
		".kilocode/evolution/cli-profiles.yaml",
	)
	.option("--no-write-proposal", "Do not write proposal artifacts under .kilocode/evolution/proposals/")
	.option("--verbose", "Print structured logs (JSON)", false)
	.action(async (options) => {
		try {
			await runEvolutionModeMapSyncCli({
				workspaceRoot: options.workspace,
				apply: Boolean(options.apply),
				dryRun: Boolean(options.dryRun),
				writeProposal: Boolean(options.writeProposal),
				cliProfileMapPath: options.cliProfileMap,
				verbose: Boolean(options.verbose),
			})
		} catch (error) {
			console.error(error instanceof Error ? error.message : String(error))
			process.exit(1)
		}
	})

// Discoverability: show latest evolution artifacts in this repo.
// (Print paths only; does not OS-open.)
evolution
	.command("open")
	.description("Print paths to latest Evolution artifacts (trace/report/proposal)")
	.option("-w, --workspace <path>", "Workspace directory (repo root)", process.cwd())
	.action(async (options) => {
		try {
			await runEvolutionOpenCli({ workspaceRoot: options.workspace })
		} catch (error) {
			console.error(error instanceof Error ? error.message : String(error))
			process.exit(1)
		}
	})

// Trace utilities
program
	.command("trace")
	.description("Trace utilities")
	.command("export")
	.description("Export a trace.v1 JSON into .kilocode/traces/runs/")
	.option("-w, --workspace <path>", "Workspace directory (repo root)", process.cwd())
	.option("--task-dir <path>", "Task directory containing ui_messages.json")
	.option("--trace <path>", "Existing trace.v1 JSON to re-export")
	.option("--out-dir <path>", "Output directory (relative to workspace)", ".kilocode/traces/runs")
	.option("--no-redact", "Disable basic redaction (default: redact)")
	.action(async (options) => {
		try {
			const result = await runTraceExportCli({
				workspaceRoot: options.workspace,
				traceInputPath: options.trace,
				taskDir: options.taskDir,
				redact: Boolean(options.redact),
				outDir: options.outDir,
			})
			console.log(result.outputPath)

			const absWorkspace = path.resolve(options.workspace)
			const relTrace = path.relative(absWorkspace, result.outputPath).split(path.sep).join("/")

			console.log("\nNext steps")
			console.log(`- Run council: kilocode council run --workspace ${options.workspace} --trace ${relTrace}`)
			console.log(`- Open latest artifacts: kilocode evolution open --workspace ${options.workspace}`)
		} catch (error) {
			console.error(error instanceof Error ? error.message : String(error))
			process.exit(1)
		}
	})

// Council utilities
program
	.command("council")
	.description("Council review utilities")
	.command("run")
	.description("Run council review on a trace.v1")
	.requiredOption("--trace <path>", "Path to a trace.v1 JSON (relative to --workspace)")
	.option("-w, --workspace <path>", "Workspace directory (repo root)", process.cwd())
	.option(
		"--council-config <path>",
		"Council config YAML path (relative to workspace)",
		".kilocode/evolution/council.yaml",
	)
	.option(
		"--cli-profile-map <path>",
		"CLI profile map YAML path (relative to workspace)",
		".kilocode/evolution/cli-profiles.yaml",
	)
	.option("--out-dir <path>", "Output directory (relative to workspace)", ".kilocode/evals/reports")
	.option("--verbose", "Print structured logs (JSON)", false)
	.action(async (options) => {
		try {
			const result = await runCouncilRunCli({
				workspaceRoot: options.workspace,
				tracePath: options.trace,
				councilConfigPath: options.councilConfig,
				cliProfileMapPath: options.cliProfileMap,
				outDir: options.outDir,
				verbose: Boolean(options.verbose),
			})
			console.log(result.reportsDir)

			const absWorkspace = path.resolve(options.workspace)
			const relReports = path.relative(absWorkspace, result.reportsDir).split(path.sep).join("/")

			console.log("\nNext steps")
			console.log(
				`- Generate proposal: kilocode evolve propose --workspace ${options.workspace} --trace ${options.trace} --reports ${relReports}`,
			)
			console.log(`- Open latest artifacts: kilocode evolution open --workspace ${options.workspace}`)
		} catch (error) {
			console.error(error instanceof Error ? error.message : String(error))
			process.exit(1)
		}
	})

// Evolution proposal utilities
program
	.command("evolve")
	.description("Evolution proposal utilities")
	.command("propose")
	.description("Generate an Evolution proposal folder from a trace + scorecards")
	.requiredOption("--trace <path>", "Path to trace.v1 JSON (relative to --workspace)")
	.requiredOption("--reports <dir>", "Directory containing scorecard.v1 JSON files (relative to --workspace)")
	.option("-w, --workspace <path>", "Workspace directory (repo root)", process.cwd())
	.option("--out-dir <path>", "Output directory (relative to workspace)", ".kilocode/evolution/proposals")
	.action(async (options) => {
		try {
			const result = await runEvolveProposeCli({
				workspaceRoot: options.workspace,
				tracePath: options.trace,
				reportsDir: options.reports,
				outDir: options.outDir,
			})
			console.log(result.proposalDir)

			const absWorkspace = path.resolve(options.workspace)
			const relProposalDir = path.relative(absWorkspace, result.proposalDir).split(path.sep).join("/")
			const relProposalMd = path.relative(absWorkspace, result.markdownPath).split(path.sep).join("/")

			console.log("\nNext steps")
			console.log(`- Proposal directory: ${relProposalDir}`)
			console.log(`- Review proposal markdown: ${relProposalMd}`)
			console.log(`- Open latest artifacts: kilocode evolution open --workspace ${options.workspace}`)
		} catch (error) {
			console.error(error instanceof Error ? error.message : String(error))
			process.exit(1)
		}
	})

// Alias: `kilocode init evolution`
program
	.command("init")
	.description("Initialization helpers")
	.command("evolution")
	.description("Alias for `kilocode evolution bootstrap`")
	.action(async () => {
		try {
			await runEvolutionBootstrapCli({ projectRoot: process.cwd() })
		} catch (error) {
			console.error(error instanceof Error ? error.message : String(error))
			process.exit(1)
		}
	})

// Handle process termination signals
process.on("SIGINT", async () => {
	if (cli) {
		await cli.dispose("SIGINT")
	} else {
		process.exit(130)
	}
})

process.on("SIGTERM", async () => {
	if (cli) {
		await cli.dispose("SIGTERM")
	} else {
		process.exit(143)
	}
})

// Parse command line arguments
program.parse()
