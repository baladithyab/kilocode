/**
 * EvolutionEngine - Main orchestrator for the Darwin evolution loop
 *
 * Responsibilities:
 * - Orchestrate the complete evolution cycle
 * - Manage proposal lifecycle (pending → approved/rejected → applied)
 * - Coordinate between components (TraceCapture, PatternDetector, Council)
 * - Emit events for UI integration
 * - Integrate with autonomous execution (Phase 4A)
 * - Support real multi-agent council (Phase 4B)
 */

import type {
	DarwinConfig,
	LearningSignal,
	EvolutionProposal,
	EvolutionState,
	ExecutionEvent,
	AutonomousExecutorConfig,
	ExecutionSchedulerConfig,
	ExecutionHealthMetrics,
	AgentRole,
	CouncilExecution,
} from "@roo-code/types"
import { DEFAULT_DARWIN_CONFIG } from "@roo-code/types"
import { ProposalGenerator } from "../proposals"
import { StateManager } from "../state"
import {
	Council,
	type CouncilDecision,
	MultiAgentCouncil,
	createCouncil,
	isMultiAgentCouncil,
	type TaskDelegator,
	type DarwinConfigWithMultiAgent,
	type MultiAgentCouncilEvent,
} from "../council"
import { ChangeApplicator } from "../application/ChangeApplicator"
import { AutonomousExecutor, RiskAssessor, ExecutionScheduler } from "../autonomy"
import type { BatchExecutionResult, ExecutionResult } from "../autonomy"

/** Events emitted by the EvolutionEngine */
export type EvolutionEventType =
	| "signal_detected"
	| "proposal_generated"
	| "proposal_approved"
	| "proposal_rejected"
	| "proposal_applied"
	| "proposal_failed"
	| "cycle_complete"
	| "error"
	// Phase 4A events
	| "execution_started"
	| "execution_completed"
	| "execution_failed"
	| "approval_required"
	| "scheduler_started"
	| "scheduler_stopped"
	| "health_update"
	// Phase 4B events
	| "council_execution_started"
	| "council_agent_started"
	| "council_agent_completed"
	| "council_agent_failed"
	| "council_execution_completed"
	| "council_execution_failed"

/** Event data for evolution events */
export interface EvolutionEvent {
	type: EvolutionEventType
	timestamp: number
	data?: {
		signal?: LearningSignal
		proposal?: EvolutionProposal
		decision?: CouncilDecision
		error?: Error
		stats?: {
			signalsProcessed: number
			proposalsGenerated: number
			proposalsApplied: number
		}
		// Phase 4A data
		executionResult?: ExecutionResult
		batchResult?: BatchExecutionResult
		healthMetrics?: ExecutionHealthMetrics
		// Phase 4B data
		councilExecution?: CouncilExecution
		agentRole?: AgentRole
	}
}

/** Event listener type */
export type EvolutionEventListener = (event: EvolutionEvent) => void

/** Configuration for EvolutionEngine */
export interface EvolutionEngineConfig {
	/** Darwin configuration */
	darwinConfig: DarwinConfig

	/** Workspace path for state persistence */
	workspacePath: string

	/** Council instance for proposal review (optional - will be created if not provided) */
	council?: Council | MultiAgentCouncil

	/** Auto-run analysis on signal threshold */
	autoRunThreshold?: number

	/** Phase 4A: Autonomous executor configuration */
	autonomousExecutorConfig?: Partial<AutonomousExecutorConfig>

	/** Phase 4A: Execution scheduler configuration */
	schedulerConfig?: Partial<ExecutionSchedulerConfig>

	/** Phase 4A: Enable autonomous execution */
	enableAutonomousExecution?: boolean

	// Phase 4B: Multi-Agent Council Configuration

	/** Task delegator for multi-agent council (usually ClineProvider) */
	taskDelegator?: TaskDelegator

	/** Enable real multi-agent council */
	enableRealMultiAgent?: boolean

	/** Multi-agent timeout in milliseconds */
	multiAgentTimeout?: number

	/** Maximum concurrent agents */
	maxConcurrentAgents?: number
}

/**
 * EvolutionEngine orchestrates the complete evolution cycle
 */
export class EvolutionEngine {
	private config: DarwinConfig
	private extendedConfig: DarwinConfigWithMultiAgent
	private workspacePath: string
	private council: Council | MultiAgentCouncil | null

