/**
 * A/B Test Service for Evolution Layer Level 3 Automation
 *
 * This service orchestrates A/B testing of different mode configurations
 * on the same task using the Sequential Execution with Checkpoints strategy.
 *
 * Key features:
 * - Sequential variant execution with rollback between runs
 * - Integration with ShadowCheckpointService for workspace snapshots
 * - Headless task execution via HeadlessClineProvider
 * - Result comparison and Council review preparation
 *
 * @module
 */

import * as vscode from "vscode"
import * as path from "path"
import { mkdir, writeFile } from "fs/promises"
import EventEmitter from "events"

import { ClineProvider } from "../../core/webview/ClineProvider"
import { RepoPerTaskCheckpointService } from "../checkpoints/RepoPerTaskCheckpointService"
import { TraceExporter } from "../../core/traces/TraceExporter"

import { HeadlessClineProvider, createHeadlessClineProvider, type HeadlessTaskOptions } from "./HeadlessClineProvider"

import {
	type ABTestConfig,
	type ABTestResult,
	type ABTestVariantResult,
	type ABTestComparison,
	type ABTestProgress,
	type ABTestEvent,
	ABTestStatus,
	generateTestId,
	createComparison,
	DEFAULT_AB_TEST_CONFIG,
} from "../../shared/evolution/abTestSchemas"

/**
 * Events emitted by ABTestService
 */
export interface ABTestServiceEvents {
	progress: ABTestProgress
	variantStarted: { variantId: string; variantIndex: number }
	variantCompleted: ABTestVariantResult
	variantFailed: { variantId: string; error: string }
	rollbackStarted: { checkpointHash: string }
	rollbackCompleted: { checkpointHash: string; durationMs: number }
	testCompleted: ABTestResult
	testFailed: { error: string }
}

/**
 * Options for creating an ABTestService
 */
export interface ABTestServiceOptions {
	context: vscode.ExtensionContext
	provider: ClineProvider
	outputChannel: vscode.OutputChannel
	globalStorageDir: string
}

/**
 * ABTestService - Orchestrates A/B testing for Evolution Layer
 *
 * This service implements the Sequential Execution with Checkpoints strategy:
 * 1. Create baseline checkpoint of workspace state
 * 2. Run first variant (control) in headless mode
 * 3. Capture results and create checkpoint
 * 4. Rollback to baseline
 * 5. Run second variant (experiment) in headless mode
 * 6. Compare results and generate comparison report
 */
export class ABTestService extends EventEmitter {
	private context: vscode.ExtensionContext
	private provider: ClineProvider
	private outputChannel: vscode.OutputChannel
	private globalStorageDir: string

	private currentTest?: ABTestConfig
	private checkpointService?: RepoPerTaskCheckpointService
	private headlessProvider?: HeadlessClineProvider
	private isRunning: boolean = false
	private isCancelled: boolean = false

	constructor(options: ABTestServiceOptions) {
		super()
		this.context = options.context
		this.provider = options.provider
		this.outputChannel = options.outputChannel
		this.globalStorageDir = options.globalStorageDir
	}

	/**
	 * Log a message to the output channel
	 */
	private log(message: string): void {
		const timestamp = new Date().toISOString()
		this.outputChannel.appendLine(`[${timestamp}] [ABTestService] ${message}`)
	}

	/**
	 * Emit a progress update
	 */
	private emitProgress(
		status: ABTestStatus,
		currentVariantIndex: number,
		totalVariants: number,
		message: string,
		currentVariantId?: string,
	): void {
		const progress: ABTestProgress = {
			testId: this.currentTest?.testId ?? "unknown",
			status,
			currentVariantIndex,
			totalVariants,
			currentVariantId,
			message,
			percentComplete: Math.round((currentVariantIndex / totalVariants) * 100),
			timestamp: Date.now(),
		}

		this.emit("progress", progress)
		this.log(`Progress: ${message} (${progress.percentComplete}%)`)
	}

