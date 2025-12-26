/**
 * AutonomousExecutor - Orchestrate autonomous execution of proposals
 *
 * Responsibilities:
 * - Process pending proposals from StateManager
 * - Assess risk using RiskAssessor
 * - Route proposals based on autonomy level and risk
 * - Execute approved changes via ChangeApplicator
 * - Handle rollback on failure
 * - Emit events for UI updates
 * - Track metrics and outcomes
 */

import type {
	EvolutionProposal,
	ExecutionDecision,
	ExecutionEvent,
	ExecutionHealthMetrics,
	AutonomyLevel,
	RiskAssessmentResult,
	ChangeApplicatorResult,
	AutoApprovalRule,
} from "@roo-code/types"
import { DEFAULT_AUTONOMOUS_EXECUTOR_CONFIG, type AutonomousExecutorConfig } from "@roo-code/types"
import { RiskAssessor, type RiskHistoryData } from "./RiskAssessor"
import type { ChangeApplicator } from "../application/ChangeApplicator"
import type { StateManager } from "../state/StateManager"
import type { Council, CouncilDecision } from "../council"

/** Execution result for a single proposal */
export interface ExecutionResult {
	proposalId: string
	success: boolean
	decision: ExecutionDecision
	assessment: RiskAssessmentResult
	applicatorResult?: ChangeApplicatorResult
	error?: string
	executionTimeMs: number
}

/** Batch execution result */
export interface BatchExecutionResult {
	batchId: string
	results: ExecutionResult[]
	totalTimeMs: number
	successCount: number
	failureCount: number
	escalatedCount: number
}

/** Event listener type */
export type ExecutionEventListener = (event: ExecutionEvent) => void

/**
 * AutonomousExecutor handles automatic execution of evolution proposals
 */
export class AutonomousExecutor {
	private config: AutonomousExecutorConfig
	private riskAssessor: RiskAssessor
	private stateManager: StateManager
	private changeApplicator: ChangeApplicator
	private council: Council | null

	private eventListeners: Set<ExecutionEventListener> = new Set()
	private isProcessing: boolean = false

	/** Health metrics */
	private metrics: ExecutionHealthMetrics = {
		executionsToday: 0,
		successesToday: 0,
		failuresToday: 0,
		rollbacksToday: 0,
		avgExecutionTimeMs: 0,
		queueSize: 0,
		successRate: 1,
		status: "healthy",
		lastHealthCheckAt: Date.now(),
		dailyLimit: 50,
		remainingToday: 50,
	}

	/** Execution history for today */
	private todayExecutionTimes: number[] = []
	private lastResetDate: string = new Date().toISOString().split("T")[0]

	constructor(
		config: Partial<AutonomousExecutorConfig>,
		stateManager: StateManager,
		changeApplicator: ChangeApplicator,
		council: Council | null = null,
		riskAssessor?: RiskAssessor,
	) {
		this.config = { ...DEFAULT_AUTONOMOUS_EXECUTOR_CONFIG, ...config }
		this.stateManager = stateManager
		this.changeApplicator = changeApplicator
		this.council = council
		this.riskAssessor = riskAssessor ?? new RiskAssessor()

		// Initialize metrics from config
		this.metrics.dailyLimit = this.config.dailyLimit
		this.metrics.remainingToday = this.config.dailyLimit
	}

	// ==========================================================================
	// Core Execution Logic
	// ==========================================================================

