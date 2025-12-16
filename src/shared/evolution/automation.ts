/**
 * Evolution Layer Automation
 *
 * This module implements the automation capabilities for the Evolution Layer.
 * It provides configurable automation levels (0-3) with progressive features:
 *
 * - Level 0: Manual (Default) - No automated actions
 * - Level 1: Auto-Trigger - Auto export trace and run Council on failure/high cost
 * - Level 2: Auto-Apply Low Risk - Auto-apply low-risk proposals (docs, mode-map)
 * - Level 3: Full Closed-Loop - Auto-apply all with A/B testing
 *
 * @module
 */

import type { TokenUsage, ToolUsage, HistoryItem } from "@roo-code/types"
import type { ABTestConfig, ABTestResult, ABTestVariantConfig } from "./abTestSchemas"

/**
 * Automation levels for the Evolution Layer
 */
export enum AutomationLevel {
	/** Level 0: Manual - No automated actions */
	Manual = 0,
	/** Level 1: Auto-Trigger - Auto export trace and run Council */
	AutoTrigger = 1,
	/** Level 2: Auto-Apply Low Risk - Auto-apply low-risk proposals */
	AutoApplyLowRisk = 2,
	/** Level 3: Full Closed-Loop - Auto-apply with A/B testing (Future) */
	FullClosedLoop = 3,
}

/**
 * Proposal categories that can be auto-applied
 */
export type AutoApplyCategory = "mode-map" | "docs" | "memory" | "rubric"

/**
 * Configuration for evolution automation
 */
export interface EvolutionAutomationConfig {
	level: AutomationLevel
	triggers: {
		/** Failure rate threshold (0-1) to trigger Council */
		failureRate: number
		/** Cost threshold in USD to trigger Council */
		costThreshold: number
		/** Cooldown in seconds between automated runs */
		cooldown: number
	}
	safety: {
		/** Maximum automated runs per day */
		maxDailyRuns: number
		/** Categories safe to auto-apply */
		autoApplyTypes: AutoApplyCategory[]
	}
}

/**
 * Default automation configuration
 */
export const DEFAULT_AUTOMATION_CONFIG: EvolutionAutomationConfig = {
	level: AutomationLevel.Manual,
	triggers: {
		failureRate: 0.3,
		costThreshold: 100,
		cooldown: 3600, // 1 hour
	},
	safety: {
		maxDailyRuns: 5,
		autoApplyTypes: ["mode-map", "docs"],
	},
}

/**
 * Reasons for triggering automation
 */
export enum TriggerReason {
	None = "none",
	Failure = "failure",
	HighCost = "high_cost",
	FailureRate = "failure_rate",
}

/**
 * Result of trigger evaluation
 */
export interface TriggerEvaluationResult {
	shouldTrigger: boolean
	reason: TriggerReason
	details?: string
}

/**
 * State tracked for rate limiting
 */
export interface AutomationRateLimitState {
	lastRunTimestamp: number | null
	dailyRunCount: number
	dailyRunDate: string | null // YYYY-MM-DD format
	lastTriggerReason: TriggerReason | null
}

/**
 * Default rate limit state
 */
export const DEFAULT_RATE_LIMIT_STATE: AutomationRateLimitState = {
	lastRunTimestamp: null,
	dailyRunCount: 0,
	dailyRunDate: null,
	lastTriggerReason: null,
}

/**
 * Get current date as YYYY-MM-DD string
 */
function getCurrentDateString(now: Date = new Date()): string {
	return now.toISOString().split("T")[0]
}

/**
 * Evaluate whether automation should trigger based on task completion data
 *
 * @param config - Automation configuration
 * @param tokenUsage - Token usage from the completed task
 * @param historyItem - Optional history item with more context
 * @returns Evaluation result with trigger decision and reason
 */
export function evaluateTriggerConditions(
	config: EvolutionAutomationConfig,
	tokenUsage: TokenUsage,
	historyItem?: HistoryItem,
): TriggerEvaluationResult {
	// Level 0 never triggers automatically
	if (config.level === AutomationLevel.Manual) {
		return { shouldTrigger: false, reason: TriggerReason.None }
	}

	// Check for high cost
	if (config.triggers.costThreshold > 0 && tokenUsage.totalCost >= config.triggers.costThreshold) {
		return {
			shouldTrigger: true,
			reason: TriggerReason.HighCost,
			details: `Task cost ($${tokenUsage.totalCost.toFixed(2)}) exceeded threshold ($${config.triggers.costThreshold.toFixed(2)})`,
		}
	}

	// Check for task failure (look for error indicators in history item)
	if (historyItem) {
		// Check if task was marked as failed based on completion status indicators
		const taskTitle = historyItem.task?.toLowerCase() ?? ""
		const hasErrorIndicator =
			taskTitle.includes("failed") || taskTitle.includes("error") || taskTitle.includes("could not complete")

		if (hasErrorIndicator) {
			return {
				shouldTrigger: true,
				reason: TriggerReason.Failure,
				details: "Task appears to have failed or encountered errors",
			}
		}
	}

	return { shouldTrigger: false, reason: TriggerReason.None }
}

