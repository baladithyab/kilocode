/**
 * TraceCapture - Service for capturing trace events during task execution
 *
 * This service is the main entry point for capturing events from Task.ts
 * and other components. It provides a simple API for logging events
 * and integrates with TraceStorage for persistence.
 */

import crypto from "crypto"
import type { TraceEvent, TraceEventType, DarwinConfig } from "@roo-code/types"
import { TraceStorage, type TraceStorageConfig } from "./TraceStorage"

/** Filter options for querying traces */
export interface TraceFilter {
	/** Filter by task ID */
	taskId?: string
	/** Filter by event types */
	types?: TraceEventType[]
	/** Filter by tool name */
	toolName?: string
	/** Filter events since timestamp */
	since?: number
	/** Filter events until timestamp */
	until?: number
	/** Maximum number of results */
	limit?: number
}

/** Options for creating a trace event */
export interface TraceCaptureOptions {
	/** Event type */
	type: TraceEventType
	/** Task ID this event belongs to */
	taskId: string
	/** Human-readable summary */
	summary: string
	/** Related tool name (optional) */
	toolName?: string
	/** Error message if applicable */
	errorMessage?: string
	/** Mode active when event occurred */
	mode?: string
	/** Model used when event occurred */
	model?: string
	/** Additional metadata */
	metadata?: Record<string, unknown>
}

/**
 * TraceCapture provides methods for capturing and querying trace events
 *
 * This is designed to be used as a singleton or passed around as a service.
 * It respects Darwin configuration for enabling/disabling trace capture.
 */
export class TraceCapture {
	private storage: TraceStorage
	private config: DarwinConfig
	private memoryCache: TraceEvent[] = []
	private readonly maxCacheSize: number = 1000
	private isEnabled: boolean

	constructor(storageConfig: TraceStorageConfig, darwinConfig: DarwinConfig) {
		this.storage = new TraceStorage(storageConfig)
		this.config = darwinConfig
		this.isEnabled = darwinConfig.enabled && darwinConfig.traceCapture
	}

	/**
	 * Initialize the trace capture service
	 */
	async initialize(): Promise<void> {
		if (!this.isEnabled) {
			return
		}

		await this.storage.initialize()
	}

	/**
	 * Update the Darwin configuration
	 */
	updateConfig(config: DarwinConfig): void {
		this.config = config
		this.isEnabled = config.enabled && config.traceCapture
	}

	/**
	 * Check if trace capture is enabled
	 */
	get enabled(): boolean {
		return this.isEnabled
	}

	/**
	 * Generate a unique trace event ID
	 */
	private generateId(): string {
		return `trace_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`
	}

	/**
	 * Capture a trace event
	 *
	 * Creates a complete trace event and stores it both in memory and on disk.
	 * Returns immediately if trace capture is disabled.
	 */
	capture(options: TraceCaptureOptions): TraceEvent | null {
		if (!this.isEnabled) {
			return null
		}

		const event: TraceEvent = {
			id: this.generateId(),
			timestamp: Date.now(),
			type: options.type,
			taskId: options.taskId,
			summary: options.summary,
			toolName: options.toolName,
			errorMessage: options.errorMessage,
			mode: options.mode,
			model: options.model,
			metadata: options.metadata,
		}

		// Add to memory cache
		this.memoryCache.push(event)
		if (this.memoryCache.length > this.maxCacheSize) {
			this.memoryCache.shift()
		}

		// Persist to storage (async, don't block)
		this.storage.append(event).catch((error) => {
			console.error("[TraceCapture] Failed to persist trace:", error)
		})

		return event
	}

	/**
	 * Capture a tool success event
	 */
	captureToolSuccess(
		taskId: string,
		toolName: string,
		summary: string,
		options?: { mode?: string; model?: string; metadata?: Record<string, unknown> },
	): TraceEvent | null {
		return this.capture({
			type: "tool_success",
			taskId,
			toolName,
			summary,
			...options,
		})
	}

	/**
	 * Capture a tool error event
	 */
	captureToolError(
		taskId: string,
		toolName: string,
		errorMessage: string,
		options?: { mode?: string; model?: string; metadata?: Record<string, unknown> },
	): TraceEvent | null {
		return this.capture({
			type: "tool_error",
			taskId,
			toolName,
			summary: `Tool ${toolName} failed: ${errorMessage.substring(0, 100)}`,
			errorMessage,
			...options,
		})
	}

