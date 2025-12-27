/**
 * StateManager - Persist evolution state to disk
 *
 * Responsibilities:
 * - Persist evolution state to `.kilocode/evolution/state.json`
 * - Track active proposals
 * - Maintain evolution history
 * - Handle state recovery after crashes
 */

import * as fs from "fs/promises"
import * as path from "path"
import type { EvolutionState, EvolutionProposal, LearningSignal, DarwinConfig } from "@roo-code/types"
import { DEFAULT_EVOLUTION_STATE, DEFAULT_DARWIN_CONFIG, evolutionStateSchema } from "@roo-code/types"
import { proposalQueries } from "../db"

/** Storage file paths */
const EVOLUTION_DIR = ".kilocode/evolution"
const STATE_FILE = "state.json"
const PROPOSALS_DIR = "proposals"

/** Configuration for StateManager */
export interface StateManagerConfig {
	/** Workspace path where state is stored */
	workspacePath: string

	/** Maximum number of applied proposals to keep in history */
	maxAppliedHistory?: number

	/** Maximum number of recent signals to keep */
	maxRecentSignals?: number

	/** Storage backend to use (default: "jsonl") */
	storageBackend?: "jsonl" | "sqlite"
}

/**
 * StateManager handles persistence of evolution state
 */
export class StateManager {
	private workspacePath: string
	private maxAppliedHistory: number
	private maxRecentSignals: number
	private storageBackend: "jsonl" | "sqlite"

	private state: EvolutionState
	private isInitialized: boolean = false
	private isDirty: boolean = false
	private saveDebounceTimer: NodeJS.Timeout | null = null

	/** Stored proposals (separate from state for performance) */
	private proposals: Map<string, EvolutionProposal> = new Map()

	/** Stored signals (separate from state for performance) */
	private signals: Map<string, LearningSignal> = new Map()

	constructor(config: StateManagerConfig) {
		this.workspacePath = config.workspacePath
		this.maxAppliedHistory = config.maxAppliedHistory ?? 100
		this.maxRecentSignals = config.maxRecentSignals ?? 50
		this.storageBackend = config.storageBackend ?? "jsonl"

		this.state = { ...DEFAULT_EVOLUTION_STATE }
	}

	/**
	 * Initialize state manager - load existing state or create new
	 */
	async initialize(): Promise<void> {
		if (this.isInitialized) {
			return
		}

		// Ensure directories exist
		await this.ensureDirectories()

		// Load existing state or create default
		await this.loadState()

		// Load proposals
		await this.loadProposals()

		this.isInitialized = true
	}

	/**
	 * Get current state (read-only)
	 */
	getState(): Readonly<EvolutionState> {
		return this.state
	}

	/**
	 * Update Darwin configuration
	 */
	async updateConfig(config: DarwinConfig): Promise<void> {
		this.state.config = { ...config }
		this.state.lastUpdated = Date.now()
		await this.saveState()
	}

	// ==========================================================================
	// Proposal Management
	// ==========================================================================

	/**
	 * Add a new proposal
	 */
	async addProposal(proposal: EvolutionProposal): Promise<void> {
		this.proposals.set(proposal.id, proposal)
		this.state.pendingProposals.push(proposal.id)
		this.state.stats.totalProposals++
		this.state.lastUpdated = Date.now()

		// Save proposal to disk
		await this.saveProposal(proposal)
		await this.saveState()
	}

	/**
	 * Get a proposal by ID
	 */
	getProposal(id: string): EvolutionProposal | undefined {
		return this.proposals.get(id)
	}

	/**
	 * Get all pending proposals
	 */
	getPendingProposals(): EvolutionProposal[] {
		return this.state.pendingProposals
			.map((id) => this.proposals.get(id))
			.filter((p): p is EvolutionProposal => p !== undefined)
	}

