/**
 * PatternDetector - Analyzes traces to detect patterns and generate learning signals
 *
 * This service examines trace events to identify patterns such as:
 * - Doom loops (repeated tool failures)
 * - Capability gaps (tools requested but unavailable or denied)
 * - User feedback patterns (corrections, rejections)
 * - Instruction drift (task becoming unfocused)
 */

import type { TraceEvent, LearningSignal, DarwinConfig } from "@roo-code/types"

/** Configuration for pattern detection */
export interface PatternDetectorConfig {
	/** Number of failures before doom loop is detected (default: 3) */
	doomLoopThreshold: number
	/** Time window for analyzing patterns in milliseconds (default: 5 minutes) */
	analysisWindowMs: number
	/** Minimum confidence score for signals (default: 0.5) */
	minConfidence: number
}

/** Default configuration values */
const DEFAULT_CONFIG: PatternDetectorConfig = {
	doomLoopThreshold: 3,
	analysisWindowMs: 5 * 60 * 1000, // 5 minutes
	minConfidence: 0.5,
}

/** Internal pattern data for tracking tool failures */
interface ToolFailurePattern {
	toolName: string
	errorMessages: string[]
	timestamps: number[]
	taskId: string
	traceIds: string[]
}

/** Internal pattern data for tracking user feedback */
interface UserFeedbackPattern {
	type: "correction" | "rejection"
	toolName?: string
	count: number
	timestamps: number[]
	taskId: string
	traceIds: string[]
}

/**
 * PatternDetector analyzes trace events to identify patterns
 * that can be used for learning and improvement
 */
export class PatternDetector {
	private config: PatternDetectorConfig
	private darwinConfig: DarwinConfig

	constructor(darwinConfig: DarwinConfig, config?: Partial<PatternDetectorConfig>) {
		this.darwinConfig = darwinConfig
		this.config = {
			...DEFAULT_CONFIG,
			...config,
			doomLoopThreshold: darwinConfig.doomLoopThreshold || DEFAULT_CONFIG.doomLoopThreshold,
		}
	}

	/**
	 * Update configuration
	 */
	updateConfig(darwinConfig: DarwinConfig, config?: Partial<PatternDetectorConfig>): void {
		this.darwinConfig = darwinConfig
		this.config = {
			...this.config,
			...config,
			doomLoopThreshold: darwinConfig.doomLoopThreshold || this.config.doomLoopThreshold,
		}
	}

	/**
	 * Analyze traces and detect all patterns
	 */
	analyzeTraces(traces: TraceEvent[]): LearningSignal[] {
		const signals: LearningSignal[] = []

		// Filter traces within the analysis window
		const cutoff = Date.now() - this.config.analysisWindowMs
		const recentTraces = traces.filter((t) => t.timestamp >= cutoff)

		// Detect various patterns
		signals.push(...this.detectDoomLoops(recentTraces))
		signals.push(...this.detectCapabilityGaps(recentTraces))
		signals.push(...this.detectFeedbackPatterns(recentTraces))
		signals.push(...this.detectInstructionDrift(recentTraces))

		// Filter by minimum confidence
		return signals.filter((s) => s.confidence >= this.config.minConfidence)
	}

	/**
	 * Detect doom loops - same tool failing repeatedly
	 *
	 * A doom loop occurs when:
	 * 1. The same tool fails multiple times (>= threshold)
	 * 2. Failures occur within the analysis window
	 * 3. Error messages show similar patterns
	 */
	detectDoomLoops(traces: TraceEvent[]): LearningSignal[] {
		const signals: LearningSignal[] = []
		const toolFailures = new Map<string, ToolFailurePattern>()

		// Group tool errors by tool name and task
		for (const trace of traces) {
			if (trace.type === "tool_error" && trace.toolName) {
				const key = `${trace.taskId}:${trace.toolName}`
				const existing = toolFailures.get(key)

				if (existing) {
					existing.errorMessages.push(trace.errorMessage || "Unknown error")
					existing.timestamps.push(trace.timestamp)
					existing.traceIds.push(trace.id)
				} else {
					toolFailures.set(key, {
						toolName: trace.toolName,
						errorMessages: [trace.errorMessage || "Unknown error"],
						timestamps: [trace.timestamp],
						taskId: trace.taskId,
						traceIds: [trace.id],
					})
				}
			}
		}

		// Check for doom loops
		for (const [, pattern] of toolFailures) {
			if (pattern.timestamps.length >= this.config.doomLoopThreshold) {
				// Calculate confidence based on:
				// - Number of failures
				// - Similarity of error messages
				// - Time proximity of failures
				const errorSimilarity = this.calculateErrorSimilarity(pattern.errorMessages)
				const timeProximity = this.calculateTimeProximity(pattern.timestamps)
				const failureRatio = Math.min(pattern.timestamps.length / this.config.doomLoopThreshold, 2) / 2

				const confidence = errorSimilarity * 0.4 + timeProximity * 0.3 + failureRatio * 0.3

				// Find the most common error pattern
				const errorPattern = this.findMostCommonError(pattern.errorMessages)

				signals.push({
					id: `doom_loop_${pattern.taskId}_${pattern.toolName}_${Date.now()}`,
					type: "doom_loop",
					confidence,
					description: `Doom loop detected: ${pattern.toolName} failed ${pattern.timestamps.length} times with similar errors`,
					sourceEventIds: pattern.traceIds,
					detectedAt: Date.now(),
					suggestedAction: `Consider alternative approach for ${pattern.toolName}. Error pattern: ${errorPattern}`,
					context: {
						toolName: pattern.toolName,
						failureCount: pattern.timestamps.length,
						errorPattern,
						errorMessages: pattern.errorMessages,
						taskId: pattern.taskId,
					},
				})
			}
		}

		return signals
	}