/**
 * Check if automation is allowed based on rate limiting
 *
 * @param config - Automation configuration
 * @param state - Current rate limit state
 * @param now - Current timestamp (for testing)
 * @returns Object with allowed flag and optional reason
 */
export function checkRateLimits(
	config: EvolutionAutomationConfig,
	state: AutomationRateLimitState,
	now: Date = new Date(),
): { allowed: boolean; reason?: string } {
	const currentDate = getCurrentDateString(now)
	const currentTimestamp = now.getTime()

	// Reset daily count if it's a new day
	const dailyCount = state.dailyRunDate === currentDate ? state.dailyRunCount : 0

	// Check daily limit
	if (dailyCount >= config.safety.maxDailyRuns) {
		return {
			allowed: false,
			reason: `Daily limit reached (${config.safety.maxDailyRuns} runs per day)`,
		}
	}

	// Check cooldown
	if (state.lastRunTimestamp !== null) {
		const elapsedSeconds = (currentTimestamp - state.lastRunTimestamp) / 1000
		if (elapsedSeconds < config.triggers.cooldown) {
			const remainingSeconds = Math.ceil(config.triggers.cooldown - elapsedSeconds)
			return {
				allowed: false,
				reason: `Cooldown active (${remainingSeconds}s remaining)`,
			}
		}
	}

	return { allowed: true }
}

/**
 * Update rate limit state after a run
 *
 * @param state - Current rate limit state
 * @param triggerReason - The reason for this run
 * @param now - Current timestamp (for testing)
 * @returns Updated rate limit state
 */
export function updateRateLimitState(
	state: AutomationRateLimitState,
	triggerReason: TriggerReason,
	now: Date = new Date(),
): AutomationRateLimitState {
	const currentDate = getCurrentDateString(now)
	const currentTimestamp = now.getTime()

	// Reset daily count if it's a new day
	const dailyCount = state.dailyRunDate === currentDate ? state.dailyRunCount + 1 : 1

	return {
		lastRunTimestamp: currentTimestamp,
		dailyRunCount: dailyCount,
		dailyRunDate: currentDate,
		lastTriggerReason: triggerReason,
	}
}

/**
 * Check if a proposal category is safe to auto-apply
 *
 * @param category - The proposal category
 * @param config - Automation configuration
 * @returns Whether the category can be auto-applied
 */
export function isSafeToAutoApply(category: AutoApplyCategory, config: EvolutionAutomationConfig): boolean {
	// Only Level 2+ can auto-apply
	if (config.level < AutomationLevel.AutoApplyLowRisk) {
		return false
	}

	return config.safety.autoApplyTypes.includes(category)
}

/**
 * Proposal change for auto-apply evaluation
 */
export interface ProposalChange {
	/** Target file path */
	path: string
	/** Type of change */
	changeType: "create" | "modify" | "delete"
	/** Category inferred from path */
	category?: AutoApplyCategory
}

/**
 * Infer category from a file path
 *
 * @param filePath - File path relative to project root
 * @returns Inferred category or undefined if not categorizable
 */
export function inferCategoryFromPath(filePath: string): AutoApplyCategory | undefined {
	const normalizedPath = filePath.replace(/\\/g, "/").toLowerCase()

	// Mode map files
	if (normalizedPath.includes("mode-map") || normalizedPath.includes("modemap")) {
		return "mode-map"
	}

	// Documentation
	if (normalizedPath.startsWith("docs/") || normalizedPath.endsWith(".md")) {
		return "docs"
	}

	// Memory files
	if (normalizedPath.includes(".kilocode/memory")) {
		return "memory"
	}

	// Rubric files
	if (normalizedPath.includes(".kilocode/rubrics") || normalizedPath.includes("rubric")) {
		return "rubric"
	}

	return undefined
}

/**
 * Evaluate whether a set of changes can be auto-applied
 *
 * @param changes - Array of proposal changes
 * @param config - Automation configuration
 * @returns Evaluation result
 */