	private stateManager: StateManager
	private proposalGenerator: ProposalGenerator

	// Phase 4A components
	private changeApplicator: ChangeApplicator | null = null
	private riskAssessor: RiskAssessor | null = null
	private autonomousExecutor: AutonomousExecutor | null = null
	private executionScheduler: ExecutionScheduler | null = null
	private autonomousExecutionEnabled: boolean = false

	// Phase 4B components
	private taskDelegator: TaskDelegator | null = null
	private multiAgentUnsubscribe: (() => void) | null = null

	private isInitialized: boolean = false
	private eventListeners: Set<EvolutionEventListener> = new Set()

	/** Signals awaiting analysis */
	private pendingSignals: LearningSignal[] = []
	private autoRunThreshold: number

	constructor(engineConfig: EvolutionEngineConfig) {
		this.config = engineConfig.darwinConfig ?? DEFAULT_DARWIN_CONFIG
		this.workspacePath = engineConfig.workspacePath
		this.autoRunThreshold = engineConfig.autoRunThreshold ?? 5

		// Build extended config with Phase 4B options
		this.extendedConfig = {
			...this.config,
			enableRealMultiAgent: engineConfig.enableRealMultiAgent ?? false,
			multiAgentTimeout: engineConfig.multiAgentTimeout ?? 300000,
			maxConcurrentAgents: engineConfig.maxConcurrentAgents ?? 4,
		}

		// Store task delegator for Phase 4B
		this.taskDelegator = engineConfig.taskDelegator ?? null

		// Create or use provided council
		if (engineConfig.council) {
			this.council = engineConfig.council
		} else {
			// Use factory to create appropriate council
			this.council = createCouncil({
				config: this.extendedConfig,
				delegator: this.taskDelegator ?? undefined,
			})
		}

		// Subscribe to multi-agent council events if applicable
		if (isMultiAgentCouncil(this.council)) {
			this.subscribeToMultiAgentEvents(this.council)
		}

		this.stateManager = new StateManager({ workspacePath: this.workspacePath })
		this.proposalGenerator = new ProposalGenerator({ config: this.config })

		// Phase 4A: Set up autonomous execution if enabled
		this.autonomousExecutionEnabled = engineConfig.enableAutonomousExecution ?? false
		if (this.autonomousExecutionEnabled) {
			this.initializeAutonomousExecution(engineConfig)
		}
	}

	/**
	 * Subscribe to multi-agent council events (Phase 4B)
	 */
	private subscribeToMultiAgentEvents(council: MultiAgentCouncil): void {
		this.multiAgentUnsubscribe = council.on((event: MultiAgentCouncilEvent) => {
			switch (event.type) {
				case "execution_started":
					this.emit({
						type: "council_execution_started",
						timestamp: Date.now(),
						data: { councilExecution: event.execution },
					})
					break
				case "agent_started":
					this.emit({
						type: "council_agent_started",
						timestamp: Date.now(),
						data: {
							councilExecution: event.execution,
							agentRole: event.role,
						},
					})
					break
				case "agent_completed":
					this.emit({
						type: "council_agent_completed",
						timestamp: Date.now(),
						data: {
							councilExecution: event.execution,
							agentRole: event.role,
						},
					})
					break
				case "agent_failed":
					this.emit({
						type: "council_agent_failed",
						timestamp: Date.now(),
						data: {
							councilExecution: event.execution,
							agentRole: event.role,
						},
					})
					break
				case "execution_completed":
					this.emit({
						type: "council_execution_completed",
						timestamp: Date.now(),
						data: {
							councilExecution: event.execution,
							decision: event.decision,
						},
					})
					break
				case "execution_failed":
					this.emit({
						type: "council_execution_failed",
						timestamp: Date.now(),
						data: { councilExecution: event.execution },
					})
					break
			}
		})
	}

