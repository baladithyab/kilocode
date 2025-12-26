/**
 * ExecutionScheduler - Background processor for autonomous execution
 *
 * Responsibilities:
 * - Run periodic execution cycles
 * - Batch pending proposals
 * - Prioritize by age and impact
 * - Respect daily execution limits
 * - Provide health monitoring
 * - Handle quiet hours
 */

import type { EvolutionProposal, ExecutionBatch, ExecutionEvent, ExecutionHealthMetrics } from "@roo-code/types"
import { DEFAULT_EXECUTION_SCHEDULER_CONFIG, type ExecutionSchedulerConfig } from "@roo-code/types"
import type { AutonomousExecutor, BatchExecutionResult } from "./AutonomousExecutor"
import type { StateManager } from "../state/StateManager"

/** Scheduler status */
export type SchedulerStatus = "stopped" | "running" | "paused" | "quiet_hours"

/** Event listener type */
export type SchedulerEventListener = (event: ExecutionEvent) => void

/** Scheduler statistics */
export interface SchedulerStats {
	totalRuns: number
	totalProposalsProcessed: number
	totalSuccesses: number
	totalFailures: number
	totalBatches: number
	lastRunAt?: number
	lastBatchResult?: BatchExecutionResult
	uptime: number
	startedAt: number
}

/**
 * ExecutionScheduler manages background execution of proposals
 */
export class ExecutionScheduler {
	private config: ExecutionSchedulerConfig
	private executor: AutonomousExecutor
	private stateManager: StateManager

	private intervalId: NodeJS.Timeout | null = null
	private status: SchedulerStatus = "stopped"
	private eventListeners: Set<SchedulerEventListener> = new Set()

	/** Scheduler statistics */
	private stats: SchedulerStats = {
		totalRuns: 0,
		totalProposalsProcessed: 0,
		totalSuccesses: 0,
		totalFailures: 0,
		totalBatches: 0,
		uptime: 0,
		startedAt: 0,
	}

	/** Batch history */
	private batchHistory: ExecutionBatch[] = []
	private maxBatchHistory = 50

	constructor(config: Partial<ExecutionSchedulerConfig>, executor: AutonomousExecutor, stateManager: StateManager) {
		this.config = { ...DEFAULT_EXECUTION_SCHEDULER_CONFIG, ...config }
		this.executor = executor
		this.stateManager = stateManager
	}

	// ==========================================================================
	// Lifecycle
	// ==========================================================================

	/**
	 * Start the scheduler
	 */
	start(): void {
		if (this.status === "running") {
			return
		}

		if (!this.config.enabled) {
			console.log("[ExecutionScheduler] Scheduler is disabled in config")
			return
		}

		this.stats.startedAt = Date.now()
		this.status = "running"

		// Run immediately then at interval
		this.tick()

		this.intervalId = setInterval(() => {
			this.tick()
		}, this.config.intervalMs)

		console.log(`[ExecutionScheduler] Started with interval ${this.config.intervalMs}ms`)
	}

	/**
	 * Stop the scheduler
	 */
	stop(): void {
		if (this.intervalId) {
			clearInterval(this.intervalId)
			this.intervalId = null
		}

		this.status = "stopped"
		this.stats.uptime = Date.now() - this.stats.startedAt

		console.log("[ExecutionScheduler] Stopped")
	}

	/**
	 * Pause the scheduler
	 */
	pause(): void {
		if (this.status === "running") {
			this.status = "paused"
			console.log("[ExecutionScheduler] Paused")
		}
	}

	/**
	 * Resume the scheduler
	 */
	resume(): void {
		if (this.status === "paused") {
			this.status = "running"
			console.log("[ExecutionScheduler] Resumed")
		}
	}

	/**
	 * Get current status
	 */
	getStatus(): SchedulerStatus {
		return this.status
	}

	// ==========================================================================
	// Execution Loop
	// ==========================================================================

