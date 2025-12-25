/**
 * EvolutionEngine - Main orchestrator for the Darwin evolution loop
 *
 * Responsibilities:
 * - Orchestrate the complete evolution cycle
 * - Manage proposal lifecycle (pending → approved/rejected → applied)
 * - Coordinate between components (TraceCapture, PatternDetector, Council)
 * - Emit events for UI integration
 */

import type { DarwinConfig, LearningSignal, EvolutionProposal, EvolutionState } from "@roo-code/types"
import { DEFAULT_DARWIN_CONFIG } from "@roo-code/types"
import { ProposalGenerator } from "../proposals"
import { StateManager } from "../state"
import type { Council, CouncilDecision } from "../council"

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

	/** Council instance for proposal review */
	council?: Council

	/** Auto-run analysis on signal threshold */
	autoRunThreshold?: number
}

/**
 * EvolutionEngine orchestrates the complete evolution cycle
 */
export class EvolutionEngine {
	private config: DarwinConfig
	private workspacePath: string
	private council: Council | null

	private stateManager: StateManager
	private proposalGenerator: ProposalGenerator

	private isInitialized: boolean = false
	private eventListeners: Set<EvolutionEventListener> = new Set()

	/** Signals awaiting analysis */
	private pendingSignals: LearningSignal[] = []
	private autoRunThreshold: number

	constructor(engineConfig: EvolutionEngineConfig) {
		this.config = engineConfig.darwinConfig ?? DEFAULT_DARWIN_CONFIG
		this.workspacePath = engineConfig.workspacePath
		this.council = engineConfig.council ?? null
		this.autoRunThreshold = engineConfig.autoRunThreshold ?? 5

		this.stateManager = new StateManager({ workspacePath: this.workspacePath })
		this.proposalGenerator = new ProposalGenerator({ config: this.config })
	}

	/**
	 * Initialize the evolution engine
	 */
	async initialize(): Promise<void> {
		if (this.isInitialized) {
			return
		}

		await this.stateManager.initialize()
		this.isInitialized = true
	}

	/**
	 * Update configuration
	 */
	async updateConfig(config: DarwinConfig): Promise<void> {
		this.config = config
		this.proposalGenerator.updateConfig(config)
		await this.stateManager.updateConfig(config)
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

			// 3. Review proposals
			for (const proposal of proposals) {
				const shouldApply = await this.reviewProposal(proposal)

				if (shouldApply) {
					// 4. Apply proposal
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
			// Use Council for review
			const decision = await this.council.reviewProposal(proposal)

			if (decision.approved) {
				await this.stateManager.updateProposalStatus(proposal.id, "approved", {
					reviewedBy: "council",
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
					reviewedBy: "council",
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
			// For now, we just mark it as applied
			// Actual application logic will be implemented per proposal type
			await this.stateManager.updateProposalStatus(proposal.id, "applied", {
				rollbackData: proposal.payload, // Store original for rollback
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
	setCouncil(council: Council): void {
		this.council = council
	}

	/**
	 * Close the engine
	 */
	async close(): Promise<void> {
		await this.stateManager.close()
		this.eventListeners.clear()
	}
}