	/**
	 * Initialize autonomous execution components (Phase 4A)
	 */
	private initializeAutonomousExecution(engineConfig: EvolutionEngineConfig): void {
		// Create change applicator
		this.changeApplicator = new ChangeApplicator({
			workspacePath: this.workspacePath,
			createBackups: true,
		})

		// Create risk assessor
		this.riskAssessor = new RiskAssessor()

		// Create autonomous executor
		const executorConfig: Partial<AutonomousExecutorConfig> = {
			enabled: this.config.autonomyLevel > 0,
			autonomyLevel: this.config.autonomyLevel,
			...engineConfig.autonomousExecutorConfig,
		}

		// Get base council for AutonomousExecutor (needs Council, not MultiAgentCouncil)
		const executorCouncil = this.council && isMultiAgentCouncil(this.council) ? null : this.council

		this.autonomousExecutor = new AutonomousExecutor(
			executorConfig,
			this.stateManager,
			this.changeApplicator,
			executorCouncil,
			this.riskAssessor,
		)

		// Set up executor event forwarding
		this.autonomousExecutor.on((event: ExecutionEvent) => {
			this.emit({
				type: event.type as EvolutionEventType,
				timestamp: event.timestamp,
				data: event.data as EvolutionEvent["data"],
			})
		})

		// Create execution scheduler
		const schedulerConfig: Partial<ExecutionSchedulerConfig> = {
			enabled: this.config.autonomyLevel > 0,
			...engineConfig.schedulerConfig,
		}

		this.executionScheduler = new ExecutionScheduler(schedulerConfig, this.autonomousExecutor, this.stateManager)

		// Set up scheduler event forwarding
		this.executionScheduler.on((event: ExecutionEvent) => {
			this.emit({
				type: event.type as EvolutionEventType,
				timestamp: event.timestamp,
				data: event.data as EvolutionEvent["data"],
			})
		})
	}

	/**
	 * Initialize the evolution engine
	 */
	async initialize(): Promise<void> {
		if (this.isInitialized) {
			return
		}

		await this.stateManager.initialize()

		// Start scheduler if autonomous execution is enabled
		if (this.autonomousExecutionEnabled && this.executionScheduler && this.config.autonomyLevel > 0) {
			this.executionScheduler.start()
			this.emit({
				type: "scheduler_started",
				timestamp: Date.now(),
			})
		}

		this.isInitialized = true
	}

	/**
	 * Update configuration
	 */
	async updateConfig(config: DarwinConfig): Promise<void> {
		this.config = config
		this.extendedConfig = {
			...config,
			enableRealMultiAgent: this.extendedConfig.enableRealMultiAgent,
			multiAgentTimeout: this.extendedConfig.multiAgentTimeout,
			maxConcurrentAgents: this.extendedConfig.maxConcurrentAgents,
		}

		this.proposalGenerator.updateConfig(config)
		await this.stateManager.updateConfig(config)

		// Update council if it exists
		if (this.council) {
			this.council.updateConfig(config)
		}

		// Update autonomous executor config if it exists
		if (this.autonomousExecutor) {
			this.autonomousExecutor.updateConfig({
				enabled: config.autonomyLevel > 0,
				autonomyLevel: config.autonomyLevel,
			})
		}

		// Start/stop scheduler based on autonomy level
		if (this.executionScheduler) {
			if (config.autonomyLevel > 0) {
				if (this.executionScheduler.getStatus() === "stopped") {
					this.executionScheduler.start()
					this.emit({
						type: "scheduler_started",
						timestamp: Date.now(),
					})
				}
			} else {
				if (this.executionScheduler.getStatus() !== "stopped") {
					this.executionScheduler.stop()
					this.emit({
						type: "scheduler_stopped",
						timestamp: Date.now(),
					})
				}
			}
		}
	}

	/**
	 * Update multi-agent configuration (Phase 4B)
	 */
	updateMultiAgentConfig(config: {
		enableRealMultiAgent?: boolean
		multiAgentTimeout?: number
		maxConcurrentAgents?: number
	}): void {
		this.extendedConfig = {
			...this.extendedConfig,
			...config,
		}

		// Recreate council if multi-agent setting changed
		if (config.enableRealMultiAgent !== undefined) {
			// Unsubscribe from old council events
			if (this.multiAgentUnsubscribe) {
				this.multiAgentUnsubscribe()
				this.multiAgentUnsubscribe = null
			}

			// Create new council with updated config
			this.council = createCouncil({
				config: this.extendedConfig,
				delegator: this.taskDelegator ?? undefined,
			})

			// Subscribe to new council events if multi-agent
			if (isMultiAgentCouncil(this.council)) {
				this.subscribeToMultiAgentEvents(this.council)
			}

			// Update autonomous executor's council
			if (this.autonomousExecutor) {
				const executorCouncil = isMultiAgentCouncil(this.council) ? null : this.council
				if (executorCouncil) {
					this.autonomousExecutor.setCouncil(executorCouncil)
				}
			}
		}

		// Update existing multi-agent council config
		if (isMultiAgentCouncil(this.council)) {
			this.council.updateConfig({
				enabled: this.extendedConfig.enableRealMultiAgent,
				agentTimeout: this.extendedConfig.multiAgentTimeout,
				maxConcurrentAgents: this.extendedConfig.maxConcurrentAgents,
			})
		}
	}