	/**
	 * Execute one tick of the scheduler
	 */
	private async tick(): Promise<void> {
		// Check if we should run
		if (this.status !== "running" && this.status !== "quiet_hours") {
			return
		}

		// Check quiet hours
		if (this.isQuietHours()) {
			this.status = "quiet_hours"
			this.emit({
				type: "scheduler_tick",
				timestamp: Date.now(),
				data: { skipped: true, reason: "quiet_hours" },
			})
			return
		}

		// Resume from quiet hours if needed
		if (this.status === "quiet_hours") {
			this.status = "running"
		}

		// Check if executor is busy
		if (this.executor.isCurrentlyProcessing()) {
			this.emit({
				type: "scheduler_tick",
				timestamp: Date.now(),
				data: { skipped: true, reason: "executor_busy" },
			})
			return
		}

		this.stats.totalRuns++
		this.emit({
			type: "scheduler_tick",
			timestamp: Date.now(),
			data: { runNumber: this.stats.totalRuns },
		})

		try {
			// Get pending proposals
			const pendingProposals = this.stateManager.getPendingProposals()

			if (pendingProposals.length === 0) {
				return
			}

			// Prioritize and batch proposals
			const prioritized = this.prioritizeProposals(pendingProposals)
			const batch = prioritized.slice(0, this.config.batchSize)

			// Create batch record
			const batchRecord = this.createBatchRecord(batch)

			// Execute batch
			const result = await this.executor.processProposals(batch)

			// Update batch record
			this.updateBatchRecord(batchRecord, result)

			// Update stats
			this.stats.totalProposalsProcessed += result.results.length
			this.stats.totalSuccesses += result.successCount
			this.stats.totalFailures += result.failureCount
			this.stats.totalBatches++
			this.stats.lastRunAt = Date.now()
			this.stats.lastBatchResult = result

			// Store batch in history
			this.addBatchToHistory(batchRecord)

			// Health check
			if (this.config.healthMonitoring) {
				this.performHealthCheck()
			}
		} catch (error) {
			console.error("[ExecutionScheduler] Error during tick:", error)
			this.emit({
				type: "execution_failed",
				timestamp: Date.now(),
				data: { error: error instanceof Error ? error.message : String(error) },
			})
		}
	}

	/**
	 * Force a tick (manual trigger)
	 */
	async forceTick(): Promise<BatchExecutionResult | null> {
		const originalStatus = this.status
		this.status = "running"

		try {
			await this.tick()
			return this.stats.lastBatchResult ?? null
		} finally {
			this.status = originalStatus
		}
	}

	// ==========================================================================
	// Proposal Management
	// ==========================================================================

	/**
	 * Prioritize proposals based on configuration
	 */
	private prioritizeProposals(proposals: EvolutionProposal[]): EvolutionProposal[] {
		const now = Date.now()

		const scored = proposals.map((p) => ({
			proposal: p,
			score: this.calculatePriorityScore(p, now),
			age: now - p.createdAt,
		}))

		// Sort by score (higher = higher priority)
		scored.sort((a, b) => b.score - a.score)

		// Check for aged-out proposals that need escalation
		for (const item of scored) {
			if (item.age > this.config.maxAgeMs) {
				// Mark as needing escalation
				this.emit({
					type: "proposal_escalated",
					timestamp: now,
					proposalId: item.proposal.id,
					data: {
						reason: "max_age_exceeded",
						ageMs: item.age,
						maxAgeMs: this.config.maxAgeMs,
					},
				})
			}
		}

		return scored.map((s) => s.proposal)
	}

	/**
	 * Calculate priority score for a proposal
	 */
	private calculatePriorityScore(proposal: EvolutionProposal, now: number): number {
		let score = 0
		const age = now - proposal.createdAt

		switch (this.config.priorityOrder) {
			case "age": {
				// Older proposals get higher priority
				score = age / (1000 * 60 * 60) // Hours old
				break
			}

			case "impact": {
				// Lower risk = higher priority (safer to execute)
				const riskScore = { low: 10, medium: 5, high: 1 }
				score = riskScore[proposal.risk] ?? 5
				// Add age as secondary factor
				score += (age / (1000 * 60 * 60)) * 0.1
				break
			}

			case "risk": {
				// Higher risk = higher priority (process need for review faster)
				const riskPriority = { low: 1, medium: 5, high: 10 }
				score = riskPriority[proposal.risk] ?? 5
				// Add age as secondary factor
				score += (age / (1000 * 60 * 60)) * 0.1
				break
			}
		}

		return score
	}

	// ==========================================================================
	// Batch Management
	// ==========================================================================