export function evaluateAutoApply(
	changes: ProposalChange[],
	config: EvolutionAutomationConfig,
): {
	canAutoApply: boolean
	reason: string
	safeChanges: ProposalChange[]
	unsafeChanges: ProposalChange[]
} {
	if (config.level < AutomationLevel.AutoApplyLowRisk) {
		return {
			canAutoApply: false,
			reason: "Automation level does not support auto-apply",
			safeChanges: [],
			unsafeChanges: changes,
		}
	}

	const safeChanges: ProposalChange[] = []
	const unsafeChanges: ProposalChange[] = []

	for (const change of changes) {
		const category = change.category ?? inferCategoryFromPath(change.path)

		if (category && isSafeToAutoApply(category, config)) {
			safeChanges.push({ ...change, category })
		} else {
			unsafeChanges.push(change)
		}
	}

	const canAutoApply = unsafeChanges.length === 0 && safeChanges.length > 0

	let reason: string
	if (canAutoApply) {
		reason = `All ${safeChanges.length} change(s) are safe to auto-apply`
	} else if (unsafeChanges.length > 0) {
		reason = `${unsafeChanges.length} change(s) require manual approval`
	} else {
		reason = "No changes to apply"
	}

	return { canAutoApply, reason, safeChanges, unsafeChanges }
}

/**
 * Critical paths that always require human approval
 */
export const ALWAYS_REQUIRE_APPROVAL_PATTERNS = [
	/\.kilocode\/evolution\/council\.yaml$/i,
	/\.kilocode\/evolution\/config\.yaml$/i,
	/\.kilocode\/rules\/rules\.md$/i,
	/\.kilocode\/rules\/.*\.md$/i,
	/package\.json$/i,
	/pnpm-lock\.yaml$/i,
	/\.github\//i,
]

/**
 * Check if a path requires human approval regardless of category
 *
 * @param filePath - File path to check
 * @returns Whether the path requires manual approval
 */
export function requiresHumanApproval(filePath: string): boolean {
	const normalizedPath = filePath.replace(/\\/g, "/")
	return ALWAYS_REQUIRE_APPROVAL_PATTERNS.some((pattern) => pattern.test(normalizedPath))
}

/**
 * Automation orchestration result
 */
export interface AutomationOrchestrationResult {
	triggered: boolean
	reason: TriggerReason
	details?: string
	rateLimited: boolean
	rateLimitReason?: string
	traceExported: boolean
	tracePath?: string
	councilRan: boolean
	reportsDir?: string
	proposalGenerated: boolean
	proposalDir?: string
	autoApplied: boolean
	autoApplyResult?: {
		applied: boolean
		appliedChanges: ProposalChange[]
		skippedChanges: ProposalChange[]
	}
	error?: string
}

/**
 * Create an initial/failed orchestration result
 */
export function createOrchestrationResult(
	partial: Partial<AutomationOrchestrationResult> = {},
): AutomationOrchestrationResult {
	return {
		triggered: false,
		reason: TriggerReason.None,
		rateLimited: false,
		traceExported: false,
		councilRan: false,
		proposalGenerated: false,
		autoApplied: false,
		...partial,
	}
}

/**
 * Backup entry for rollback capability
 */
export interface BackupEntry {
	/** Original file path */
	path: string
	/** Original content (undefined if file didn't exist) */
	content: string | undefined
	/** Timestamp of backup */
	timestamp: number
}

/**
 * Create a backup before applying changes
 * This should be implemented by the caller using file system access
 */
export type BackupFunction = (paths: string[]) => Promise<BackupEntry[]>

/**
 * Restore from backup on failure
 * This should be implemented by the caller using file system access
 */
export type RestoreFunction = (backups: BackupEntry[]) => Promise<void>

/**
 * Log entry for audit trail
 */
export interface AutomationLogEntry {
	timestamp: string
	event: string
	phase: "start" | "end" | "error"
	data?: Record<string, unknown>
}

/**
 * Format a log entry for output
 *
 * @param entry - Log entry to format
 * @returns Formatted log string
 */
export function formatLogEntry(entry: AutomationLogEntry): string {
	return JSON.stringify(entry)
}

/**
 * Create a log entry
 *
 * @param event - Event name
 * @param phase - Event phase
 * @param data - Optional data
 * @returns Log entry object
 */
export function createLogEntry(
	event: string,
	phase: "start" | "end" | "error",
	data?: Record<string, unknown>,
): AutomationLogEntry {
	return {
		timestamp: new Date().toISOString(),
		event,
		phase,
		data,
	}
}