	/**
	 * Set the task delegator for multi-agent council (Phase 4B)
	 */
	setTaskDelegator(delegator: TaskDelegator): void {
		this.taskDelegator = delegator

		// Update multi-agent council if it exists
		if (isMultiAgentCouncil(this.council)) {
			this.council.setDelegator(delegator)
		}
	}

	/**
	 * Get current evolution state
	 */
	getState(): Readonly<EvolutionState> {
		return this.stateManager.getState()
	}

	// ==========================================================================
	// Signal Processing
	// ==========================================================================

	/**
	 * Add a learning signal for processing
	 */
	async addSignal(signal: LearningSignal): Promise<void> {
		if (!this.config.enabled) {
			return
		}

		// Persist signal
		await this.stateManager.addSignal(signal)
		this.pendingSignals.push(signal)

		// Emit event
		this.emit({
			type: "signal_detected",
			timestamp: Date.now(),
			data: { signal },
		})

		// Auto-run analysis if threshold reached
		if (this.pendingSignals.length >= this.autoRunThreshold) {
			await this.runEvolutionCycle()
		}
	}

	/**
	 * Add multiple learning signals
	 */
	async addSignals(signals: LearningSignal[]): Promise<void> {
		for (const signal of signals) {
			await this.addSignal(signal)
		}
	}

	// ==========================================================================
	// Evolution Cycle
	// ==========================================================================

	/**
	 * Run a complete evolution cycle
	 *
	 * 1. Process pending signals
	 * 2. Generate proposals
	 * 3. Review proposals (via Council if enabled)
	 * 4. Apply approved proposals (based on autonomy level)
	 */
	async runEvolutionCycle(): Promise<{
		signalsProcessed: number
		proposalsGenerated: number
		proposalsApplied: number
	}> {
		const stats = {
			signalsProcessed: 0,
			proposalsGenerated: 0,
			proposalsApplied: 0,
		}

		if (!this.config.enabled || this.pendingSignals.length === 0) {
			return stats
		}

		try {
			// 1. Process pending signals and generate proposals
			const signals = [...this.pendingSignals]
			this.pendingSignals = []
			stats.signalsProcessed = signals.length

			const proposals = this.proposalGenerator.generateFromSignals(signals)
			stats.proposalsGenerated = proposals.length

			// 2. Add proposals to state
			for (const proposal of proposals) {
				await this.stateManager.addProposal(proposal)
				this.emit({
					type: "proposal_generated",
					timestamp: Date.now(),
					data: { proposal },
				})
			}

			// 3. Review and apply proposals
			// If autonomous execution is enabled and autonomy > 0, let the executor handle it
			if (this.autonomousExecutor && this.config.autonomyLevel > 0) {
				// Process via autonomous executor
				const result = await this.autonomousExecutor.processProposals(proposals)
				stats.proposalsApplied = result.successCount

				this.emit({
					type: "cycle_complete",
					timestamp: Date.now(),
					data: {
						stats,
						batchResult: result,
					},
				})
			} else {
				// Original manual/council flow
				for (const proposal of proposals) {
					const shouldApply = await this.reviewProposal(proposal)

					if (shouldApply) {
						const success = await this.applyProposal(proposal)
						if (success) {
							stats.proposalsApplied++
						}
					}
				}

				// Update analysis time
				await this.stateManager.updateLastAnalysisTime()

				this.emit({
					type: "cycle_complete",
					timestamp: Date.now(),
					data: { stats },
				})
			}

			return stats
		} catch (error) {
			this.emit({
				type: "error",
				timestamp: Date.now(),
				data: { error: error as Error },
			})
			throw error
		}
	}