	/**
	 * Detect capability gaps - tools/features that are requested but unavailable
	 */
	detectCapabilityGaps(traces: TraceEvent[]): LearningSignal[] {
		const signals: LearningSignal[] = []
		const rejectionPatterns = new Map<
			string,
			{ count: number; timestamps: number[]; taskIds: Set<string>; traceIds: string[] }
		>()

		// Look for user_rejection events that might indicate capability gaps
		for (const trace of traces) {
			if (trace.type === "user_rejection" && trace.toolName) {
				const key = trace.toolName
				const existing = rejectionPatterns.get(key)

				if (existing) {
					existing.count++
					existing.timestamps.push(trace.timestamp)
					existing.taskIds.add(trace.taskId)
					existing.traceIds.push(trace.id)
				} else {
					rejectionPatterns.set(key, {
						count: 1,
						timestamps: [trace.timestamp],
						taskIds: new Set([trace.taskId]),
						traceIds: [trace.id],
					})
				}
			}
		}

		// Check for repeated rejections (potential capability gap)
		for (const [toolName, pattern] of rejectionPatterns) {
			if (pattern.count >= 2) {
				// Multiple rejections suggests capability gap
				const confidence = Math.min(pattern.count / 5, 1) * 0.8 // Cap at 0.8

				signals.push({
					id: `capability_gap_${toolName}_${Date.now()}`,
					type: "capability_gap",
					confidence,
					description: `Tool ${toolName} was rejected ${pattern.count} times, suggesting a capability gap`,
					sourceEventIds: pattern.traceIds,
					detectedAt: Date.now(),
					suggestedAction: `Tool ${toolName} frequently rejected. Consider improving usage or providing better context.`,
					context: {
						toolName,
						rejectionCount: pattern.count,
						affectedTasks: Array.from(pattern.taskIds),
					},
				})
			}
		}

		// Also look for patterns in error messages that suggest missing capabilities
		const errorPatterns = new Map<
			string,
			{ count: number; tools: Set<string>; taskIds: Set<string>; traceIds: string[] }
		>()

		for (const trace of traces) {
			if (trace.type === "tool_error" && trace.errorMessage) {
				// Look for common capability-related error patterns
				const capabilityKeywords = [
					"not found",
					"unavailable",
					"permission denied",
					"access denied",
					"not supported",
				]
				const lowerError = trace.errorMessage.toLowerCase()

				for (const keyword of capabilityKeywords) {
					if (lowerError.includes(keyword)) {
						const existing = errorPatterns.get(keyword)
						if (existing) {
							existing.count++
							if (trace.toolName) existing.tools.add(trace.toolName)
							existing.taskIds.add(trace.taskId)
							existing.traceIds.push(trace.id)
						} else {
							errorPatterns.set(keyword, {
								count: 1,
								tools: trace.toolName ? new Set([trace.toolName]) : new Set(),
								taskIds: new Set([trace.taskId]),
								traceIds: [trace.id],
							})
						}
						break
					}
				}
			}
		}

		for (const [errorType, pattern] of errorPatterns) {
			if (pattern.count >= 2) {
				signals.push({
					id: `capability_gap_error_${errorType.replace(/\s+/g, "_")}_${Date.now()}`,
					type: "capability_gap",
					confidence: Math.min(pattern.count / 5, 0.9),
					description: `Frequent "${errorType}" errors (${pattern.count} times) suggest missing capability or misconfiguration`,
					sourceEventIds: pattern.traceIds,
					detectedAt: Date.now(),
					suggestedAction: `Frequent "${errorType}" errors suggest missing capability or misconfiguration.`,
					context: {
						errorPattern: errorType,
						errorCount: pattern.count,
						affectedTools: Array.from(pattern.tools),
						affectedTasks: Array.from(pattern.taskIds),
					},
				})
			}
		}

		return signals
	}