// ============================================================================
// Level 3: A/B Testing Support
// ============================================================================

/**
 * Configuration for Level 3 A/B testing automation
 */
export interface ABTestAutomationConfig {
	/** Whether A/B testing is enabled at Level 3 */
	enabled: boolean
	/** Default timeout for each variant run (ms) */
	defaultTimeoutMs: number
	/** Maximum number of variants to test */
	maxVariants: number
	/** Whether to enable checkpointing for rollback */
	enableCheckpoints: boolean
	/** Default variants to use when not specified */
	defaultVariants: ABTestVariantConfig[]
}

/**
 * Default A/B testing automation configuration
 */
export const DEFAULT_AB_TEST_AUTOMATION_CONFIG: ABTestAutomationConfig = {
	enabled: false,
	defaultTimeoutMs: 300000, // 5 minutes
	maxVariants: 4,
	enableCheckpoints: true,
	defaultVariants: [
		{
			id: "control",
			name: "Control (Code Mode)",
			description: "Standard code mode execution",
			modeSlug: "code",
		},
		{
			id: "architect",
			name: "Experiment (Architect Mode)",
			description: "Architect mode for planning-first approach",
			modeSlug: "architect",
		},
	],
}

/**
 * Trigger conditions specific to A/B testing
 */
export interface ABTestTriggerConditions {
	/** Run A/B test when task cost exceeds this threshold */
	costThreshold: number
	/** Run A/B test when task is detected as complex (e.g., multi-file changes) */
	onComplexTask: boolean
	/** Run A/B test on a random sample of tasks (0-1) */
	sampleRate: number
}

/**
 * Default A/B test trigger conditions
 */
export const DEFAULT_AB_TEST_TRIGGERS: ABTestTriggerConditions = {
	costThreshold: 50, // Lower threshold since we want to test before issues occur
	onComplexTask: true,
	sampleRate: 0.1, // 10% of tasks
}

/**
 * Evaluate whether an A/B test should be triggered for a task
 *
 * @param config - Automation configuration
 * @param abTestConfig - A/B test specific configuration
 * @param triggers - A/B test trigger conditions
 * @param tokenUsage - Token usage from the triggering task (if evaluating retrospectively)
 * @param historyItem - History item with task details
 * @returns Whether to trigger an A/B test
 */
export function shouldTriggerABTest(
	config: EvolutionAutomationConfig,
	abTestConfig: ABTestAutomationConfig,
	triggers: ABTestTriggerConditions,
	tokenUsage?: TokenUsage,
	historyItem?: HistoryItem,
): { shouldTrigger: boolean; reason: string } {
	// Only Level 3 can run A/B tests automatically
	if (config.level < AutomationLevel.FullClosedLoop) {
		return { shouldTrigger: false, reason: "Automation level is below Level 3" }
	}

	// A/B testing must be enabled
	if (!abTestConfig.enabled) {
		return { shouldTrigger: false, reason: "A/B testing is disabled" }
	}

	// Check cost threshold
	if (tokenUsage && triggers.costThreshold > 0 && tokenUsage.totalCost >= triggers.costThreshold) {
		return {
			shouldTrigger: true,
			reason: `Task cost ($${tokenUsage.totalCost.toFixed(2)}) exceeded A/B test threshold ($${triggers.costThreshold.toFixed(2)})`,
		}
	}

	// Check for complex task indicators
	if (triggers.onComplexTask && historyItem) {
		const taskDescription = historyItem.task?.toLowerCase() ?? ""
		const complexIndicators = ["refactor", "redesign", "implement", "create", "build", "multi-file", "architecture"]
		const isComplex = complexIndicators.some((indicator) => taskDescription.includes(indicator))

		if (isComplex) {
			return {
				shouldTrigger: true,
				reason: "Task detected as complex",
			}
		}
	}

	// Random sampling
	if (triggers.sampleRate > 0 && Math.random() < triggers.sampleRate) {
		return {
			shouldTrigger: true,
			reason: `Random sample (rate: ${(triggers.sampleRate * 100).toFixed(0)}%)`,
		}
	}

	return { shouldTrigger: false, reason: "No trigger conditions met" }
}

/**
 * Create an A/B test configuration from automation settings
 *
 * @param taskPrompt - The task prompt to test
 * @param abTestConfig - A/B test automation configuration
 * @param workspacePath - Workspace path for the test
 * @returns A/B test configuration
 */