	/**
	 * Run an A/B test with the given configuration
	 */
	async runABTest(
		config: Partial<ABTestConfig> & { taskPrompt: string; variants: ABTestConfig["variants"] },
	): Promise<ABTestResult> {
		if (this.isRunning) {
			throw new Error("An A/B test is already running")
		}

		this.isRunning = true
		this.isCancelled = false

		// Apply defaults and generate test ID
		const testId = config.testId ?? generateTestId()
		const fullConfig: ABTestConfig = {
			testId,
			taskPrompt: config.taskPrompt,
			variants: config.variants,
			timeoutMs: config.timeoutMs ?? DEFAULT_AB_TEST_CONFIG.timeoutMs!,
			maxRequestsPerVariant: config.maxRequestsPerVariant ?? DEFAULT_AB_TEST_CONFIG.maxRequestsPerVariant,
			enableCheckpoints: config.enableCheckpoints ?? DEFAULT_AB_TEST_CONFIG.enableCheckpoints!,
			workspacePath: config.workspacePath ?? this.provider.cwd,
			createdAt: Date.now(),
			originalTaskId: config.originalTaskId,
			images: config.images,
		}

		this.currentTest = fullConfig
		const startedAt = Date.now()

		this.log(`Starting A/B test ${testId}`)
		this.log(`Task: ${fullConfig.taskPrompt.substring(0, 100)}...`)
		this.log(`Variants: ${fullConfig.variants.map((v) => v.name).join(", ")}`)
		this.log(`Timeout per variant: ${fullConfig.timeoutMs}ms`)
		this.log(`Checkpoints enabled: ${fullConfig.enableCheckpoints}`)

		const variantResults: ABTestVariantResult[] = []
		let baselineCheckpoint: string | undefined
		let error: string | undefined

		try {
			// Step 1: Initialize checkpoint service if enabled
			if (fullConfig.enableCheckpoints) {
				this.emitProgress(ABTestStatus.Initializing, 0, fullConfig.variants.length, "Initializing checkpoints")
				await this.initializeCheckpoints(testId, fullConfig.workspacePath)
				baselineCheckpoint = this.checkpointService?.baseHash
				this.log(`Baseline checkpoint: ${baselineCheckpoint}`)
			}

			// Step 2: Create headless provider
			this.headlessProvider = createHeadlessClineProvider(this.context, this.outputChannel, this.provider)

			// Step 3: Execute each variant
			for (let i = 0; i < fullConfig.variants.length; i++) {
				if (this.isCancelled) {
					this.log("Test cancelled by user")
					break
				}

				const variant = fullConfig.variants[i]

				// Rollback to baseline before each variant (except first)
				if (i > 0 && fullConfig.enableCheckpoints && baselineCheckpoint) {
					this.emitProgress(
						ABTestStatus.RollingBack,
						i,
						fullConfig.variants.length,
						`Rolling back to baseline for variant: ${variant.name}`,
						variant.id,
					)

					await this.rollbackToCheckpoint(baselineCheckpoint)
				}

				// Execute the variant
				this.emitProgress(
					ABTestStatus.Running,
					i,
					fullConfig.variants.length,
					`Running variant: ${variant.name}`,
					variant.id,
				)

				this.emit("variantStarted", { variantId: variant.id, variantIndex: i })

				try {
					const result = await this.executeVariant(fullConfig, variant, i)
					variantResults.push(result)

					// Save checkpoint after variant if enabled
					if (fullConfig.enableCheckpoints && this.checkpointService) {
						const checkpointResult = await this.checkpointService.saveCheckpoint(
							`A/B test ${testId} - variant ${variant.id}`,
							{ allowEmpty: true },
						)
						if (checkpointResult?.commit) {
							result.checkpointAfter = checkpointResult.commit
						}
					}

					this.emit("variantCompleted", result)
				} catch (variantError) {
					const errorMessage = variantError instanceof Error ? variantError.message : String(variantError)
					this.log(`Variant ${variant.id} failed: ${errorMessage}`)
					this.emit("variantFailed", { variantId: variant.id, error: errorMessage })

					// Create a failed result
					variantResults.push({
						variantId: variant.id,
						variantName: variant.name,
						success: false,
						error: errorMessage,
						tokenUsage: { totalTokensIn: 0, totalTokensOut: 0, totalCost: 0, contextTokens: 0 },
						toolUsage: {},
						totalCost: 0,
						durationMs: 0,
						requestCount: 0,
						fileChanges: [],
						toolCalls: [],
						startedAt: Date.now(),
						completedAt: Date.now(),
					})
				}
			}

			// Step 4: Generate comparisons
			this.emitProgress(
				ABTestStatus.Analyzing,
				fullConfig.variants.length,
				fullConfig.variants.length,
				"Analyzing results",
			)

			const comparisons = this.generateComparisons(variantResults)

			// Step 5: Determine winner and build result
			const winnerId = this.determineWinner(variantResults, comparisons)
			const completedAt = Date.now()

			const result: ABTestResult = {
				testId,
				config: fullConfig,
				startedAt,
				completedAt,
				totalDurationMs: completedAt - startedAt,
				variants: variantResults,
				comparisons,
				status: variantResults.every((v) => v.success)
					? "completed"
					: variantResults.some((v) => v.success)
						? "partial"
						: "failed",
				winnerId,
			}

			// Step 6: Save results to disk
			const outputDir = await this.saveResults(result)
			result.outputDir = outputDir

			this.emitProgress(
				ABTestStatus.Completed,
				fullConfig.variants.length,
				fullConfig.variants.length,
				"Test completed",
			)

			this.emit("testCompleted", result)
			this.log(`A/B test ${testId} completed. Winner: ${winnerId ?? "inconclusive"}`)

			return result
		} catch (e) {
			error = e instanceof Error ? e.message : String(e)
			this.log(`A/B test ${testId} failed: ${error}`)
			this.emit("testFailed", { error })

			const completedAt = Date.now()
			return {
				testId,
				config: fullConfig,
				startedAt,
				completedAt,
				totalDurationMs: completedAt - startedAt,
				variants: variantResults,
				comparisons: [],
				status: "failed",
				error,
			}
		} finally {
			this.isRunning = false
			this.currentTest = undefined
			this.cleanup()
		}
	}

