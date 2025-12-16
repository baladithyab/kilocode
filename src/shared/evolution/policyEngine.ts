/**
 * Evolution Layer Policy Engine
 *
 * This module implements dynamic task routing based on policy rules.
 * It determines the optimal mode for a given task based on:
 * - Task description/patterns
 * - Historical performance metrics
 * - Cost constraints
 * - Model availability
 *
 * The Policy Engine supports evolution through LLM Council feedback.
 *
 * @module
 */

import { readFile } from "node:fs/promises"
import * as path from "node:path"

import YAML from "yaml"

import type { CouncilConfig } from "@roo-code/types"

import { fileExists } from "./fs"

/**
 * A policy rule that defines when to route to a specific mode
 */
export interface PolicyRule {
	/** Unique identifier for the rule */
	id: string
	/** Human-readable name */
	name: string
	/** Description of what this rule does */
	description?: string
	/** Priority (higher = more important, evaluated first) */
	priority: number
	/** Conditions that must be met for this rule to apply */
	conditions: PolicyCondition[]
	/** The mode to route to when conditions are met */
	targetMode: string
	/** Optional profile override for this mode */
	profileOverride?: string
	/** Whether this rule is enabled */
	enabled: boolean
	/** Metadata for tracking rule effectiveness */
	metadata?: PolicyRuleMetadata
}

/**
 * A condition that can be evaluated against a task
 */
export interface PolicyCondition {
	/** Type of condition */
	type: PolicyConditionType
	/** Operator for comparison */
	operator: PolicyOperator
	/** Value to compare against */
	value: string | number | string[]
	/** Whether to negate the condition */
	negate?: boolean
}

/**
 * Types of policy conditions
 */
export type PolicyConditionType =
	/** Match against task description */
	| "task-pattern"
	/** Match against file extensions in scope */
	| "file-extension"
	/** Match against estimated cost */
	| "cost-estimate"
	/** Match against task complexity score */
	| "complexity"
	/** Match against time of day */
	| "time-of-day"
	/** Match against specific keywords */
	| "keywords"
	/** Match against previous task outcomes */
	| "history-pattern"
	/** Custom condition for extensibility */
	| "custom"

/**
 * Operators for policy conditions
 */
export type PolicyOperator =
	| "equals"
	| "not-equals"
	| "contains"
	| "not-contains"
	| "matches" // regex
	| "greater-than"
	| "less-than"
	| "in" // value is in array
	| "not-in"

/**
 * Metadata for tracking rule effectiveness
 */
export interface PolicyRuleMetadata {
	/** Number of times this rule was triggered */
	triggerCount?: number
	/** Success rate when this rule was applied (0-1) */
	successRate?: number
	/** Average cost when this rule was applied */
	averageCost?: number
	/** Last time this rule was triggered */
	lastTriggeredAt?: string
	/** Created timestamp */
	createdAt?: string
	/** Last updated timestamp */
	updatedAt?: string
	/** Source of this rule (manual, council, generated) */
	source?: "manual" | "council" | "generated"
}

/**
 * Context for evaluating policies
 */
export interface PolicyEvaluationContext {
	/** The task description/prompt */
	taskDescription: string
	/** File paths involved in the task (if known) */
	filePaths?: string[]
	/** Estimated cost for the task */
	estimatedCost?: number
	/** Complexity score (0-100) */
	complexityScore?: number
	/** Current time */
	timestamp?: Date
	/** Historical context */
	history?: TaskHistoryContext
	/** Additional custom context */
	custom?: Record<string, unknown>
}

/**
 * Historical context for policy evaluation
 */
export interface TaskHistoryContext {
	/** Recent task outcomes for similar patterns */
	recentOutcomes?: TaskOutcome[]
	/** Mode performance stats */
	modeStats?: Record<string, ModePerformanceStats>
}

/**
 * A task outcome for history tracking
 */
export interface TaskOutcome {
	/** Mode used */
	mode: string
	/** Whether task succeeded */
	success: boolean
	/** Cost incurred */
	cost: number
	/** Duration in ms */
	durationMs: number
	/** Task pattern/type */
	pattern?: string
}