	/**
	 * Create a batch record
	 */
	private createBatchRecord(proposals: EvolutionProposal[]): ExecutionBatch {
		return {
			id: `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
			proposalIds: proposals.map((p) => p.id),
			status: "pending",
			createdAt: Date.now(),
			results: [],
		}
	}

	/**
	 * Update batch record with results
	 */
	private updateBatchRecord(batch: ExecutionBatch, result: BatchExecutionResult): void {
		batch.status = result.failureCount === 0 ? "completed" : "failed"
		batch.startedAt = batch.createdAt
		batch.completedAt = Date.now()
		batch.totalTimeMs = result.totalTimeMs
		batch.results = result.results.map((r) => ({
			proposalId: r.proposalId,
			success: r.success,
			error: r.error,
			executionTimeMs: r.executionTimeMs,
		}))
	}

	/**
	 * Add batch to history
	 */
	private addBatchToHistory(batch: ExecutionBatch): void {
		this.batchHistory.push(batch)

		// Trim history
		if (this.batchHistory.length > this.maxBatchHistory) {
			this.batchHistory = this.batchHistory.slice(-this.maxBatchHistory)
		}
	}

	/**
	 * Get batch history
	 */
	getBatchHistory(): ReadonlyArray<ExecutionBatch> {
		return this.batchHistory
	}

	/**
	 * Get a specific batch
	 */
	getBatch(batchId: string): ExecutionBatch | undefined {
		return this.batchHistory.find((b) => b.id === batchId)
	}

	// ==========================================================================
	// Health & Monitoring
	// ==========================================================================

	/**
	 * Perform health check
	 */
	private performHealthCheck(): void {
		const metrics = this.executor.getHealthMetrics()

		this.emit({
			type: "health_check",
			timestamp: Date.now(),
			data: {
				schedulerStatus: this.status,
				executorStatus: metrics.status,
				queueSize: metrics.queueSize,
				remainingToday: metrics.remainingToday,
				successRate: metrics.successRate,
			},
		})

		// Auto-pause if unhealthy
		if (metrics.status === "unhealthy") {
			console.warn("[ExecutionScheduler] Executor unhealthy, pausing scheduler")
			this.pause()
		}
	}

	/**
	 * Get scheduler statistics
	 */
	getStats(): Readonly<SchedulerStats> {
		return {
			...this.stats,
			uptime: this.status !== "stopped" ? Date.now() - this.stats.startedAt : this.stats.uptime,
		}
	}

	/**
	 * Get combined health metrics
	 */
	getHealthMetrics(): ExecutionHealthMetrics & { schedulerStatus: SchedulerStatus } {
		return {
			...this.executor.getHealthMetrics(),
			schedulerStatus: this.status,
		}
	}

	// ==========================================================================
	// Quiet Hours
	// ==========================================================================

	/**
	 * Check if currently in quiet hours
	 */
	private isQuietHours(): boolean {
		const quietHours = this.config.quietHours
		if (!quietHours || !quietHours.enabled) {
			return false
		}

		const now = new Date()
		const currentHour = now.getHours()

		// Handle wrap-around (e.g., 22:00 to 06:00)
		if (quietHours.startHour > quietHours.endHour) {
			return currentHour >= quietHours.startHour || currentHour < quietHours.endHour
		} else {
			return currentHour >= quietHours.startHour && currentHour < quietHours.endHour
		}
	}

	/**
	 * Get next run time considering quiet hours
	 */
	getNextRunTime(): Date | null {
		if (this.status !== "running" && this.status !== "quiet_hours") {
			return null
		}

		const now = new Date()
		let nextRun = new Date(now.getTime() + this.config.intervalMs)

		// If in quiet hours, calculate when quiet hours end
		if (this.isQuietHours() && this.config.quietHours?.enabled) {
			const endHour = this.config.quietHours.endHour
			nextRun = new Date(now)
			nextRun.setHours(endHour, 0, 0, 0)

			// If end hour is earlier in the day, it's tomorrow
			if (nextRun <= now) {
				nextRun.setDate(nextRun.getDate() + 1)
			}
		}

		return nextRun
	}

	// ==========================================================================
	// Event System
	// ==========================================================================

	/**
	 * Add event listener
	 */
	on(listener: SchedulerEventListener): () => void {
		this.eventListeners.add(listener)
		return () => this.eventListeners.delete(listener)
	}

	/**
	 * Emit an event
	 */
	private emit(event: ExecutionEvent): void {
		for (const listener of this.eventListeners) {
			try {
				listener(event)
			} catch (error) {
				console.error("[ExecutionScheduler] Error in event listener:", error)
			}
		}
	}

	// ==========================================================================
	// Configuration
	// ==========================================================================

	/**
	 * Update configuration
	 */
	updateConfig(config: Partial<ExecutionSchedulerConfig>): void {
		const wasRunning = this.status === "running"

		// Stop if running
		if (wasRunning) {
			this.stop()
		}

		// Update config
		this.config = { ...this.config, ...config }

		// Restart if was running and still enabled
		if (wasRunning && this.config.enabled) {
			this.start()
		}
	}

	/**
	 * Get current configuration
	 */
	getConfig(): Readonly<ExecutionSchedulerConfig> {
		return { ...this.config }
	}

	// ==========================================================================
	// Reset & Cleanup
	// ==========================================================================

	/**
	 * Reset scheduler statistics
	 */
	resetStats(): void {
		this.stats = {
			totalRuns: 0,
			totalProposalsProcessed: 0,
			totalSuccesses: 0,
			totalFailures: 0,
			totalBatches: 0,
			uptime: 0,
			startedAt: this.status !== "stopped" ? Date.now() : 0,
		}
	}

	/**
	 * Clear batch history
	 */
	clearBatchHistory(): void {
		this.batchHistory = []
	}

	/**
	 * Dispose of the scheduler
	 */
	dispose(): void {
		this.stop()
		this.eventListeners.clear()
		this.batchHistory = []
	}
}