	/**
	 * Cancel the currently running test
	 */
	async cancelTest(): Promise<void> {
		if (!this.isRunning) {
			return
		}

		this.log("Cancelling A/B test")
		this.isCancelled = true

		if (this.headlessProvider) {
			await this.headlessProvider.abort()
		}
	}

	/**
	 * Initialize checkpoint service for the test
	 */
	private async initializeCheckpoints(testId: string, workspacePath: string): Promise<void> {
		this.log(`Initializing checkpoint service for test ${testId}`)

		this.checkpointService = RepoPerTaskCheckpointService.create({
			taskId: `ab-test-${testId}`,
			workspaceDir: workspacePath,
			shadowDir: this.globalStorageDir,
			log: (msg) => this.log(`[Checkpoint] ${msg}`),
		})

		await this.checkpointService.initShadowGit()
		this.log(`Checkpoint service initialized with base hash: ${this.checkpointService.baseHash}`)
	}

	/**
	 * Rollback to a specific checkpoint
	 */
	private async rollbackToCheckpoint(checkpointHash: string): Promise<void> {
		if (!this.checkpointService) {
			throw new Error("Checkpoint service not initialized")
		}

		const startTime = Date.now()
		this.emit("rollbackStarted", { checkpointHash })
		this.log(`Rolling back to checkpoint ${checkpointHash}`)

		await this.checkpointService.restoreCheckpoint(checkpointHash)

		const durationMs = Date.now() - startTime
		this.emit("rollbackCompleted", { checkpointHash, durationMs })
		this.log(`Rollback completed in ${durationMs}ms`)
	}