/**
 * Performance statistics for a mode
 */
export interface ModePerformanceStats {
	/** Total tasks executed */
	totalTasks: number
	/** Success rate (0-1) */
	successRate: number
	/** Average cost per task */
	averageCost: number
	/** Average duration in ms */
	averageDurationMs: number
}

/**
 * Result of policy evaluation
 */
export interface PolicyEvaluationResult {
	/** The recommended mode */
	recommendedMode: string
	/** Confidence in the recommendation (0-1) */
	confidence: number
	/** The rule that triggered this recommendation (if any) */
	matchedRule?: PolicyRule
	/** Fallback mode if recommended mode is unavailable */
	fallbackMode?: string
	/** Profile override if specified */
	profileOverride?: string
	/** Explanation of the decision */
	explanation: string
	/** Alternative modes considered */
	alternatives?: ModeAlternative[]
}

/**
 * An alternative mode that was considered
 */
export interface ModeAlternative {
	/** Mode slug */
	mode: string
	/** Why it wasn't selected */
	reason: string
	/** Score if evaluated */
	score?: number
}

/**
 * Policy engine configuration
 */
export interface PolicyEngineConfig {
	/** Policy rules */
	rules: PolicyRule[]
	/** Default mode when no rules match */
	defaultMode: string
	/** Default profile for modes */
	defaultProfile?: string
	/** Whether to use historical data for scoring */
	useHistoricalScoring: boolean
	/** Weight for historical success rate (0-1) */
	historyWeight: number
	/** Weight for cost optimization (0-1) */
	costWeight: number
}

/**
 * Default policy engine configuration
 */
export const DEFAULT_POLICY_ENGINE_CONFIG: PolicyEngineConfig = {
	rules: [],
	defaultMode: "code",
	defaultProfile: "default",
	useHistoricalScoring: true,
	historyWeight: 0.3,
	costWeight: 0.2,
}

/**
 * Built-in policy rules for common patterns
 */
export const BUILTIN_POLICY_RULES: PolicyRule[] = [
	{
		id: "architecture-tasks",
		name: "Architecture & Design Tasks",
		description: "Route architecture and design tasks to architect mode",
		priority: 100,
		conditions: [
			{
				type: "task-pattern",
				operator: "matches",
				value: "(architect|design|plan|structure|organize|refactor.*architecture)",
			},
		],
		targetMode: "architect",
		enabled: true,
		metadata: {
			source: "manual",
			createdAt: new Date().toISOString(),
		},
	},
	{
		id: "debugging-tasks",
		name: "Debugging Tasks",
		description: "Route debugging and troubleshooting to debug mode",
		priority: 90,
		conditions: [
			{
				type: "task-pattern",
				operator: "matches",
				value: "(debug|fix|error|bug|issue|troubleshoot|diagnose)",
			},
		],
		targetMode: "debug",
		enabled: true,
		metadata: {
			source: "manual",
			createdAt: new Date().toISOString(),
		},
	},
	{
		id: "test-writing",
		name: "Test Writing Tasks",
		description: "Route test creation to test mode",
		priority: 85,
		conditions: [
			{
				type: "task-pattern",
				operator: "matches",
				value: "(write test|add test|create test|test coverage|unit test|integration test)",
			},
		],
		targetMode: "test",
		enabled: true,
		metadata: {
			source: "manual",
			createdAt: new Date().toISOString(),
		},
	},
	{
		id: "documentation-tasks",
		name: "Documentation Tasks",
		description: "Route documentation tasks to docs-specialist mode",
		priority: 80,
		conditions: [
			{
				type: "task-pattern",
				operator: "matches",
				value: "(document|documentation|readme|docs|jsdoc|comments|explain)",
			},
		],
		targetMode: "docs-specialist",
		enabled: true,
		metadata: {
			source: "manual",
			createdAt: new Date().toISOString(),
		},
	},
	{
		id: "high-cost-tasks",
		name: "High Cost Tasks",
		description: "Route potentially expensive tasks to architect for planning first",
		priority: 75,
		conditions: [
			{
				type: "cost-estimate",
				operator: "greater-than",
				value: 50,
			},
		],
		targetMode: "architect",
		enabled: true,
		metadata: {
			source: "manual",
			createdAt: new Date().toISOString(),
		},
	},
	{
		id: "code-review",
		name: "Code Review Tasks",
		description: "Route code review requests to code-reviewer mode",
		priority: 70,
		conditions: [
			{
				type: "task-pattern",
				operator: "matches",
				value: "(review|code review|pr review|check.*code|analyze.*code)",
			},
		],
		targetMode: "code-reviewer",
		enabled: true,
		metadata: {
			source: "manual",
			createdAt: new Date().toISOString(),
		},
	},
]

