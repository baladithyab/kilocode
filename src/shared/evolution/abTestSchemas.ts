/**
 * A/B Testing Schemas for Evolution Layer Level 3 Automation
 *
 * This module defines the data structures used for A/B testing different
 * mode configurations on the same task to compare performance and behavior.
 *
 * @module
 */

import type { ProviderSettings, TokenUsage, ToolUsage, HistoryItem } from "@roo-code/types"

/**
 * Configuration for a single variant in an A/B test
 */
export interface ABTestVariantConfig {
	/** Unique identifier for this variant (e.g., "control", "experiment", "variant-a") */
	id: string
	/** Human-readable name for display */
	name: string
	/** Optional description of what this variant tests */
	description?: string
	/** Mode slug to use for this variant (e.g., "code", "architect") */
	modeSlug?: string
	/** Provider settings override for this variant */
	providerSettings?: Partial<ProviderSettings>
	/** Custom system prompt additions */
	customInstructions?: string
}

/**
 * Configuration for an A/B test run
 */
export interface ABTestConfig {
	/** Unique identifier for this A/B test */
	testId: string
	/** Reference to original task that triggered this test (if any) */
	originalTaskId?: string
	/** The task prompt to execute */
	taskPrompt: string
	/** Optional images to include with the task */
	images?: string[]
	/** Variant configurations to test */
	variants: ABTestVariantConfig[]
	/** Timeout in milliseconds for each variant execution */
	timeoutMs: number
	/** Maximum number of API requests per variant */
	maxRequestsPerVariant?: number
	/** Whether to enable checkpoints for rollback between variants */
	enableCheckpoints: boolean
	/** Working directory for the test */
	workspacePath: string
	/** Timestamp when the test was created */
	createdAt: number
}

/**
 * Default A/B test configuration values
 */
export const DEFAULT_AB_TEST_CONFIG: Partial<ABTestConfig> = {
	timeoutMs: 5 * 60 * 1000, // 5 minutes per variant
	maxRequestsPerVariant: 50,
	enableCheckpoints: true,
}

/**
 * File operation recorded during a variant run
 */
export interface ABTestFileChange {
	/** File path relative to workspace */
	path: string
	/** Type of change */
	changeType: "create" | "modify" | "delete"
	/** Content before change (for modify/delete) */
	beforeContent?: string
	/** Content after change (for create/modify) */
	afterContent?: string
	/** Timestamp of the change */
	timestamp: number
}

/**
 * Tool invocation recorded during a variant run
 */
export interface ABTestToolCall {
	/** Tool name */
	name: string
	/** Tool parameters */
	params: Record<string, unknown>
	/** Whether the tool succeeded */
	success: boolean
	/** Result or error message */
	result?: string
	/** Timestamp of the invocation */
	timestamp: number
	/** Duration in milliseconds */
	durationMs?: number
}

/**
 * Result of executing a single variant
 */
export interface ABTestVariantResult {
	/** Variant ID */
	variantId: string
	/** Variant name */
	variantName: string
	/** Whether the variant completed successfully */
	success: boolean
	/** Error message if failed */
	error?: string
	/** Task ID created for this variant */
	taskId?: string
	/** History item from the completed task */
	historyItem?: HistoryItem
	/** Token usage statistics */
	tokenUsage: TokenUsage
	/** Tool usage statistics */
	toolUsage: ToolUsage
	/** Total cost in USD */
	totalCost: number
	/** Duration in milliseconds */
	durationMs: number
	/** Number of API requests made */
	requestCount: number
	/** File changes made during execution */
	fileChanges: ABTestFileChange[]
	/** Tool calls made during execution */
	toolCalls: ABTestToolCall[]
	/** Raw trace data path (for Council review) */
	tracePath?: string
	/** Checkpoint hash before this variant started */
	checkpointBefore?: string
	/** Checkpoint hash after this variant completed */
	checkpointAfter?: string
	/** Start timestamp */
	startedAt: number
	/** End timestamp */
	completedAt: number
}

/**
 * Comparison metrics between variants
 */
export interface ABTestComparisonMetrics {
	/** Cost difference (experiment - control) */
	costDelta: number
	/** Cost ratio (experiment / control) */
	costRatio: number
	/** Duration difference (experiment - control) */
	durationDelta: number
	/** Duration ratio (experiment / control) */
	durationRatio: number
	/** Token usage difference */
	tokenDelta: {
		input: number
		output: number
		total: number
	}
	/** Number of file changes difference */
	fileChangesDelta: number
	/** Tool call count difference */
	toolCallsDelta: number
	/** Success comparison */
	bothSucceeded: boolean
	/** Which variant was more efficient (lower cost, faster, fewer errors) */
	moreEfficient?: "control" | "experiment" | "tie"
}