	/**
	 * Capture a user correction event
	 */
	captureUserCorrection(
		taskId: string,
		summary: string,
		options?: { toolName?: string; mode?: string; model?: string; metadata?: Record<string, unknown> },
	): TraceEvent | null {
		return this.capture({
			type: "user_correction",
			taskId,
			summary,
			...options,
		})
	}

	/**
	 * Capture a user rejection event
	 */
	captureUserRejection(
		taskId: string,
		summary: string,
		options?: { toolName?: string; mode?: string; model?: string; metadata?: Record<string, unknown> },
	): TraceEvent | null {
		return this.capture({
			type: "user_rejection",
			taskId,
			summary,
			...options,
		})
	}

	/**
	 * Capture a task completion event
	 */
	captureTaskComplete(
		taskId: string,
		options?: { mode?: string; model?: string; metadata?: Record<string, unknown> },
	): TraceEvent | null {
		return this.capture({
			type: "task_complete",
			taskId,
			summary: `Task ${taskId} completed successfully`,
			...options,
		})
	}

	/**
	 * Capture a task abandoned event
	 */
	captureTaskAbandoned(
		taskId: string,
		reason: string,
		options?: { mode?: string; model?: string; metadata?: Record<string, unknown> },
	): TraceEvent | null {
		return this.capture({
			type: "task_abandoned",
			taskId,
			summary: `Task ${taskId} abandoned: ${reason}`,
			...options,
		})
	}

	/**
	 * Capture a doom loop detection event
	 */
	captureDoomLoopDetected(
		taskId: string,
		toolName: string,
		errorPattern: string,
		failureCount: number,
		options?: { mode?: string; model?: string; metadata?: Record<string, unknown> },
	): TraceEvent | null {
		return this.capture({
			type: "doom_loop_detected",
			taskId,
			toolName,
			summary: `Doom loop detected: ${toolName} failed ${failureCount} times with pattern: ${errorPattern.substring(0, 100)}`,
			metadata: {
				...options?.metadata,
				errorPattern,
				failureCount,
			},
			mode: options?.mode,
			model: options?.model,
		})
	}

	/**
	 * Capture an API error event
	 */
	captureApiError(
		taskId: string,
		errorMessage: string,
		options?: { mode?: string; model?: string; metadata?: Record<string, unknown> },
	): TraceEvent | null {
		return this.capture({
			type: "api_error",
			taskId,
			summary: `API error: ${errorMessage.substring(0, 100)}`,
			errorMessage,
			...options,
		})
	}

	/**
	 * Capture a context overflow event
	 */
	captureContextOverflow(
		taskId: string,
		contextTokens: number,
		maxTokens: number,
		options?: { mode?: string; model?: string; metadata?: Record<string, unknown> },
	): TraceEvent | null {
		return this.capture({
			type: "context_overflow",
			taskId,
			summary: `Context overflow: ${contextTokens} tokens exceeds ${maxTokens} limit`,
			metadata: {
				...options?.metadata,
				contextTokens,
				maxTokens,
			},
			mode: options?.mode,
			model: options?.model,
		})
	}

	/**
	 * Capture a mode switch event
	 */
	captureModeSwitched(
		taskId: string,
		fromMode: string,
		toMode: string,
		options?: { model?: string; metadata?: Record<string, unknown> },
	): TraceEvent | null {
		return this.capture({
			type: "mode_switch",
			taskId,
			summary: `Mode switched from ${fromMode} to ${toMode}`,
			mode: toMode,
			metadata: {
				...options?.metadata,
				fromMode,
				toMode,
			},
			model: options?.model,
		})
	}

	/**
	 * Get traces from memory cache with optional filtering
	 */
	getTraces(filter?: TraceFilter): TraceEvent[] {
		let traces = [...this.memoryCache]

		if (filter) {
			if (filter.taskId) {
				traces = traces.filter((t) => t.taskId === filter.taskId)
			}
			if (filter.types && filter.types.length > 0) {
				traces = traces.filter((t) => filter.types!.includes(t.type))
			}
			if (filter.toolName) {
				traces = traces.filter((t) => t.toolName === filter.toolName)
			}
			if (filter.since) {
				traces = traces.filter((t) => t.timestamp >= filter.since!)
			}
			if (filter.until) {
				traces = traces.filter((t) => t.timestamp <= filter.until!)
			}
			if (filter.limit) {
				traces = traces.slice(-filter.limit)
			}
		}

		return traces
	}