	/**
	 * Process a single proposal
	 */
	async processProposal(proposal: EvolutionProposal): Promise<ExecutionResult> {
		const startTime = Date.now()

		try {
			// Check daily limits
			this.checkDailyReset()
			if (this.metrics.remainingToday <= 0) {
				return this.createResult(proposal, false, "Daily execution limit reached", startTime)
			}

			// Emit start event
			this.emit({
				type: "execution_started",
				timestamp: Date.now(),
				proposalId: proposal.id,
			})

			// Assess risk
			const assessment = this.riskAssessor.assessRisk(proposal)

			// Make execution decision
			const decision = await this.makeDecision(proposal, assessment)

			// Handle based on decision
			let applicatorResult: ChangeApplicatorResult | undefined
			let error: string | undefined

			if (decision.status === "approved") {
				// Execute the change
				try {
					applicatorResult = await this.executeChange(proposal)

					if (applicatorResult.success) {
						// Record success
						await this.stateManager.updateProposalStatus(proposal.id, "applied", {
							reviewedBy: decision.isAutomatic ? "autonomous-executor" : "council",
							reviewNotes: decision.reason,
							rollbackData: applicatorResult.rollbackData as unknown as Record<string, unknown>,
						})
						this.riskAssessor.recordResult(proposal, true)
						this.recordSuccess(Date.now() - startTime)
					} else {
						// Handle partial failure
						error = applicatorResult.failedChanges.map((f) => f.error).join("; ")

						if (this.config.rollbackOnFailure && applicatorResult.appliedChanges.length > 0) {
							await this.rollbackChange(applicatorResult)
						}

						await this.stateManager.updateProposalStatus(proposal.id, "failed", {
							reviewNotes: error,
						})
						this.riskAssessor.recordResult(proposal, false)
						this.recordFailure(Date.now() - startTime)
					}
				} catch (execError) {
					error = execError instanceof Error ? execError.message : String(execError)
					await this.stateManager.updateProposalStatus(proposal.id, "failed", {
						reviewNotes: error,
					})
					this.riskAssessor.recordResult(proposal, false)
					this.recordFailure(Date.now() - startTime)
				}
			} else if (decision.status === "escalated" || decision.status === "deferred") {
				// Keep as pending, emit event for UI
				this.emit({
					type: "approval_required",
					timestamp: Date.now(),
					proposalId: proposal.id,
					data: {
						reason: decision.reason,
						riskLevel: assessment.riskLevel,
						confidence: assessment.confidence,
					},
				})
			} else if (decision.status === "rejected") {
				await this.stateManager.updateProposalStatus(proposal.id, "rejected", {
					reviewedBy: "autonomous-executor",
					reviewNotes: decision.reason,
				})
			}

			// Emit completion event
			this.emit({
				type: applicatorResult?.success ? "execution_completed" : "execution_failed",
				timestamp: Date.now(),
				proposalId: proposal.id,
				data: {
					success: applicatorResult?.success ?? false,
					decision: decision.status,
					riskLevel: assessment.riskLevel,
					error,
				},
			})

			return {
				proposalId: proposal.id,
				success: applicatorResult?.success ?? false,
				decision,
				assessment,
				applicatorResult,
				error,
				executionTimeMs: Date.now() - startTime,
			}
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error)
			this.recordFailure(Date.now() - startTime)

			this.emit({
				type: "execution_failed",
				timestamp: Date.now(),
				proposalId: proposal.id,
				data: { error: errorMsg },
			})

			return this.createResult(proposal, false, errorMsg, startTime)
		}
	}

	/**
	 * Process multiple proposals
	 */
	async processProposals(proposals: EvolutionProposal[]): Promise<BatchExecutionResult> {
		const batchId = `batch-${Date.now()}`
		const startTime = Date.now()
		const results: ExecutionResult[] = []

		this.isProcessing = true

		try {
			// Limit batch size
			const toProcess = proposals.slice(0, this.config.maxPerCycle)

			for (const proposal of toProcess) {
				// Check if we've hit limits
				if (this.metrics.remainingToday <= 0) {
					break
				}

				const result = await this.processProposal(proposal)
				results.push(result)
			}

			return {
				batchId,
				results,
				totalTimeMs: Date.now() - startTime,
				successCount: results.filter((r) => r.success).length,
				failureCount: results.filter((r) => !r.success && r.decision.status !== "escalated").length,
				escalatedCount: results.filter((r) => r.decision.status === "escalated").length,
			}
		} finally {
			this.isProcessing = false
		}
	}

	/**
	 * Process all pending proposals
	 */
	async processPendingProposals(): Promise<BatchExecutionResult> {
		const pendingProposals = this.stateManager.getPendingProposals()
		this.metrics.queueSize = pendingProposals.length
		return this.processProposals(pendingProposals)
	}

	// ==========================================================================
	// Decision Making
	// ==========================================================================

	/**
	 * Make execution decision for a proposal
	 */
	private async makeDecision(
		proposal: EvolutionProposal,
		assessment: RiskAssessmentResult,
	): Promise<ExecutionDecision> {
		const baseDecision: Omit<ExecutionDecision, "status"> = {
			proposalId: proposal.id,
			riskLevel: assessment.riskLevel,
			confidence: assessment.confidence,
			reason: "",
			isAutomatic: true,
			decidedAt: Date.now(),
		}

		// Check if disabled
		if (!this.config.enabled) {
			return {
				...baseDecision,
				status: "deferred",
				reason: "Autonomous execution is disabled",
			}
		}

		// Dry run mode
		if (this.config.dryRun) {
			return {
				...baseDecision,
				status: "deferred",
				reason: "Dry run mode - not executing",
			}
		}

		// Check custom rules first
		const ruleDecision = this.checkCustomRules(proposal, assessment)
		if (ruleDecision) {
			return ruleDecision
		}

		// Apply autonomy level logic
		const canAutoApprove = this.riskAssessor.isSafeForAutoApproval(
			assessment,
			this.config.autonomyLevel as 0 | 1 | 2,
		)

		if (!canAutoApprove) {
			// Escalate to user or council
			if (
				assessment.riskLevel === "high" ||
				(assessment.riskLevel === "medium" && this.config.requireCouncilForMediumRisk)
			) {
				// Try council if available
				if (this.council && this.config.requireCouncilForMediumRisk) {
					const councilResult = await this.getCouncilDecision(proposal)
					if (councilResult) {
						return {
							...baseDecision,
							status: councilResult.approved ? "approved" : "rejected",
							reason: councilResult.reason || "Council decision",
							isAutomatic: false,
						}
					}
				}

				return {
					...baseDecision,
					status: "escalated",
					reason: `${assessment.riskLevel} risk proposal requires human approval`,
				}
			}

			return {
				...baseDecision,
				status: "deferred",
				reason: `Autonomy level ${this.config.autonomyLevel} does not permit auto-approval for ${assessment.riskLevel} risk`,
			}
		}

		// Confidence check
		if (assessment.confidence < this.config.minConfidence) {
			return {
				...baseDecision,
				status: "deferred",
				reason: `Confidence ${(assessment.confidence * 100).toFixed(1)}% below threshold ${(this.config.minConfidence * 100).toFixed(1)}%`,
			}
		}

		// Approved for auto-execution
		return {
			...baseDecision,
			status: "approved",
			reason: `Auto-approved: ${assessment.riskLevel} risk with ${(assessment.confidence * 100).toFixed(1)}% confidence`,
		}
	}

	/**
	 * Check custom approval rules
	 */
	private checkCustomRules(proposal: EvolutionProposal, assessment: RiskAssessmentResult): ExecutionDecision | null {
		// Sort by priority (lower = higher priority)
		const activeRules = this.config.customRules.filter((r) => r.active).sort((a, b) => a.priority - b.priority)

		for (const rule of activeRules) {
			if (this.ruleMatches(proposal, assessment, rule)) {
				// Convert rule action to decision status
				const statusMap: Record<string, ExecutionDecision["status"]> = {
					approve: "approved",
					defer: "deferred",
					reject: "rejected",
					escalate: "escalated",
				}
				const status = statusMap[rule.action] ?? "deferred"

				return {
					proposalId: proposal.id,
					status,
					riskLevel: assessment.riskLevel,
					confidence: assessment.confidence,
					reason: `Matched rule: ${rule.name}`,
					isAutomatic: true,
					decidedAt: Date.now(),
					context: { ruleId: rule.id },
				}
			}
		}

		return null
	}

	/**
	 * Check if a rule matches a proposal
	 */
	private ruleMatches(
		proposal: EvolutionProposal,
		assessment: RiskAssessmentResult,
		rule: AutoApprovalRule,
	): boolean {
		const { conditions } = rule

		// Check proposal type
		if (conditions.proposalTypes && conditions.proposalTypes.length > 0) {
			if (!conditions.proposalTypes.includes(proposal.type)) {
				return false
			}
		}

		// Check max risk level
		if (conditions.maxRiskLevel) {
			const riskOrder = { low: 0, medium: 1, high: 2 }
			if (riskOrder[assessment.riskLevel] > riskOrder[conditions.maxRiskLevel]) {
				return false
			}
		}

		// Check min confidence
		if (conditions.minConfidence !== undefined) {
			if (assessment.confidence < conditions.minConfidence) {
				return false
			}
		}

		// Check max affected files
		if (conditions.maxAffectedFiles !== undefined) {
			const payload = proposal.payload as { affectedFiles?: string[] }
			const fileCount = payload.affectedFiles?.length ?? 0
			if (fileCount > conditions.maxAffectedFiles) {
				return false
			}
		}

		// Check scope
		if (conditions.scope) {
			const payload = proposal.payload as { scope?: string }
			if (payload.scope !== conditions.scope) {
				return false
			}
		}

		return true
	}

	/**
	 * Get council decision for a proposal
	 */
	private async getCouncilDecision(proposal: EvolutionProposal): Promise<CouncilDecision | null> {
		if (!this.council) {
			return null
		}

		try {
			return await this.council.reviewProposal(proposal)
		} catch {
			console.warn("[AutonomousExecutor] Council review failed, escalating to user")
			return null
		}
	}

	// ==========================================================================
	// Execution
	// ==========================================================================

	/**
	 * Execute a change via ChangeApplicator
	 */
	private async executeChange(proposal: EvolutionProposal): Promise<ChangeApplicatorResult> {
		return this.changeApplicator.applyProposal(proposal)
	}

	/**
	 * Rollback a failed change
	 */
	private async rollbackChange(result: ChangeApplicatorResult): Promise<void> {
		if (!result.rollbackData || result.rollbackData.length === 0) {
			return
		}

		this.emit({
			type: "rollback_started",
			timestamp: Date.now(),
			data: { changeCount: result.rollbackData.length },
		})

		try {
			await this.changeApplicator.rollback(result.rollbackData)
			this.metrics.rollbacksToday++

			this.emit({
				type: "rollback_completed",
				timestamp: Date.now(),
				data: { success: true },
			})
		} catch (error) {
			this.emit({
				type: "rollback_completed",
				timestamp: Date.now(),
				data: { success: false, error: error instanceof Error ? error.message : String(error) },
			})
		}
	}

	// ==========================================================================
	// Metrics & Health
	// ==========================================================================

	/**
	 * Record a successful execution
	 */
	private recordSuccess(timeMs: number): void {
		this.metrics.executionsToday++
		this.metrics.successesToday++
		this.metrics.remainingToday = Math.max(0, this.metrics.remainingToday - 1)
		this.metrics.lastExecutionAt = Date.now()
		this.metrics.lastSuccessAt = Date.now()
		this.todayExecutionTimes.push(timeMs)
		this.updateAverageExecutionTime()
		this.updateSuccessRate()
		this.updateHealthStatus()
	}

	/**
	 * Record a failed execution
	 */
	private recordFailure(timeMs: number): void {
		this.metrics.executionsToday++
		this.metrics.failuresToday++
		this.metrics.remainingToday = Math.max(0, this.metrics.remainingToday - 1)
		this.metrics.lastExecutionAt = Date.now()
		this.metrics.lastFailureAt = Date.now()
		this.todayExecutionTimes.push(timeMs)
		this.updateAverageExecutionTime()
		this.updateSuccessRate()
		this.updateHealthStatus()
	}

	/**
	 * Update average execution time
	 */
	private updateAverageExecutionTime(): void {
		if (this.todayExecutionTimes.length === 0) {
			this.metrics.avgExecutionTimeMs = 0
			return
		}
		this.metrics.avgExecutionTimeMs =
			this.todayExecutionTimes.reduce((a, b) => a + b, 0) / this.todayExecutionTimes.length
	}

	/**
	 * Update success rate
	 */
	private updateSuccessRate(): void {
		if (this.metrics.executionsToday === 0) {
			this.metrics.successRate = 1
			return
		}
		this.metrics.successRate = this.metrics.successesToday / this.metrics.executionsToday
	}

	/**
	 * Update health status
	 */
	private updateHealthStatus(): void {
		this.metrics.lastHealthCheckAt = Date.now()

		if (this.metrics.failuresToday >= 5 || this.metrics.successRate < 0.5) {
			this.metrics.status = "unhealthy"
		} else if (this.metrics.failuresToday >= 2 || this.metrics.successRate < 0.8) {
			this.metrics.status = "degraded"
		} else {
			this.metrics.status = "healthy"
		}
	}

	/**
	 * Check if we need to reset daily counters
	 */
	private checkDailyReset(): void {
		const today = new Date().toISOString().split("T")[0]
		if (today !== this.lastResetDate) {
			this.resetDailyMetrics()
			this.lastResetDate = today
		}
	}

	/**
	 * Reset daily metrics
	 */
	private resetDailyMetrics(): void {
		this.metrics.executionsToday = 0
		this.metrics.successesToday = 0
		this.metrics.failuresToday = 0
		this.metrics.rollbacksToday = 0
		this.metrics.remainingToday = this.config.dailyLimit
		this.todayExecutionTimes = []
		this.metrics.status = "healthy"
	}

	/**
	 * Get current health metrics
	 */
	getHealthMetrics(): Readonly<ExecutionHealthMetrics> {
		this.checkDailyReset()
		this.metrics.queueSize = this.stateManager.getPendingProposals().length
		return { ...this.metrics }
	}

	/**
	 * Perform health check
	 */
	healthCheck(): ExecutionHealthMetrics {
		this.checkDailyReset()
		this.updateHealthStatus()

		this.emit({
			type: "health_check",
			timestamp: Date.now(),
			data: { ...this.metrics },
		})

		return { ...this.metrics }
	}

	// ==========================================================================
	// Event System
	// ==========================================================================

	/**
	 * Add event listener
	 */
	on(listener: ExecutionEventListener): () => void {
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
				console.error("[AutonomousExecutor] Error in event listener:", error)
			}
		}
	}

	// ==========================================================================
	// Configuration & State
	// ==========================================================================

	/**
	 * Update configuration
	 */
	updateConfig(config: Partial<AutonomousExecutorConfig>): void {
		this.config = { ...this.config, ...config }

		// Update daily limit if changed
		if (config.dailyLimit !== undefined) {
			this.metrics.dailyLimit = config.dailyLimit
			// Adjust remaining based on already used
			const used = this.metrics.executionsToday
			this.metrics.remainingToday = Math.max(0, config.dailyLimit - used)
		}
	}

	/**
	 * Get current configuration
	 */
	getConfig(): Readonly<AutonomousExecutorConfig> {
		return { ...this.config }
	}

	/**
	 * Check if currently processing
	 */
	isCurrentlyProcessing(): boolean {
		return this.isProcessing
	}

	/**
	 * Set council instance
	 */
	setCouncil(council: Council): void {
		this.council = council
	}

	/**
	 * Get risk history data for persistence
	 */
	getRiskHistory(): RiskHistoryData {
		return this.riskAssessor.getHistory() as RiskHistoryData
	}

	/**
	 * Set risk history data (restore from persistence)
	 */
	setRiskHistory(history: RiskHistoryData): void {
		this.riskAssessor.setHistory(history)
	}

	// ==========================================================================
	// Helper Methods
	// ==========================================================================

	/**
	 * Create a result object for error cases
	 */
	private createResult(
		proposal: EvolutionProposal,
		success: boolean,
		error: string,
		startTime: number,
	): ExecutionResult {
		return {
			proposalId: proposal.id,
			success,
			decision: {
				proposalId: proposal.id,
				status: "deferred",
				riskLevel: proposal.risk,
				confidence: 0,
				reason: error,
				isAutomatic: true,
				decidedAt: Date.now(),
			},
			assessment: {
				proposalId: proposal.id,
				riskLevel: proposal.risk,
				riskScore: 0.5,
				confidence: 0,
				factors: [],
				assessedAt: Date.now(),
			},
			error,
			executionTimeMs: Date.now() - startTime,
		}
	}
}