/**
 * Comparison between two variants for Council review
 */
export interface ABTestComparison {
	/** Control variant ID */
	controlId: string
	/** Experiment variant ID */
	experimentId: string
	/** Computed comparison metrics */
	metrics: ABTestComparisonMetrics
	/** Summary for human/LLM review */
	summary: string
	/** Recommendation based on metrics */
	recommendation?: "prefer-control" | "prefer-experiment" | "inconclusive"
	/** Detailed analysis notes */
	analysisNotes?: string[]
}

/**
 * Complete result of an A/B test
 */
export interface ABTestResult {
	/** Test ID */
	testId: string
	/** Reference to original config */
	config: ABTestConfig
	/** Timestamp when test started */
	startedAt: number
	/** Timestamp when test completed */
	completedAt: number
	/** Total duration in milliseconds */
	totalDurationMs: number
	/** Results for each variant */
	variants: ABTestVariantResult[]
	/** Pairwise comparisons (if 2+ variants) */
	comparisons: ABTestComparison[]
	/** Overall status */
	status: "completed" | "partial" | "failed"
	/** Error if test failed */
	error?: string
	/** ID of the winning variant (if determined) */
	winnerId?: string
	/** Path to output artifacts directory */
	outputDir?: string
}

/**
 * State of an A/B test execution
 */
export enum ABTestStatus {
	/** Test is being configured */
	Configuring = "configuring",
	/** Test is queued to run */
	Queued = "queued",
	/** Test is initializing (creating snapshots, etc.) */
	Initializing = "initializing",
	/** Currently running a variant */
	Running = "running",
	/** Rolling back between variants */
	RollingBack = "rolling_back",
	/** Analyzing results */
	Analyzing = "analyzing",
	/** Test completed successfully */
	Completed = "completed",
	/** Test failed */
	Failed = "failed",
	/** Test was cancelled */
	Cancelled = "cancelled",
}

/**
 * Progress update during A/B test execution
 */
export interface ABTestProgress {
	/** Test ID */
	testId: string
	/** Current status */
	status: ABTestStatus
	/** Current variant being executed (0-indexed) */
	currentVariantIndex: number
	/** Total number of variants */
	totalVariants: number
	/** Current variant ID */
	currentVariantId?: string
	/** Progress message */
	message: string
	/** Percentage complete (0-100) */
	percentComplete: number
	/** Timestamp */
	timestamp: number
}

/**
 * Event emitted during A/B test execution
 */
export type ABTestEvent =
	| { type: "progress"; data: ABTestProgress }
	| { type: "variantStarted"; data: { variantId: string; variantIndex: number } }
	| { type: "variantCompleted"; data: ABTestVariantResult }
	| { type: "variantFailed"; data: { variantId: string; error: string } }
	| { type: "rollbackStarted"; data: { checkpointHash: string } }
	| { type: "rollbackCompleted"; data: { checkpointHash: string; durationMs: number } }
	| { type: "testCompleted"; data: ABTestResult }
	| { type: "testFailed"; data: { error: string } }

/**
 * Settings for A/B testing feature
 */
export interface ABTestSettings {
	/** Whether A/B testing is enabled */
	enabled: boolean
	/** Default timeout per variant in milliseconds */
	defaultTimeoutMs: number
	/** Maximum number of variants per test */
	maxVariants: number
	/** Whether to auto-run A/B tests at Level 3 */
	autoRunAtLevel3: boolean
	/** Default variants to test (if not specified) */
	defaultVariants?: ABTestVariantConfig[]
}

/**
 * Default A/B test settings
 */
export const DEFAULT_AB_TEST_SETTINGS: ABTestSettings = {
	enabled: false,
	defaultTimeoutMs: 5 * 60 * 1000, // 5 minutes
	maxVariants: 3,
	autoRunAtLevel3: false,
}

/**
 * Create default token usage object
 */
export function createDefaultTokenUsage(): TokenUsage {
	return {
		totalTokensIn: 0,
		totalTokensOut: 0,
		totalCost: 0,
		contextTokens: 0,
	}
}

/**
 * Create default tool usage object
 */
export function createDefaultToolUsage(): ToolUsage {
	return {}
}

/**
 * Calculate comparison metrics between control and experiment variants
 */