	/**
	 * Detect patterns in user feedback (corrections and rejections)
	 */
	detectFeedbackPatterns(traces: TraceEvent[]): LearningSignal[] {
		const signals: LearningSignal[] = []

		// Group by task
		const taskFeedback = new Map<string, UserFeedbackPattern[]>()

		for (const trace of traces) {
			if (trace.type === "user_correction" || trace.type === "user_rejection") {
				const taskPatterns = taskFeedback.get(trace.taskId) || []
				const existingPattern = taskPatterns.find(
					(p) =>
						p.type === (trace.type === "user_correction" ? "correction" : "rejection") &&
						p.toolName === trace.toolName,
				)

				if (existingPattern) {
					existingPattern.count++
					existingPattern.timestamps.push(trace.timestamp)
					existingPattern.traceIds.push(trace.id)
				} else {
					taskPatterns.push({
						type: trace.type === "user_correction" ? "correction" : "rejection",
						toolName: trace.toolName,
						count: 1,
						timestamps: [trace.timestamp],
						taskId: trace.taskId,
						traceIds: [trace.id],
					})
				}

				taskFeedback.set(trace.taskId, taskPatterns)
			}
		}

		// Analyze feedback patterns per task
		for (const [taskId, patterns] of taskFeedback) {
			const totalFeedback = patterns.reduce((sum, p) => sum + p.count, 0)
			const allTraceIds = patterns.flatMap((p) => p.traceIds)

			if (totalFeedback >= 3) {
				// Multiple pieces of feedback suggest issues
				const correctionCount = patterns
					.filter((p) => p.type === "correction")
					.reduce((sum, p) => sum + p.count, 0)
				const rejectionCount = patterns
					.filter((p) => p.type === "rejection")
					.reduce((sum, p) => sum + p.count, 0)

				// High rejection ratio suggests misalignment
				const rejectionRatio = rejectionCount / totalFeedback
				if (rejectionRatio > 0.5) {
					signals.push({
						id: `feedback_pattern_${taskId}_${Date.now()}`,
						type: "instruction_drift",
						confidence: rejectionRatio,
						description: `High rejection rate (${Math.round(rejectionRatio * 100)}%) in task suggests goals may need clarification`,
						sourceEventIds: allTraceIds,
						detectedAt: Date.now(),
						suggestedAction: `High rejection rate (${Math.round(rejectionRatio * 100)}%) suggests task goals may need clarification.`,
						context: {
							taskId,
							totalFeedback,
							correctionCount,
							rejectionCount,
							rejectionRatio,
						},
					})
				}
			}
		}

		return signals
	}