	/**
	 * Review a proposal and determine if it should be applied
	 */
	private async reviewProposal(proposal: EvolutionProposal): Promise<boolean> {
		// Check autonomy level
		const canAutoApply = this.canAutoApply(proposal)

		if (canAutoApply && !this.config.councilEnabled) {
			// Auto-approve low-risk proposals when council is disabled
			await this.stateManager.updateProposalStatus(proposal.id, "approved", {
				reviewedBy: "auto",
				reviewNotes: "Auto-approved based on risk level and autonomy settings",
			})
			this.emit({
				type: "proposal_approved",
				timestamp: Date.now(),
				data: { proposal },
			})
			return true
		}

		if (this.council && this.config.councilEnabled) {
			// Use Council for review (supports both simulated and multi-agent)
			const decision = await this.council.reviewProposal(proposal)

			if (decision.approved) {
				await this.stateManager.updateProposalStatus(proposal.id, "approved", {
					reviewedBy: this.council && isMultiAgentCouncil(this.council) ? "multi-agent-council" : "council",
					reviewNotes: decision.reason,
				})
				this.emit({
					type: "proposal_approved",
					timestamp: Date.now(),
					data: { proposal, decision },
				})
				return true
			} else {
				await this.stateManager.updateProposalStatus(proposal.id, "rejected", {
					reviewedBy: this.council && isMultiAgentCouncil(this.council) ? "multi-agent-council" : "council",
					reviewNotes: decision.reason,
				})
				this.emit({
					type: "proposal_rejected",
					timestamp: Date.now(),
					data: { proposal, decision },
				})
				return false
			}
		}

		// Require manual approval for high-risk or when council is disabled
		// Proposal stays pending
		return false
	}

	/**
	 * Check if a proposal can be auto-applied based on autonomy level
	 */
	private canAutoApply(proposal: EvolutionProposal): boolean {
		switch (this.config.autonomyLevel) {
			case 2: // Auto - apply all
				return true
			case 1: // Assisted - apply low-risk only
				return proposal.risk === "low"
			case 0: // Manual - never auto-apply
			default:
				return false
		}
	}

	/**
	 * Apply an approved proposal
	 */
	private async applyProposal(proposal: EvolutionProposal): Promise<boolean> {
		try {
			// Use ChangeApplicator if available (Phase 4A)
			if (this.changeApplicator) {
				const result = await this.changeApplicator.applyProposal(proposal)
				if (result.success) {
					await this.stateManager.updateProposalStatus(proposal.id, "applied", {
						rollbackData: result.rollbackData as unknown as Record<string, unknown>,
					})
					this.emit({
						type: "proposal_applied",
						timestamp: Date.now(),
						data: { proposal },
					})
					return true
				} else {
					await this.stateManager.updateProposalStatus(proposal.id, "failed")
					this.emit({
						type: "proposal_failed",
						timestamp: Date.now(),
						data: {
							proposal,
							error: new Error(result.failedChanges.map((f) => f.error).join("; ")),
						},
					})
					return false
				}
			}

			// Fallback: just mark it as applied
			await this.stateManager.updateProposalStatus(proposal.id, "applied", {
				rollbackData: proposal.payload,
			})

			this.emit({
				type: "proposal_applied",
				timestamp: Date.now(),
				data: { proposal },
			})

			return true
		} catch (error) {
			await this.stateManager.updateProposalStatus(proposal.id, "failed")
			this.emit({
				type: "proposal_failed",
				timestamp: Date.now(),
				data: { proposal, error: error as Error },
			})
			return false
		}
	}

	// ==========================================================================
	// Manual Proposal Actions
	// ==========================================================================

	/**
	 * Manually approve a proposal
	 */
	async approveProposal(proposalId: string, notes?: string): Promise<boolean> {
		const proposal = this.stateManager.getProposal(proposalId)
		if (!proposal || proposal.status !== "pending") {
			return false
		}

		await this.stateManager.updateProposalStatus(proposalId, "approved", {
			reviewedBy: "user",
			reviewNotes: notes ?? "Manually approved",
		})

		this.emit({
			type: "proposal_approved",
			timestamp: Date.now(),
			data: { proposal },
		})

		// Apply if autonomy allows
		if (this.config.autonomyLevel > 0) {
			return await this.applyProposal(proposal)
		}

		return true
	}