export function calculateComparisonMetrics(
	control: ABTestVariantResult,
	experiment: ABTestVariantResult,
): ABTestComparisonMetrics {
	const costDelta = experiment.totalCost - control.totalCost
	const costRatio = control.totalCost > 0 ? experiment.totalCost / control.totalCost : 0
	const durationDelta = experiment.durationMs - control.durationMs
	const durationRatio = control.durationMs > 0 ? experiment.durationMs / control.durationMs : 0

	const tokenDelta = {
		input: experiment.tokenUsage.totalTokensIn - control.tokenUsage.totalTokensIn,
		output: experiment.tokenUsage.totalTokensOut - control.tokenUsage.totalTokensOut,
		total:
			experiment.tokenUsage.totalTokensIn +
			experiment.tokenUsage.totalTokensOut -
			(control.tokenUsage.totalTokensIn + control.tokenUsage.totalTokensOut),
	}

	const fileChangesDelta = experiment.fileChanges.length - control.fileChanges.length
	const toolCallsDelta = experiment.toolCalls.length - control.toolCalls.length
	const bothSucceeded = control.success && experiment.success

	// Determine which is more efficient
	let moreEfficient: "control" | "experiment" | "tie" | undefined
	if (bothSucceeded) {
		// Both succeeded - compare cost and duration
		const controlScore = control.totalCost + control.durationMs / 1000 // Normalize duration to be comparable
		const experimentScore = experiment.totalCost + experiment.durationMs / 1000

		if (Math.abs(controlScore - experimentScore) < 0.01) {
			moreEfficient = "tie"
		} else if (controlScore < experimentScore) {
			moreEfficient = "control"
		} else {
			moreEfficient = "experiment"
		}
	} else if (control.success && !experiment.success) {
		moreEfficient = "control"
	} else if (!control.success && experiment.success) {
		moreEfficient = "experiment"
	}

	return {
		costDelta,
		costRatio,
		durationDelta,
		durationRatio,
		tokenDelta,
		fileChangesDelta,
		toolCallsDelta,
		bothSucceeded,
		moreEfficient,
	}
}

/**
 * Generate a summary string for a comparison
 */
export function generateComparisonSummary(
	control: ABTestVariantResult,
	experiment: ABTestVariantResult,
	metrics: ABTestComparisonMetrics,
): string {
	const lines: string[] = []

	// Success status
	if (metrics.bothSucceeded) {
		lines.push("Both variants completed successfully.")
	} else if (control.success && !experiment.success) {
		lines.push(`Control succeeded, but experiment failed: ${experiment.error}`)
	} else if (!control.success && experiment.success) {
		lines.push(`Experiment succeeded, but control failed: ${control.error}`)
	} else {
		lines.push(`Both variants failed. Control: ${control.error}, Experiment: ${experiment.error}`)
	}

	// Cost comparison
	if (metrics.costDelta !== 0) {
		const costChange = metrics.costDelta > 0 ? "more expensive" : "cheaper"
		lines.push(
			`Experiment was ${Math.abs(metrics.costDelta).toFixed(4)} USD ${costChange} (${(metrics.costRatio * 100 - 100).toFixed(1)}% change).`,
		)
	}

	// Duration comparison
	if (metrics.durationDelta !== 0) {
		const durationChange = metrics.durationDelta > 0 ? "slower" : "faster"
		lines.push(
			`Experiment was ${Math.abs(metrics.durationDelta / 1000).toFixed(1)}s ${durationChange} (${(metrics.durationRatio * 100 - 100).toFixed(1)}% change).`,
		)
	}

	// Efficiency recommendation
	if (metrics.moreEfficient) {
		if (metrics.moreEfficient === "tie") {
			lines.push("Overall efficiency: Tie - both variants performed similarly.")
		} else {
			lines.push(
				`Overall efficiency: ${metrics.moreEfficient === "control" ? "Control" : "Experiment"} was more efficient.`,
			)
		}
	}

	return lines.join("\n")
}

/**
 * Create a comparison object from two variant results
 */
export function createComparison(control: ABTestVariantResult, experiment: ABTestVariantResult): ABTestComparison {
	const metrics = calculateComparisonMetrics(control, experiment)
	const summary = generateComparisonSummary(control, experiment, metrics)

	let recommendation: ABTestComparison["recommendation"]
	if (metrics.moreEfficient === "control") {
		recommendation = "prefer-control"
	} else if (metrics.moreEfficient === "experiment") {
		recommendation = "prefer-experiment"
	} else {
		recommendation = "inconclusive"
	}

	return {
		controlId: control.variantId,
		experimentId: experiment.variantId,
		metrics,
		summary,
		recommendation,
	}
}

/**
 * Generate a unique test ID
 */
export function generateTestId(): string {
	const timestamp = Date.now().toString(36)
	const random = Math.random().toString(36).substring(2, 8)
	return `ab-${timestamp}-${random}`
}
