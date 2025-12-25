/**
 * DarwinService - Main service for the Darwin evolution system
 *
 * This service manages:
 * - TraceCapture initialization and access
 * - PatternDetector for analyzing traces
 * - Integration with Task lifecycle events
 *
 * Usage:
 * - Call DarwinService.initialize() at extension startup
 * - Call DarwinService.captureToolSuccess/Error from Task.ts
 * - The service handles config, storage, and analysis internally
 */

import type { DarwinConfig, LearningSignal } from "@roo-code/types"
import { DEFAULT_DARWIN_CONFIG } from "@roo-code/types"
import { TraceCapture, type TraceCaptureOptions, type TraceStorageConfig } from "./trace"
import { PatternDetector } from "./analysis"

/** Service state */
interface DarwinServiceState {
	isInitialized: boolean
	config: DarwinConfig
	traceCapture: TraceCapture | null
	patternDetector: PatternDetector | null
	workspacePath: string | null
}

/** Global service state */
const state: DarwinServiceState = {
	isInitialized: false,
	config: DEFAULT_DARWIN_CONFIG,
	traceCapture: null,
	patternDetector: null,
	workspacePath: null,
}

/**
 * DarwinService provides static methods for Darwin system integration
 */
export class DarwinService {
	/**
	 * Initialize the Darwin service
	 *
	 * Should be called at extension startup with workspace path and config.
	 * Safe to call multiple times - will reinitialize if config changes.
	 */
	static async initialize(workspacePath: string, config: DarwinConfig): Promise<void> {
		// Skip if already initialized with same config
		if (
			state.isInitialized &&
			state.workspacePath === workspacePath &&
			JSON.stringify(state.config) === JSON.stringify(config)
		) {
			return
		}

		state.config = config
		state.workspacePath = workspacePath

		// Initialize trace capture if enabled
		if (config.enabled && config.traceCapture) {
			const storageConfig: TraceStorageConfig = {
				workspacePath,
			}

			state.traceCapture = new TraceCapture(storageConfig, config)
			await state.traceCapture.initialize()
		} else {
			state.traceCapture = null
		}

		// Initialize pattern detector
		if (config.enabled) {
			state.patternDetector = new PatternDetector(config)
		} else {
			state.patternDetector = null
		}

		state.isInitialized = true
	}

	/**
	 * Update Darwin configuration
	 */
	static updateConfig(config: DarwinConfig): void {
		state.config = config

		if (state.traceCapture) {
			state.traceCapture.updateConfig(config)
		}

		if (state.patternDetector) {
			state.patternDetector.updateConfig(config)
		}
	}

	/**
	 * Check if Darwin is enabled
	 */
	static get isEnabled(): boolean {
		return state.config.enabled
	}

	/**
	 * Check if trace capture is enabled
	 */
	static get isTraceCaptureEnabled(): boolean {
		return state.config.enabled && state.config.traceCapture
	}

	/**
	 * Get the current configuration
	 */
	static get config(): DarwinConfig {
		return state.config
	}

	/**
	 * Get the TraceCapture instance (if initialized)
	 */
	static get traceCapture(): TraceCapture | null {
		return state.traceCapture
	}

	/**
	 * Get the PatternDetector instance (if initialized)
	 */
	static get patternDetector(): PatternDetector | null {
		return state.patternDetector
	}

	// ==========================================================================
	// Trace capture convenience methods (for integration with Task.ts)
	// ==========================================================================

	/**
	 * Capture a tool success event
	 *
	 * Call from Task.recordToolUsage() after successful tool execution
	 */
	static captureToolSuccess(
		taskId: string,
		toolName: string,
		options?: { mode?: string; model?: string; metadata?: Record<string, unknown> },
	): void {
		if (!state.traceCapture?.enabled) {
			return
		}

		state.traceCapture.captureToolSuccess(taskId, toolName, `Tool ${toolName} executed successfully`, options)
	}

	/**
	 * Capture a tool error event
	 *
	 * Call from Task.recordToolError() when a tool fails
	 */
	static captureToolError(
		taskId: string,
		toolName: string,
		errorMessage: string,
		options?: { mode?: string; model?: string; metadata?: Record<string, unknown> },
	): void {
		if (!state.traceCapture?.enabled) {
			return
		}

		state.traceCapture.captureToolError(taskId, toolName, errorMessage, options)

		// Check for doom loop
		const recentErrors = state.traceCapture.getRecentToolErrors(toolName)
		if (recentErrors.length >= state.config.doomLoopThreshold) {
			// Capture doom loop detection event
			state.traceCapture.captureDoomLoopDetected(taskId, toolName, errorMessage, recentErrors.length, options)
		}
	}