/**
 * Path to policy configuration file
 */
export const DEFAULT_POLICY_PATH = path.join(".kilocode", "evolution", "policy.yaml")

/**
 * Load policy configuration from file
 *
 * @param projectRoot - Project root directory
 * @param policyPath - Path to policy file (relative to project root)
 * @returns Policy engine configuration
 */
export async function loadPolicyConfig(
	projectRoot: string,
	policyPath: string = DEFAULT_POLICY_PATH,
): Promise<PolicyEngineConfig> {
	const absPath = path.resolve(projectRoot, policyPath)

	if (!(await fileExists(absPath))) {
		return {
			...DEFAULT_POLICY_ENGINE_CONFIG,
			rules: [...BUILTIN_POLICY_RULES],
		}
	}

	try {
		const content = await readFile(absPath, "utf8")
		const parsed = YAML.parse(content)

		if (!parsed || typeof parsed !== "object") {
			throw new Error("Invalid policy configuration format")
		}

		return {
			rules: Array.isArray(parsed.rules) ? parsed.rules : BUILTIN_POLICY_RULES,
			defaultMode: parsed.defaultMode ?? DEFAULT_POLICY_ENGINE_CONFIG.defaultMode,
			defaultProfile: parsed.defaultProfile ?? DEFAULT_POLICY_ENGINE_CONFIG.defaultProfile,
			useHistoricalScoring: parsed.useHistoricalScoring ?? DEFAULT_POLICY_ENGINE_CONFIG.useHistoricalScoring,
			historyWeight: parsed.historyWeight ?? DEFAULT_POLICY_ENGINE_CONFIG.historyWeight,
			costWeight: parsed.costWeight ?? DEFAULT_POLICY_ENGINE_CONFIG.costWeight,
		}
	} catch (error) {
		// Return defaults with built-in rules on error
		return {
			...DEFAULT_POLICY_ENGINE_CONFIG,
			rules: [...BUILTIN_POLICY_RULES],
		}
	}
}

/**
 * Evaluate a single policy condition
 *
 * @param condition - The condition to evaluate
 * @param context - Evaluation context
 * @returns Whether the condition is met
 */
export function evaluateCondition(condition: PolicyCondition, context: PolicyEvaluationContext): boolean {
	let result = false

	switch (condition.type) {
		case "task-pattern":
			result = evaluateTaskPattern(condition, context.taskDescription)
			break
		case "file-extension":
			result = evaluateFileExtension(condition, context.filePaths ?? [])
			break
		case "cost-estimate":
			result = evaluateCostEstimate(condition, context.estimatedCost ?? 0)
			break
		case "complexity":
			result = evaluateComplexity(condition, context.complexityScore ?? 50)
			break
		case "keywords":
			result = evaluateKeywords(condition, context.taskDescription)
			break
		case "time-of-day":
			result = evaluateTimeOfDay(condition, context.timestamp ?? new Date())
			break
		case "history-pattern":
			result = evaluateHistoryPattern(condition, context.history)
			break
		case "custom":
			result = evaluateCustomCondition(condition, context)
			break
		default:
			result = false
	}

	return condition.negate ? !result : result
}