export function createABTestConfigFromAutomation(
	taskPrompt: string,
	abTestConfig: ABTestAutomationConfig,
	workspacePath: string,
): Omit<ABTestConfig, "testId" | "createdAt"> {
	return {
		taskPrompt,
		variants: abTestConfig.defaultVariants.slice(0, abTestConfig.maxVariants),
		timeoutMs: abTestConfig.defaultTimeoutMs,
		workspacePath,
		enableCheckpoints: abTestConfig.enableCheckpoints,
	}
}

/**
 * Result of A/B test evaluation for automation
 */
export interface ABTestEvaluationResult {
	/** Whether the test completed successfully */
	success: boolean
	/** The winning variant ID (or undefined if inconclusive) */
	winnerId?: string
	/** Recommendation for which configuration to use */
	recommendation: "use_control" | "use_experiment" | "inconclusive" | "error"
	/** Human-readable explanation */
	explanation: string
	/** The full A/B test result */
	testResult?: ABTestResult
}

/**
 * Evaluate A/B test results to determine the winning variant
 *
 * This is a simple heuristic-based evaluation. In production,
 * this would be enhanced with LLM Council review.
 *
 * @param result - The A/B test result
 * @returns Evaluation with recommendation
 */
export function evaluateABTestResult(result: ABTestResult): ABTestEvaluationResult {
	if (result.status === "failed") {
		return {
			success: false,
			recommendation: "error",
			explanation: `A/B test failed: ${result.error ?? "Unknown error"}`,
			testResult: result,
		}
	}

	const successfulVariants = result.variants.filter((v) => v.success)

	if (successfulVariants.length === 0) {
		return {
			success: false,
			recommendation: "error",
			explanation: "All variants failed",
			testResult: result,
		}
	}

	if (successfulVariants.length === 1) {
		return {
			success: true,
			winnerId: successfulVariants[0].variantId,
			recommendation: successfulVariants[0].variantId === "control" ? "use_control" : "use_experiment",
			explanation: `Only ${successfulVariants[0].variantId} succeeded`,
			testResult: result,
		}
	}

	// Compare metrics for successful variants
	// Prefer lower cost and faster completion
	const controlVariant = successfulVariants.find((v) => v.variantId === "control")
	const experimentVariant = successfulVariants.find((v) => v.variantId !== "control")

	if (!controlVariant || !experimentVariant) {
		return {
			success: true,
			winnerId: successfulVariants[0].variantId,
			recommendation: "inconclusive",
			explanation: "Could not compare control vs experiment",
			testResult: result,
		}
	}

	const controlCost = controlVariant.tokenUsage?.totalCost ?? Infinity
	const experimentCost = experimentVariant.tokenUsage?.totalCost ?? Infinity
	const controlDuration = controlVariant.durationMs ?? Infinity
	const experimentDuration = experimentVariant.durationMs ?? Infinity

	// Simple scoring: lower cost and lower duration are better
	// Weight cost more heavily (60%) vs duration (40%)
	const controlScore = controlCost * 0.6 + (controlDuration / 1000) * 0.4
	const experimentScore = experimentCost * 0.6 + (experimentDuration / 1000) * 0.4

	// Require at least 10% improvement to recommend experiment
	const improvementThreshold = 0.9 // 10% better

	if (experimentScore < controlScore * improvementThreshold) {
		return {
			success: true,
			winnerId: experimentVariant.variantId,
			recommendation: "use_experiment",
			explanation: `Experiment variant is ${((1 - experimentScore / controlScore) * 100).toFixed(1)}% more efficient`,
			testResult: result,
		}
	} else if (controlScore < experimentScore * improvementThreshold) {
		return {
			success: true,
			winnerId: "control",
			recommendation: "use_control",
			explanation: `Control variant is ${((1 - controlScore / experimentScore) * 100).toFixed(1)}% more efficient`,
			testResult: result,
		}
	} else {
		return {
			success: true,
			recommendation: "inconclusive",
			explanation: "No significant difference between variants",
			testResult: result,
		}
	}
}

/**
 * Extended automation configuration including Level 3 A/B testing
 */
export interface EvolutionAutomationConfigWithABTest extends EvolutionAutomationConfig {
	abTest?: ABTestAutomationConfig
	abTestTriggers?: ABTestTriggerConditions
}

/**
 * Default automation configuration with A/B testing
 */
export const DEFAULT_AUTOMATION_CONFIG_WITH_AB_TEST: EvolutionAutomationConfigWithABTest = {
	...DEFAULT_AUTOMATION_CONFIG,
	abTest: DEFAULT_AB_TEST_AUTOMATION_CONFIG,
	abTestTriggers: DEFAULT_AB_TEST_TRIGGERS,
}