	/**
	 * Manually reject a proposal
	 */
	async rejectProposal(proposalId: string, reason?: string): Promise<boolean> {
		const proposal = this.stateManager.getProposal(proposalId)
		if (!proposal || proposal.status !== "pending") {
			return false
		}

		await this.stateManager.updateProposalStatus(proposalId, "rejected", {
			reviewedBy: "user",
			reviewNotes: reason ?? "Manually rejected",
		})

		this.emit({
			type: "proposal_rejected",
			timestamp: Date.now(),
			data: { proposal },
		})

		return true
	}

	/**
	 * Get pending proposals for review
	 */
	getPendingProposals(): EvolutionProposal[] {
		return this.stateManager.getPendingProposals()
	}

	// ==========================================================================
	// Phase 4A: Autonomous Execution API
	// ==========================================================================

	/**
	 * Get autonomous executor (Phase 4A)
	 */
	getAutonomousExecutor(): AutonomousExecutor | null {
		return this.autonomousExecutor
	}

	/**
	 * Get execution scheduler (Phase 4A)
	 */
	getExecutionScheduler(): ExecutionScheduler | null {
		return this.executionScheduler
	}

	/**
	 * Get execution health metrics (Phase 4A)
	 */
	getHealthMetrics(): ExecutionHealthMetrics | null {
		return this.autonomousExecutor?.getHealthMetrics() ?? null
	}

	/**
	 * Force an execution tick (Phase 4A)
	 */
	async forceExecutionTick(): Promise<BatchExecutionResult | null> {
		return this.executionScheduler?.forceTick() ?? null
	}

	/**
	 * Pause autonomous execution (Phase 4A)
	 */
	pauseAutonomousExecution(): void {
		this.executionScheduler?.pause()
	}

	/**
	 * Resume autonomous execution (Phase 4A)
	 */
	resumeAutonomousExecution(): void {
		this.executionScheduler?.resume()
	}

	// ==========================================================================
	// Phase 4B: Multi-Agent Council API
	// ==========================================================================

	/**
	 * Get the current council instance (Phase 4B)
	 */
	getCouncil(): Council | MultiAgentCouncil | null {
		return this.council
	}

	/**
	 * Check if multi-agent council is active (Phase 4B)
	 */
	isMultiAgentCouncilActive(): boolean {
		return this.council !== null && isMultiAgentCouncil(this.council) && this.council.isMultiAgentEnabled()
	}

	/**
	 * Get active multi-agent council execution (Phase 4B)
	 */
	getActiveCouncilExecution(): CouncilExecution | null {
		if (this.council && isMultiAgentCouncil(this.council)) {
			return this.council.getActiveExecution()
		}
		return null
	}

	// ==========================================================================
	// Event System
	// ==========================================================================

	/**
	 * Add event listener
	 */
	on(listener: EvolutionEventListener): () => void {
		this.eventListeners.add(listener)
		return () => this.eventListeners.delete(listener)
	}

	/**
	 * Emit an event
	 */
	private emit(event: EvolutionEvent): void {
		for (const listener of this.eventListeners) {
			try {
				listener(event)
			} catch (error) {
				console.error("[EvolutionEngine] Error in event listener:", error)
			}
		}
	}

	// ==========================================================================
	// Lifecycle
	// ==========================================================================

	/**
	 * Set the council instance
	 */
	setCouncil(council: Council | MultiAgentCouncil): void {
		// Unsubscribe from old council events
		if (this.multiAgentUnsubscribe) {
			this.multiAgentUnsubscribe()
			this.multiAgentUnsubscribe = null
		}

		this.council = council

		// Subscribe to new council events if multi-agent
		if (isMultiAgentCouncil(council)) {
			this.subscribeToMultiAgentEvents(council)
		}

		// Update autonomous executor (only accepts base Council)
		if (this.autonomousExecutor && !isMultiAgentCouncil(council)) {
			this.autonomousExecutor.setCouncil(council)
		}
	}

	/**
	 * Close the engine
	 */
	async close(): Promise<void> {
		// Unsubscribe from council events
		if (this.multiAgentUnsubscribe) {
			this.multiAgentUnsubscribe()
			this.multiAgentUnsubscribe = null
		}

		// Stop scheduler
		if (this.executionScheduler) {
			this.executionScheduler.dispose()
			this.emit({
				type: "scheduler_stopped",
				timestamp: Date.now(),
			})
		}

		await this.stateManager.close()
		this.eventListeners.clear()
	}
}