	/**
	 * Execute a single variant
	 */
	private async executeVariant(
		config: ABTestConfig,
		variant: ABTestConfig["variants"][0],
		variantIndex: number,
	): Promise<ABTestVariantResult> {
		if (!this.headlessProvider) {
			throw new Error("Headless provider not initialized")
		}

		this.log(`Executing variant ${variant.id}: ${variant.name}`)

		const options: HeadlessTaskOptions = {
			taskPrompt: config.taskPrompt,
			images: config.images,
			modeSlug: variant.modeSlug,
			providerSettings: variant.providerSettings,
			customInstructions: variant.customInstructions,
			timeoutMs: config.timeoutMs,
			maxRequests: config.maxRequestsPerVariant,
			workspacePath: config.workspacePath,
			variantConfig: variant,
		}

		const result = await this.headlessProvider.runTask(options)

		// Export trace for Council review
		if (result.taskId) {
			try {
				const traceResult = await TraceExporter.exportTraceForCouncil({
					workspaceRoot: config.workspacePath,
					globalStoragePath: this.globalStorageDir,
					taskId: result.taskId,
					historyItem: result.historyItem,
					redact: true,
				})
				result.tracePath = traceResult.outputPath
				this.log(`Trace exported: ${traceResult.outputPath}`)
			} catch (traceError) {
				this.log(
					`Failed to export trace: ${traceError instanceof Error ? traceError.message : String(traceError)}`,
				)
			}
		}

		// Record checkpoint hash before this variant started
		if (this.checkpointService?.baseHash) {
			result.checkpointBefore = this.checkpointService.baseHash
		}

		return result
	}

	/**
	 * Generate pairwise comparisons between variants
	 */
	private generateComparisons(results: ABTestVariantResult[]): ABTestComparison[] {
		const comparisons: ABTestComparison[] = []

		if (results.length < 2) {
			return comparisons
		}

		// Compare first variant (control) against all others (experiments)
		const control = results[0]
		for (let i = 1; i < results.length; i++) {
			const experiment = results[i]
			const comparison = createComparison(control, experiment)
			comparisons.push(comparison)
		}

		return comparisons
	}

	/**
	 * Determine the winning variant based on comparisons
	 */
	private determineWinner(results: ABTestVariantResult[], comparisons: ABTestComparison[]): string | undefined {
		if (results.length === 0) {
			return undefined
		}

		if (results.length === 1) {
			return results[0].success ? results[0].variantId : undefined
		}

		// Count recommendations
		const votes: Record<string, number> = {}
		for (const result of results) {
			votes[result.variantId] = 0
		}

		for (const comparison of comparisons) {
			if (comparison.recommendation === "prefer-control") {
				votes[comparison.controlId]++
			} else if (comparison.recommendation === "prefer-experiment") {
				votes[comparison.experimentId]++
			}
		}

		// Find winner (highest votes, must have succeeded)
		let winner: string | undefined
		let maxVotes = -1

		for (const result of results) {
			if (result.success && votes[result.variantId] > maxVotes) {
				maxVotes = votes[result.variantId]
				winner = result.variantId
			}
		}

		return winner
	}

	/**
	 * Save test results to disk
	 */
	private async saveResults(result: ABTestResult): Promise<string> {
		const outputDir = path.join(result.config.workspacePath, ".kilocode", "evolution", "ab-tests", result.testId)

		await mkdir(outputDir, { recursive: true })

		// Save full result
		await writeFile(path.join(outputDir, "result.json"), JSON.stringify(result, null, 2), "utf8")

		// Save human-readable summary
		const summary = this.generateSummaryMarkdown(result)
		await writeFile(path.join(outputDir, "summary.md"), summary, "utf8")

		// Save comparisons
		for (const comparison of result.comparisons) {
			await writeFile(
				path.join(outputDir, `comparison-${comparison.controlId}-vs-${comparison.experimentId}.json`),
				JSON.stringify(comparison, null, 2),
				"utf8",
			)
		}

		this.log(`Results saved to ${outputDir}`)
		return outputDir
	}