/**
 * Evaluate task pattern condition
 */
function evaluateTaskPattern(condition: PolicyCondition, taskDescription: string): boolean {
	const normalizedTask = taskDescription.toLowerCase()
	const value = condition.value as string

	switch (condition.operator) {
		case "equals":
			return normalizedTask === value.toLowerCase()
		case "not-equals":
			return normalizedTask !== value.toLowerCase()
		case "contains":
			return normalizedTask.includes(value.toLowerCase())
		case "not-contains":
			return !normalizedTask.includes(value.toLowerCase())
		case "matches":
			try {
				const regex = new RegExp(value, "i")
				return regex.test(normalizedTask)
			} catch {
				return false
			}
		default:
			return false
	}
}

/**
 * Evaluate file extension condition
 */
function evaluateFileExtension(condition: PolicyCondition, filePaths: string[]): boolean {
	const extensions = filePaths.map((p) => path.extname(p).toLowerCase())
	const targetExtensions = Array.isArray(condition.value) ? condition.value : [condition.value as string]

	switch (condition.operator) {
		case "in":
			return extensions.some((ext) => targetExtensions.includes(ext))
		case "not-in":
			return !extensions.some((ext) => targetExtensions.includes(ext))
		case "contains":
			return extensions.some((ext) => ext.includes(condition.value as string))
		default:
			return false
	}
}

/**
 * Evaluate cost estimate condition
 */
function evaluateCostEstimate(condition: PolicyCondition, estimatedCost: number): boolean {
	const targetValue = condition.value as number

	switch (condition.operator) {
		case "equals":
			return estimatedCost === targetValue
		case "not-equals":
			return estimatedCost !== targetValue
		case "greater-than":
			return estimatedCost > targetValue
		case "less-than":
			return estimatedCost < targetValue
		default:
			return false
	}
}

/**
 * Evaluate complexity condition
 */
function evaluateComplexity(condition: PolicyCondition, complexityScore: number): boolean {
	const targetValue = condition.value as number

	switch (condition.operator) {
		case "equals":
			return complexityScore === targetValue
		case "greater-than":
			return complexityScore > targetValue
		case "less-than":
			return complexityScore < targetValue
		default:
			return false
	}
}

/**
 * Evaluate keywords condition
 */
function evaluateKeywords(condition: PolicyCondition, taskDescription: string): boolean {
	const normalizedTask = taskDescription.toLowerCase()
	const keywords = Array.isArray(condition.value) ? condition.value : [condition.value as string]

	switch (condition.operator) {
		case "contains":
			return keywords.some((kw) => normalizedTask.includes(kw.toLowerCase()))
		case "not-contains":
			return !keywords.some((kw) => normalizedTask.includes(kw.toLowerCase()))
		case "in":
			// All keywords must be present
			return keywords.every((kw) => normalizedTask.includes(kw.toLowerCase()))
		default:
			return false
	}
}

/**
 * Evaluate time of day condition
 */
function evaluateTimeOfDay(condition: PolicyCondition, timestamp: Date): boolean {
	const hour = timestamp.getHours()
	const targetHour = condition.value as number

	switch (condition.operator) {
		case "equals":
			return hour === targetHour
		case "greater-than":
			return hour > targetHour
		case "less-than":
			return hour < targetHour
		default:
			return false
	}
}

/**
 * Evaluate history pattern condition
 */
function evaluateHistoryPattern(condition: PolicyCondition, history?: TaskHistoryContext): boolean {
	if (!history || !history.recentOutcomes || history.recentOutcomes.length === 0) {
		return false
	}

	// Look for patterns in recent outcomes
	const value = condition.value as string

	switch (condition.operator) {
		case "contains": {
			// Check if any recent task had this pattern
			return history.recentOutcomes.some((o) => o.pattern?.toLowerCase().includes(value.toLowerCase()))
		}
		case "matches": {
			try {
				const regex = new RegExp(value, "i")
				return history.recentOutcomes.some((o) => o.pattern && regex.test(o.pattern))
			} catch {
				return false
			}
		}
		default:
			return false
	}
}