	/**
	 * Get traces since a specific timestamp
	 *
	 * First checks memory cache, then loads from storage if needed
	 */
	async getTracesSince(timestamp: number): Promise<TraceEvent[]> {
		// Check memory cache first
		const cachedTraces = this.memoryCache.filter((t) => t.timestamp >= timestamp)

		// If cache covers the time range, return from cache
		if (this.memoryCache.length > 0 && this.memoryCache[0].timestamp <= timestamp) {
			return cachedTraces
		}

		// Load from storage
		const storedTraces = await this.storage.loadSince(timestamp)

		// Merge and dedupe
		const traceMap = new Map<string, TraceEvent>()
		for (const trace of storedTraces) {
			traceMap.set(trace.id, trace)
		}
		for (const trace of cachedTraces) {
			traceMap.set(trace.id, trace)
		}

		return Array.from(traceMap.values()).sort((a, b) => a.timestamp - b.timestamp)
	}

	/**
	 * Get traces for a specific task
	 */
	async getTracesForTask(taskId: string): Promise<TraceEvent[]> {
		// Check memory cache
		const cachedTraces = this.memoryCache.filter((t) => t.taskId === taskId)

		// Load from storage
		const storedTraces = await this.storage.loadForTask(taskId)

		// Merge and dedupe
		const traceMap = new Map<string, TraceEvent>()
		for (const trace of storedTraces) {
			traceMap.set(trace.id, trace)
		}
		for (const trace of cachedTraces) {
			traceMap.set(trace.id, trace)
		}

		return Array.from(traceMap.values()).sort((a, b) => a.timestamp - b.timestamp)
	}

	/**
	 * Get recent tool errors for a specific tool
	 */
	getRecentToolErrors(toolName: string, windowMs: number = 60000): TraceEvent[] {
		const cutoff = Date.now() - windowMs
		return this.memoryCache.filter(
			(t) => t.type === "tool_error" && t.toolName === toolName && t.timestamp >= cutoff,
		)
	}

	/**
	 * Prune old traces based on retention policy
	 */
	async pruneOldTraces(olderThanDays?: number): Promise<number> {
		const days = olderThanDays ?? 30 // Default to 30 days if not specified
		const cutoff = Date.now() - days * 24 * 60 * 60 * 1000

		// Prune memory cache
		const originalLength = this.memoryCache.length
		this.memoryCache = this.memoryCache.filter((t) => t.timestamp >= cutoff)
		const prunedFromCache = originalLength - this.memoryCache.length

		// Prune from storage
		const prunedFromStorage = await this.storage.pruneOldTraces()

		return prunedFromCache + prunedFromStorage
	}

	/**
	 * Clear all traces (useful for testing)
	 */
	clearCache(): void {
		this.memoryCache = []
	}

	/**
	 * Get storage statistics
	 */
	async getStats(): Promise<{
		cacheSize: number
		storageStats: Awaited<ReturnType<TraceStorage["getStats"]>>
	}> {
		const storageStats = await this.storage.getStats()
		return {
			cacheSize: this.memoryCache.length,
			storageStats,
		}
	}

	/**
	 * Force flush to storage
	 */
	async flush(): Promise<void> {
		await this.storage.flush()
	}

	/**
	 * Ensure all data is flushed to storage
	 */
	async close(): Promise<void> {
		await this.storage.close()
	}
}

/** Singleton instance for global access */
let globalTraceCapture: TraceCapture | null = null

/**
 * Get or create the global TraceCapture instance
 */
export function getTraceCapture(storageConfig?: TraceStorageConfig, darwinConfig?: DarwinConfig): TraceCapture | null {
	if (!globalTraceCapture && storageConfig && darwinConfig) {
		globalTraceCapture = new TraceCapture(storageConfig, darwinConfig)
	}
	return globalTraceCapture
}

/**
 * Reset the global instance (for testing)
 */
export function resetTraceCapture(): void {
	globalTraceCapture = null
}