	/**
	 * Capture a user correction event
	 */
	static captureUserCorrection(
		taskId: string,
		summary: string,
		options?: { toolName?: string; mode?: string; model?: string; metadata?: Record<string, unknown> },
	): void {
		if (!state.traceCapture?.enabled) {
			return
		}

		state.traceCapture.captureUserCorrection(taskId, summary, options)
	}

	/**
	 * Capture a user rejection event
	 */
	static captureUserRejection(
		taskId: string,
		summary: string,
		options?: { toolName?: string; mode?: string; model?: string; metadata?: Record<string, unknown> },
	): void {
		if (!state.traceCapture?.enabled) {
			return
		}

		state.traceCapture.captureUserRejection(taskId, summary, options)
	}

	/**
	 * Capture a task completion event
	 */
	static captureTaskComplete(
		taskId: string,
		options?: { mode?: string; model?: string; metadata?: Record<string, unknown> },
	): void {
		if (!state.traceCapture?.enabled) {
			return
		}

		state.traceCapture.captureTaskComplete(taskId, options)
	}

	/**
	 * Capture a task abandoned event
	 */
	static captureTaskAbandoned(
		taskId: string,
		reason: string,
		options?: { mode?: string; model?: string; metadata?: Record<string, unknown> },
	): void {
		if (!state.traceCapture?.enabled) {
			return
		}

		state.traceCapture.captureTaskAbandoned(taskId, reason, options)
	}

	/**
	 * Capture a mode switch event
	 */
	static captureModeSwitched(
		taskId: string,
		fromMode: string,
		toMode: string,
		options?: { model?: string; metadata?: Record<string, unknown> },
	): void {
		if (!state.traceCapture?.enabled) {
			return
		}

		state.traceCapture.captureModeSwitched(taskId, fromMode, toMode, options)
	}

	// ==========================================================================
	// Pattern detection methods
	// ==========================================================================

	/**
	 * Check if a tool is in a doom loop
	 */
	static isDoomLoop(taskId: string, toolName: string): boolean {
		if (!state.traceCapture?.enabled || !state.patternDetector) {
			return false
		}

		const traces = state.traceCapture.getTraces({ taskId, toolName })
		return state.patternDetector.isDoomLoop(traces, toolName)
	}

	/**
	 * Get doom loop count for a tool
	 */
	static getDoomLoopCount(taskId: string, toolName: string): number {
		if (!state.traceCapture?.enabled || !state.patternDetector) {
			return 0
		}

		const traces = state.traceCapture.getTraces({ taskId, toolName })
		return state.patternDetector.getDoomLoopCount(traces, toolName)
	}

	/**
	 * Analyze traces and detect patterns
	 *
	 * Returns learning signals that can be used for proposals
	 */
	static async analyzePatterns(taskId: string): Promise<LearningSignal[]> {
		if (!state.traceCapture?.enabled || !state.patternDetector) {
			return []
		}

		const traces = await state.traceCapture.getTracesForTask(taskId)
		return state.patternDetector.analyzeTraces(traces)
	}

	/**
	 * Get statistics about trace storage
	 */
	static async getStats(): Promise<{
		enabled: boolean
		cacheSize: number
		storageStats?: {
			totalFiles: number
			totalSizeBytes: number
			oldestTraceDate: string | null
			newestTraceDate: string | null
		}
	}> {
		if (!state.traceCapture) {
			return { enabled: false, cacheSize: 0 }
		}

		const stats = await state.traceCapture.getStats()
		return {
			enabled: true,
			cacheSize: stats.cacheSize,
			storageStats: stats.storageStats,
		}
	}

	/**
	 * Prune old traces
	 */
	static async pruneOldTraces(olderThanDays?: number): Promise<number> {
		if (!state.traceCapture) {
			return 0
		}

		return state.traceCapture.pruneOldTraces(olderThanDays)
	}

	/**
	 * Shutdown the Darwin service
	 *
	 * Should be called on extension deactivation
	 */
	static async shutdown(): Promise<void> {
		if (state.traceCapture) {
			await state.traceCapture.close()
			state.traceCapture = null
		}

		state.patternDetector = null
		state.isInitialized = false
	}

	/**
	 * Reset service state (for testing)
	 */
	static reset(): void {
		state.isInitialized = false
		state.config = DEFAULT_DARWIN_CONFIG
		state.traceCapture = null
		state.patternDetector = null
		state.workspacePath = null
	}
}