/**
 * Evaluate custom condition
 */
function evaluateCustomCondition(condition: PolicyCondition, context: PolicyEvaluationContext): boolean {
	// Custom conditions can check context.custom for specific values
	if (!context.custom) {
		return false
	}

	const key = condition.value as string
	const customValue = context.custom[key]

	switch (condition.operator) {
		case "equals":
			return customValue === true
		case "not-equals":
			return customValue !== true
		default:
			return false
	}
}

/**
 * Evaluate a policy rule against context
 *
 * @param rule - The rule to evaluate
 * @param context - Evaluation context
 * @returns Whether all conditions in the rule are met
 */
export function evaluateRule(rule: PolicyRule, context: PolicyEvaluationContext): boolean {
	if (!rule.enabled) {
		return false
	}

	// All conditions must be met (AND logic)
	return rule.conditions.every((condition) => evaluateCondition(condition, context))
}

/**
 * Calculate a score for a mode based on historical data
 *
 * @param mode - Mode to score
 * @param context - Evaluation context
 * @param config - Policy engine config
 * @returns Score (0-100)
 */
export function calculateModeScore(mode: string, context: PolicyEvaluationContext, config: PolicyEngineConfig): number {
	if (!config.useHistoricalScoring || !context.history?.modeStats) {
		return 50 // Neutral score
	}

	const stats = context.history.modeStats[mode]
	if (!stats) {
		return 50
	}

	// Calculate weighted score based on success rate and cost
	const successScore = stats.successRate * 100 * config.historyWeight
	const costScore = (1 - Math.min(stats.averageCost / 100, 1)) * 100 * config.costWeight
	const baseScore = 50 * (1 - config.historyWeight - config.costWeight)

	return Math.round(baseScore + successScore + costScore)
}

/**
 * Evaluate policies and determine optimal mode
 *
 * @param context - Evaluation context
 * @param config - Policy engine configuration
 * @returns Policy evaluation result
 */
export function evaluatePolicies(context: PolicyEvaluationContext, config: PolicyEngineConfig): PolicyEvaluationResult {
	// Sort rules by priority (highest first)
	const sortedRules = [...config.rules].sort((a, b) => b.priority - a.priority)

	// Find the first matching rule
	for (const rule of sortedRules) {
		if (evaluateRule(rule, context)) {
			const confidence = calculateModeScore(rule.targetMode, context, config) / 100

			return {
				recommendedMode: rule.targetMode,
				confidence,
				matchedRule: rule,
				fallbackMode: config.defaultMode,
				profileOverride: rule.profileOverride,
				explanation: `Matched rule "${rule.name}": ${rule.description ?? "No description"}`,
				alternatives: findAlternatives(rule.targetMode, sortedRules, context, config),
			}
		}
	}

	// No rule matched, return default
	return {
		recommendedMode: config.defaultMode,
		confidence: 0.5,
		fallbackMode: config.defaultMode,
		profileOverride: config.defaultProfile,
		explanation: "No policy rules matched; using default mode",
		alternatives: [],
	}
}

/**
 * Find alternative modes that were considered
 */
function findAlternatives(
	selectedMode: string,
	rules: PolicyRule[],
	context: PolicyEvaluationContext,
	config: PolicyEngineConfig,
): ModeAlternative[] {
	const alternatives: ModeAlternative[] = []
	const seenModes = new Set<string>([selectedMode])

	for (const rule of rules) {
		if (seenModes.has(rule.targetMode)) {
			continue
		}

		seenModes.add(rule.targetMode)
		const score = calculateModeScore(rule.targetMode, context, config)

		alternatives.push({
			mode: rule.targetMode,
			reason: rule.enabled ? `Conditions not met for "${rule.name}"` : `Rule "${rule.name}" is disabled`,
			score,
		})

		if (alternatives.length >= 3) {
			break
		}
	}

	return alternatives
}