	/**
	 * Generate a human-readable summary markdown
	 */
	private generateSummaryMarkdown(result: ABTestResult): string {
		const lines: string[] = [
			`# A/B Test Results: ${result.testId}`,
			"",
			`**Task:** ${result.config.taskPrompt.substring(0, 200)}${result.config.taskPrompt.length > 200 ? "..." : ""}`,
			"",
			`**Status:** ${result.status}`,
			`**Duration:** ${(result.totalDurationMs / 1000).toFixed(1)}s`,
			`**Started:** ${new Date(result.startedAt).toISOString()}`,
			`**Completed:** ${new Date(result.completedAt).toISOString()}`,
			"",
			"## Variants",
			"",
		]

		for (const variant of result.variants) {
			lines.push(`### ${variant.variantName} (${variant.variantId})`)
			lines.push("")
			lines.push(`- **Success:** ${variant.success ? "✓" : "✗"}`)
			if (variant.error) {
				lines.push(`- **Error:** ${variant.error}`)
			}
			lines.push(`- **Cost:** $${variant.totalCost.toFixed(4)}`)
			lines.push(`- **Duration:** ${(variant.durationMs / 1000).toFixed(1)}s`)
			lines.push(`- **Tokens In:** ${variant.tokenUsage.totalTokensIn}`)
			lines.push(`- **Tokens Out:** ${variant.tokenUsage.totalTokensOut}`)
			lines.push(`- **File Changes:** ${variant.fileChanges.length}`)
			lines.push(`- **Tool Calls:** ${variant.toolCalls.length}`)
			lines.push("")
		}

		if (result.comparisons.length > 0) {
			lines.push("## Comparisons")
			lines.push("")

			for (const comparison of result.comparisons) {
				lines.push(`### ${comparison.controlId} vs ${comparison.experimentId}`)
				lines.push("")
				lines.push(comparison.summary)
				lines.push("")
				lines.push(`**Recommendation:** ${comparison.recommendation ?? "inconclusive"}`)
				lines.push("")
			}
		}

		if (result.winnerId) {
			lines.push("## Winner")
			lines.push("")
			const winner = result.variants.find((v) => v.variantId === result.winnerId)
			lines.push(`**${winner?.variantName ?? result.winnerId}** was determined to be the more efficient variant.`)
			lines.push("")
		}

		if (result.error) {
			lines.push("## Error")
			lines.push("")
			lines.push(`\`\`\``)
			lines.push(result.error)
			lines.push(`\`\`\``)
			lines.push("")
		}

		return lines.join("\n")
	}

	/**
	 * Clean up resources
	 */
	private cleanup(): void {
		if (this.headlessProvider) {
			this.headlessProvider.dispose()
			this.headlessProvider = undefined
		}
		// Note: We don't dispose checkpointService here as it may be needed for review
	}

	/**
	 * Check if a test is currently running
	 */
	isTestRunning(): boolean {
		return this.isRunning
	}

	/**
	 * Get current test config
	 */
	getCurrentTest(): ABTestConfig | undefined {
		return this.currentTest
	}

	/**
	 * Typed event emitter methods
	 */
	override emit<K extends keyof ABTestServiceEvents>(event: K, data: ABTestServiceEvents[K]): boolean {
		return super.emit(event, data)
	}

	override on<K extends keyof ABTestServiceEvents>(event: K, listener: (data: ABTestServiceEvents[K]) => void): this {
		return super.on(event, listener)
	}

	override off<K extends keyof ABTestServiceEvents>(
		event: K,
		listener: (data: ABTestServiceEvents[K]) => void,
	): this {
		return super.off(event, listener)
	}
}

/**
 * Create an ABTestService instance
 */
export function createABTestService(options: ABTestServiceOptions): ABTestService {
	return new ABTestService(options)
}