	/**
	 * Update proposal status
	 */
	async updateProposalStatus(
		proposalId: string,
		status: EvolutionProposal["status"],
		options?: {
			reviewedBy?: string
			reviewNotes?: string
			rollbackData?: Record<string, unknown>
		},
	): Promise<void> {
		const proposal = this.proposals.get(proposalId)
		if (!proposal) {
			throw new Error(`Proposal not found: ${proposalId}`)
		}

		// Update proposal
		proposal.status = status
		proposal.updatedAt = Date.now()
		if (options?.reviewedBy) proposal.reviewedBy = options.reviewedBy
		if (options?.reviewNotes) proposal.reviewNotes = options.reviewNotes
		if (options?.rollbackData) proposal.rollbackData = options.rollbackData

		// Update state lists
		if (status === "approved" || status === "applied" || status === "rejected" || status === "failed") {
			// Remove from pending
			this.state.pendingProposals = this.state.pendingProposals.filter((id) => id !== proposalId)
		}

		if (status === "applied") {
			this.state.appliedProposals.push(proposalId)
			this.state.stats.approvedProposals++

			// Trim history if needed
			while (this.state.appliedProposals.length > this.maxAppliedHistory) {
				this.state.appliedProposals.shift()
			}
		}

		if (status === "rejected") {
			this.state.stats.rejectedProposals++
		}

		this.state.lastUpdated = Date.now()

		// Save changes
		await this.saveProposal(proposal)
		await this.saveState()
	}

	// ==========================================================================
	// Signal Management
	// ==========================================================================

	/**
	 * Add a learning signal
	 */
	async addSignal(signal: LearningSignal): Promise<void> {
		this.signals.set(signal.id, signal)
		this.state.recentSignals.push(signal.id)

		// Track doom loops
		if (signal.type === "doom_loop") {
			this.state.stats.doomLoopsDetected++
		}

		// Trim recent signals if needed
		while (this.state.recentSignals.length > this.maxRecentSignals) {
			const oldId = this.state.recentSignals.shift()
			if (oldId) this.signals.delete(oldId)
		}

		this.state.lastUpdated = Date.now()
		await this.saveState()
	}

	/**
	 * Get a signal by ID
	 */
	getSignal(id: string): LearningSignal | undefined {
		return this.signals.get(id)
	}

	/**
	 * Get recent signals
	 */
	getRecentSignals(): LearningSignal[] {
		return this.state.recentSignals
			.map((id) => this.signals.get(id))
			.filter((s): s is LearningSignal => s !== undefined)
	}

	/**
	 * Mark a doom loop as resolved
	 */
	async markDoomLoopResolved(): Promise<void> {
		this.state.stats.doomLoopsResolved++
		this.state.lastUpdated = Date.now()
		await this.saveState()
	}

	// ==========================================================================
	// Analysis Tracking
	// ==========================================================================

	/**
	 * Update last analysis time
	 */
	async updateLastAnalysisTime(): Promise<void> {
		this.state.stats.lastAnalysisTime = Date.now()
		this.state.lastUpdated = Date.now()
		await this.saveState()
	}

	// ==========================================================================
	// Persistence Methods
	// ==========================================================================

	private get statePath(): string {
		return path.join(this.workspacePath, EVOLUTION_DIR, STATE_FILE)
	}

	private get proposalsPath(): string {
		return path.join(this.workspacePath, EVOLUTION_DIR, PROPOSALS_DIR)
	}

	/**
	 * Ensure required directories exist
	 */
	private async ensureDirectories(): Promise<void> {
		await fs.mkdir(path.join(this.workspacePath, EVOLUTION_DIR), { recursive: true })
		await fs.mkdir(this.proposalsPath, { recursive: true })
	}