	/**
	 * Detect instruction drift - task becoming unfocused or off-track
	 */
	detectInstructionDrift(traces: TraceEvent[]): LearningSignal[] {
		const signals: LearningSignal[] = []

		// Group traces by task
		const taskTraces = new Map<string, TraceEvent[]>()
		for (const trace of traces) {
			const existing = taskTraces.get(trace.taskId) || []
			existing.push(trace)
			taskTraces.set(trace.taskId, existing)
		}

		for (const [taskId, taskEvents] of taskTraces) {
			// Look for mode switches which might indicate drift
			const modeSwitches = taskEvents.filter((t) => t.type === "mode_switch")

			if (modeSwitches.length >= 3) {
				// Multiple mode switches might indicate confusion
				signals.push({
					id: `instruction_drift_modes_${taskId}_${Date.now()}`,
					type: "instruction_drift",
					confidence: Math.min(modeSwitches.length / 5, 0.8),
					description: `Frequent mode switches (${modeSwitches.length}) may indicate task scope issues`,
					sourceEventIds: modeSwitches.map((m) => m.id),
					detectedAt: Date.now(),
					suggestedAction: `Frequent mode switches (${modeSwitches.length}) may indicate task scope issues.`,
					context: {
						taskId,
						modeSwitchCount: modeSwitches.length,
						modes: modeSwitches.map((m) => m.mode).filter(Boolean),
					},
				})
			}

			// Look for alternating success/failure patterns on same tool
			const toolSequences = new Map<string, Array<{ status: "success" | "error"; id: string }>>()
			for (const event of taskEvents.sort((a, b) => a.timestamp - b.timestamp)) {
				if ((event.type === "tool_success" || event.type === "tool_error") && event.toolName) {
					const seq = toolSequences.get(event.toolName) || []
					seq.push({
						status: event.type === "tool_success" ? "success" : "error",
						id: event.id,
					})
					toolSequences.set(event.toolName, seq)
				}
			}

			for (const [toolName, sequence] of toolSequences) {
				// Check for alternating pattern (success-error-success-error)
				let alternations = 0
				for (let i = 1; i < sequence.length; i++) {
					if (sequence[i].status !== sequence[i - 1].status) {
						alternations++
					}
				}

				const alternationRatio = alternations / Math.max(sequence.length - 1, 1)
				if (sequence.length >= 4 && alternationRatio > 0.7) {
					signals.push({
						id: `instruction_drift_alternating_${taskId}_${toolName}_${Date.now()}`,
						type: "instruction_drift",
						confidence: alternationRatio * 0.7,
						description: `Unstable pattern detected for ${toolName}: alternating success/failure suggests incorrect approach`,
						sourceEventIds: sequence.map((s) => s.id),
						detectedAt: Date.now(),
						suggestedAction: `Unstable pattern detected for ${toolName}. Task may be approaching problem incorrectly.`,
						context: {
							taskId,
							toolName,
							sequence: sequence.map((s) => s.status),
							alternationRatio,
						},
					})
				}
			}
		}

		return signals
	}

	/**
	 * Quick check for doom loop on a specific tool
	 * Returns true if threshold is exceeded
	 */
	isDoomLoop(traces: TraceEvent[], toolName: string): boolean {
		const cutoff = Date.now() - this.config.analysisWindowMs
		const recentErrors = traces.filter(
			(t) => t.type === "tool_error" && t.toolName === toolName && t.timestamp >= cutoff,
		)
		return recentErrors.length >= this.config.doomLoopThreshold
	}

	/**
	 * Get doom loop count for a specific tool
	 */
	getDoomLoopCount(traces: TraceEvent[], toolName: string): number {
		const cutoff = Date.now() - this.config.analysisWindowMs
		return traces.filter((t) => t.type === "tool_error" && t.toolName === toolName && t.timestamp >= cutoff).length
	}

	/**
	 * Calculate similarity between error messages
	 * Returns 0-1 score where 1 is identical
	 */
	private calculateErrorSimilarity(errors: string[]): number {
		if (errors.length < 2) return 1

		// Simple approach: check for common substrings
		const normalized = errors.map((e) => e.toLowerCase().trim())

		// Find common prefix length
		let commonChars = 0
		const minLength = Math.min(...normalized.map((e) => e.length))

		for (let i = 0; i < minLength; i++) {
			const char = normalized[0][i]
			if (normalized.every((e) => e[i] === char)) {
				commonChars++
			} else {
				break
			}
		}

		// Also check for common words
		const wordSets = normalized.map((e) => new Set(e.split(/\s+/)))
		const allWords = new Set(normalized.flatMap((e) => e.split(/\s+/)))
		let commonWords = 0

		for (const word of allWords) {
			if (wordSets.every((set) => set.has(word))) {
				commonWords++
			}
		}

		const prefixScore = commonChars / minLength
		const wordScore = commonWords / allWords.size

		return (prefixScore + wordScore) / 2
	}

	/**
	 * Calculate time proximity score
	 * Returns 0-1 where 1 means all events are very close together
	 */
	private calculateTimeProximity(timestamps: number[]): number {
		if (timestamps.length < 2) return 1

		const sorted = [...timestamps].sort((a, b) => a - b)
		const gaps: number[] = []

		for (let i = 1; i < sorted.length; i++) {
			gaps.push(sorted[i] - sorted[i - 1])
		}

		const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length
		const maxGap = this.config.analysisWindowMs / 2 // Half the window

		// Score inversely proportional to average gap
		return Math.max(0, 1 - avgGap / maxGap)
	}

	/**
	 * Find the most common error message pattern
	 */
	private findMostCommonError(errors: string[]): string {
		// Count exact occurrences
		const counts = new Map<string, number>()
		for (const error of errors) {
			counts.set(error, (counts.get(error) || 0) + 1)
		}

		// Find most common
		let maxCount = 0
		let mostCommon = errors[0]

		for (const [error, count] of counts) {
			if (count > maxCount) {
				maxCount = count
				mostCommon = error
			}
		}

		return mostCommon
	}
}