/**
 * Create a policy engine instance with the given configuration
 */
export class PolicyEngine {
	private config: PolicyEngineConfig

	constructor(config: PolicyEngineConfig = DEFAULT_POLICY_ENGINE_CONFIG) {
		this.config = {
			...config,
			rules: [...(config.rules ?? BUILTIN_POLICY_RULES)],
		}
	}

	/**
	 * Evaluate policies for a task
	 */
	evaluate(context: PolicyEvaluationContext): PolicyEvaluationResult {
		return evaluatePolicies(context, this.config)
	}

	/**
	 * Add a new rule
	 */
	addRule(rule: PolicyRule): void {
		this.config.rules.push(rule)
	}

	/**
	 * Remove a rule by ID
	 */
	removeRule(ruleId: string): boolean {
		const index = this.config.rules.findIndex((r) => r.id === ruleId)
		if (index === -1) {
			return false
		}
		this.config.rules.splice(index, 1)
		return true
	}

	/**
	 * Update a rule
	 */
	updateRule(ruleId: string, updates: Partial<PolicyRule>): boolean {
		const rule = this.config.rules.find((r) => r.id === ruleId)
		if (!rule) {
			return false
		}
		Object.assign(rule, updates)
		return true
	}

	/**
	 * Get all rules
	 */
	getRules(): PolicyRule[] {
		return [...this.config.rules]
	}

	/**
	 * Get configuration
	 */
	getConfig(): PolicyEngineConfig {
		return { ...this.config }
	}

	/**
	 * Update configuration
	 */
	updateConfig(updates: Partial<PolicyEngineConfig>): void {
		this.config = {
			...this.config,
			...updates,
		}
	}

	/**
	 * Record a rule trigger for metrics
	 */
	recordTrigger(ruleId: string, success: boolean, cost: number): void {
		const rule = this.config.rules.find((r) => r.id === ruleId)
		if (!rule) {
			return
		}

		if (!rule.metadata) {
			rule.metadata = {}
		}

		const meta = rule.metadata
		meta.triggerCount = (meta.triggerCount ?? 0) + 1
		meta.lastTriggeredAt = new Date().toISOString()

		// Update success rate (rolling average)
		const prevCount = meta.triggerCount - 1
		const prevRate = meta.successRate ?? 0.5
		meta.successRate = (prevRate * prevCount + (success ? 1 : 0)) / meta.triggerCount

		// Update average cost (rolling average)
		const prevCost = meta.averageCost ?? 0
		meta.averageCost = (prevCost * prevCount + cost) / meta.triggerCount

		meta.updatedAt = new Date().toISOString()
	}
}

/**
 * Create a policy engine configured from council.yaml
 *
 * This provides a way to integrate policy rules with the existing council configuration
 *
 * @param councilConfig - Council configuration
 * @returns Policy engine
 */
export function createPolicyEngineFromCouncil(councilConfig: CouncilConfig): PolicyEngine {
	// Council config doesn't directly contain policy rules, but we can derive some
	// based on the roles defined
	const rules: PolicyRule[] = [...BUILTIN_POLICY_RULES]

	// Add rules for each council role that maps to a mode
	const roleToModeMap: Record<string, string> = {
		governance: "context-manager",
		quality: "code-reviewer",
	}

	for (const [role, roleConfig] of Object.entries(councilConfig.roles)) {
		const targetMode = roleToModeMap[role]
		if (targetMode) {
			rules.push({
				id: `council-${role}`,
				name: `Council: ${role}`,
				description: `Route ${role}-related tasks based on council configuration`,
				priority: 60, // Lower than built-in rules
				conditions: [
					{
						type: "task-pattern",
						operator: "contains",
						value: role,
					},
				],
				targetMode,
				profileOverride: roleConfig.profile,
				enabled: true,
				metadata: {
					source: "council",
					createdAt: new Date().toISOString(),
				},
			})
		}
	}

	return new PolicyEngine({
		...DEFAULT_POLICY_ENGINE_CONFIG,
		rules,
	})
}