	/**
	 * Load state from disk
	 */
	private async loadState(): Promise<void> {
		try {
			const data = await fs.readFile(this.statePath, "utf-8")
			const parsed = JSON.parse(data)

			// Validate with schema
			const result = evolutionStateSchema.safeParse(parsed)
			if (result.success) {
				this.state = result.data
			} else {
				console.warn("[StateManager] Invalid state file, using defaults:", result.error)
				this.state = { ...DEFAULT_EVOLUTION_STATE }
			}
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") {
				// File doesn't exist, use defaults
				this.state = { ...DEFAULT_EVOLUTION_STATE }
				await this.saveState()
			} else {
				console.error("[StateManager] Error loading state:", error)
				throw error
			}
		}
	}

	/**
	 * Save state to disk with debouncing
	 */
	private async saveState(): Promise<void> {
		if (this.saveDebounceTimer) {
			clearTimeout(this.saveDebounceTimer)
		}

		this.isDirty = true

		// Debounce writes to avoid excessive I/O
		this.saveDebounceTimer = setTimeout(async () => {
			await this.flushState()
		}, 100)
	}

	/**
	 * Immediately flush state to disk
	 */
	async flushState(): Promise<void> {
		if (!this.isDirty) return

		try {
			const data = JSON.stringify(this.state, null, 2)
			await fs.writeFile(this.statePath, data, "utf-8")
			this.isDirty = false
		} catch (error) {
			console.error("[StateManager] Error saving state:", error)
			throw error
		}
	}

	/**
	 * Load proposals from disk
	 */
	private async loadProposals(): Promise<void> {
		if (this.storageBackend === "sqlite") {
			try {
				// Load pending proposals
				const pending = await proposalQueries.getPending()
				for (const p of pending) {
					const proposal: EvolutionProposal = {
						id: p.id,
						type: p.type as any,
						title: p.title,
						description: p.description,
						payload: p.payload ? (typeof p.payload === "string" ? JSON.parse(p.payload) : p.payload) : {},
						risk: p.risk as any,
						status: p.status as any,
						sourceSignalId: p.sourceSignalId || undefined,
						reviewedBy: p.reviewedBy || undefined,
						reviewNotes: p.reviewNotes || undefined,
						rollbackData: p.rollbackData
							? typeof p.rollbackData === "string"
								? JSON.parse(p.rollbackData)
								: p.rollbackData
							: undefined,
						createdAt: p.createdAt.getTime(),
						updatedAt: p.updatedAt.getTime(),
					}
					this.proposals.set(proposal.id, proposal)

					// Ensure it's in pending list if not already
					if (!this.state.pendingProposals.includes(proposal.id)) {
						this.state.pendingProposals.push(proposal.id)
					}
				}
			} catch (error) {
				console.error("[StateManager] Error loading proposals from SQLite:", error)
			}
			return
		}

		try {
			const files = await fs.readdir(this.proposalsPath)
			const jsonFiles = files.filter((f) => f.endsWith(".json"))

			for (const file of jsonFiles) {
				try {
					const filePath = path.join(this.proposalsPath, file)
					const data = await fs.readFile(filePath, "utf-8")
					const proposal = JSON.parse(data) as EvolutionProposal
					this.proposals.set(proposal.id, proposal)
				} catch (error) {
					console.warn(`[StateManager] Error loading proposal ${file}:`, error)
				}
			}
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
				console.error("[StateManager] Error loading proposals:", error)
			}
		}
	}

	/**
	 * Save a proposal to disk
	 */
	private async saveProposal(proposal: EvolutionProposal): Promise<void> {
		if (this.storageBackend === "sqlite") {
			try {
				// Check if exists
				const existing = await proposalQueries.getById(proposal.id)
				if (existing) {
					await proposalQueries.updateStatus(proposal.id, proposal.status, proposal.reviewNotes)
				} else {
					await proposalQueries.create({
						id: proposal.id,
						type: proposal.type,
						title: proposal.title,
						description: proposal.description,
						payload: JSON.stringify(proposal.payload),
						risk: proposal.risk,
						status: proposal.status,
						sourceSignalId: proposal.sourceSignalId,
						reviewedBy: proposal.reviewedBy,
						reviewNotes: proposal.reviewNotes,
						rollbackData: proposal.rollbackData ? JSON.stringify(proposal.rollbackData) : undefined,
						createdAt: new Date(proposal.createdAt),
						updatedAt: new Date(proposal.updatedAt),
					})
				}
			} catch (error) {
				console.error("[StateManager] Error saving proposal to SQLite:", error)
			}
			return
		}

		const filePath = path.join(this.proposalsPath, `${proposal.id}.json`)
		const data = JSON.stringify(proposal, null, 2)
		await fs.writeFile(filePath, data, "utf-8")
	}

	/**
	 * Close the state manager
	 */
	async close(): Promise<void> {
		if (this.saveDebounceTimer) {
			clearTimeout(this.saveDebounceTimer)
		}
		await this.flushState()
	}

	/**
	 * Reset state (for testing)
	 */
	async reset(): Promise<void> {
		this.state = { ...DEFAULT_EVOLUTION_STATE }
		this.proposals.clear()
		this.signals.clear()
		this.isInitialized = false
	}
}
