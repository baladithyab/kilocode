/**
 * Tests for AutonomousExecutor
 */
import { describe, it, expect, beforeEach, vi } from "vitest"
import type { EvolutionProposal, ChangeApplicatorResult } from "@roo-code/types"
import { AutonomousExecutor } from "../AutonomousExecutor"
import type { StateManager } from "../../state/StateManager"
import type { ChangeApplicator } from "../../application/ChangeApplicator"

function createProposal(overrides: Partial<EvolutionProposal> = {}): EvolutionProposal {
	return {
		id: `proposal-${Date.now()}-${Math.random().toString(36).slice(2)}`,
		type: "rule_update",
		status: "pending",
		risk: "low",
		title: "Test Proposal",
		description: "A test proposal",
		payload: {},
		createdAt: Date.now(),
		updatedAt: Date.now(),
		...overrides,
	}
}

function createMockStateManager(): StateManager {
	return {
		initialize: vi.fn(),
		getState: vi.fn().mockReturnValue({ config: { autonomyLevel: 1 } }),
		updateConfig: vi.fn(),
		addProposal: vi.fn(),
		getProposal: vi.fn(),
		getPendingProposals: vi.fn().mockReturnValue([]),
		updateProposalStatus: vi.fn(),
		addSignal: vi.fn(),
		getSignal: vi.fn(),
		getRecentSignals: vi.fn().mockReturnValue([]),
		markDoomLoopResolved: vi.fn(),
		updateLastAnalysisTime: vi.fn(),
		flushState: vi.fn(),
		close: vi.fn(),
		reset: vi.fn(),
	} as unknown as StateManager
}

function createMockChangeApplicator(): ChangeApplicator {
	const successResult: ChangeApplicatorResult = {
		success: true,
		appliedCount: 1,
		failedCount: 0,
		appliedChanges: [{ id: "change-1", type: "rule_add", target: "test", content: "test" }],
		failedChanges: [],
		rollbackData: [],
	}
	return {
		applyProposal: vi.fn().mockResolvedValue(successResult),
		rollback: vi.fn().mockResolvedValue(successResult),
	} as unknown as ChangeApplicator
}

describe("AutonomousExecutor", () => {
	let executor: AutonomousExecutor
	let stateManager: StateManager
	let changeApplicator: ChangeApplicator

	beforeEach(() => {
		stateManager = createMockStateManager()
		changeApplicator = createMockChangeApplicator()
		// Use minConfidence: 0.5 so proposals with base confidence 0.7 can be approved
		executor = new AutonomousExecutor(
			{ enabled: true, autonomyLevel: 1, minConfidence: 0.5 },
			stateManager,
			changeApplicator,
		)
	})

	describe("Basic Execution", () => {
		it("should process a proposal successfully", async () => {
			const proposal = createProposal({ type: "rule_update", payload: { scope: "project" } })
			const result = await executor.processProposal(proposal)
			expect(result.proposalId).toBe(proposal.id)
			expect(result.success).toBe(true)
		})

		it("should call change applicator for approved proposals", async () => {
			const proposal = createProposal({ type: "rule_update", payload: { scope: "project" } })
			await executor.processProposal(proposal)
			expect(changeApplicator.applyProposal).toHaveBeenCalledWith(proposal)
		})
	})

	describe("Autonomy Level 0 (Manual)", () => {
		beforeEach(() => {
			executor = new AutonomousExecutor(
				{ enabled: true, autonomyLevel: 0, minConfidence: 0.5 },
				stateManager,
				changeApplicator,
			)
		})

		it("should defer all proposals at level 0", async () => {
			const proposal = createProposal({ type: "rule_update" })
			const result = await executor.processProposal(proposal)
			expect(result.decision.status).toBe("deferred")
		})

		it("should not call change applicator at level 0", async () => {
			const proposal = createProposal({ type: "rule_update" })
			await executor.processProposal(proposal)
			expect(changeApplicator.applyProposal).not.toHaveBeenCalled()
		})
	})

	describe("Autonomy Level 1 (Assisted)", () => {
		it("should approve low risk proposals", async () => {
			const proposal = createProposal({ type: "rule_update", payload: { scope: "project" } })
			const result = await executor.processProposal(proposal)
			expect(result.decision.status).toBe("approved")
		})

		it("should defer medium risk proposals at level 1", async () => {
			const proposal = createProposal({ type: "config_change", payload: { scope: "global" } })
			const result = await executor.processProposal(proposal)
			// Medium risk is not auto-approved at level 1
			expect(["deferred", "escalated"]).toContain(result.decision.status)
		})
	})

	describe("Autonomy Level 2 (Auto)", () => {
		beforeEach(() => {
			executor = new AutonomousExecutor(
				{ enabled: true, autonomyLevel: 2, minConfidence: 0.5, requireCouncilForMediumRisk: false },
				stateManager,
				changeApplicator,
			)
		})

		it("should approve low risk proposals", async () => {
			const proposal = createProposal({ type: "rule_update", payload: { scope: "project" } })
			const result = await executor.processProposal(proposal)
			expect(result.decision.status).toBe("approved")
		})

		it("should approve medium risk proposals at level 2", async () => {
			const proposal = createProposal({ type: "config_change", payload: { scope: "project" } })
			const result = await executor.processProposal(proposal)
			expect(result.decision.status).toBe("approved")
		})
	})

	describe("Batch Processing", () => {
		it("should process multiple proposals", async () => {
			const proposals = [
				createProposal({ payload: { scope: "project" } }),
				createProposal({ payload: { scope: "project" } }),
				createProposal({ payload: { scope: "project" } }),
			]
			const result = await executor.processProposals(proposals)
			expect(result.results).toHaveLength(3)
		})

		it("should respect maxPerCycle limit", async () => {
			executor = new AutonomousExecutor(
				{ enabled: true, autonomyLevel: 1, maxPerCycle: 2, minConfidence: 0.5 },
				stateManager,
				changeApplicator,
			)
			const proposals = [
				createProposal({ payload: { scope: "project" } }),
				createProposal({ payload: { scope: "project" } }),
				createProposal({ payload: { scope: "project" } }),
			]
			const result = await executor.processProposals(proposals)
			expect(result.results).toHaveLength(2)
		})
	})

	describe("Health Metrics", () => {
		it("should track execution metrics", async () => {
			const proposal = createProposal({ type: "rule_update", payload: { scope: "project" } })
			await executor.processProposal(proposal)
			const metrics = executor.getHealthMetrics()
			expect(metrics.executionsToday).toBe(1)
		})

		it("should calculate success rate", async () => {
			const proposal = createProposal({ type: "rule_update", payload: { scope: "project" } })
			await executor.processProposal(proposal)
			const metrics = executor.getHealthMetrics()
			expect(metrics.successRate).toBe(1)
		})

		it("should track failures", async () => {
			const failResult: ChangeApplicatorResult = {
				success: false,
				appliedCount: 0,
				failedCount: 1,
				appliedChanges: [],
				failedChanges: [
					{
						change: { id: "c1", type: "rule_add", target: "test" },
						error: "Failed",
					},
				],
				rollbackData: [],
			}
			;(changeApplicator.applyProposal as ReturnType<typeof vi.fn>).mockResolvedValue(failResult)
			const proposal = createProposal({ type: "rule_update", payload: { scope: "project" } })
			await executor.processProposal(proposal)
			const metrics = executor.getHealthMetrics()
			expect(metrics.failuresToday).toBe(1)
		})
	})

	describe("Event Emission", () => {
		it("should emit execution_started event", async () => {
			const events: string[] = []
			executor.on((event) => events.push(event.type))
			const proposal = createProposal({ type: "rule_update", payload: { scope: "project" } })
			await executor.processProposal(proposal)
			expect(events).toContain("execution_started")
		})

		it("should emit execution_completed on success", async () => {
			const events: string[] = []
			executor.on((event) => events.push(event.type))
			const proposal = createProposal({ type: "rule_update", payload: { scope: "project" } })
			await executor.processProposal(proposal)
			expect(events).toContain("execution_completed")
		})

		it("should emit approval_required for deferred proposals", async () => {
			executor = new AutonomousExecutor(
				{ enabled: true, autonomyLevel: 0, minConfidence: 0.5 },
				stateManager,
				changeApplicator,
			)
			const events: string[] = []
			executor.on((event) => events.push(event.type))
			await executor.processProposal(createProposal())
			expect(events).toContain("approval_required")
		})
	})

	describe("Configuration", () => {
		it("should update configuration", () => {
			executor.updateConfig({ dailyLimit: 100 })
			const metrics = executor.getHealthMetrics()
			expect(metrics.dailyLimit).toBe(100)
		})

		it("should handle dry run mode", async () => {
			executor = new AutonomousExecutor(
				{ enabled: true, autonomyLevel: 1, dryRun: true, minConfidence: 0.5 },
				stateManager,
				changeApplicator,
			)
			const proposal = createProposal({ payload: { scope: "project" } })
			const result = await executor.processProposal(proposal)
			expect(result.decision.status).toBe("deferred")
			expect(changeApplicator.applyProposal).not.toHaveBeenCalled()
		})

		it("should handle disabled executor", async () => {
			executor = new AutonomousExecutor(
				{ enabled: false, autonomyLevel: 1, minConfidence: 0.5 },
				stateManager,
				changeApplicator,
			)
			const proposal = createProposal({ payload: { scope: "project" } })
			const result = await executor.processProposal(proposal)
			expect(result.decision.status).toBe("deferred")
		})
	})

	describe("Daily Limits", () => {
		it("should respect daily execution limit", async () => {
			executor = new AutonomousExecutor(
				{ enabled: true, autonomyLevel: 1, dailyLimit: 1, minConfidence: 0.5 },
				stateManager,
				changeApplicator,
			)
			const proposal1 = createProposal({ payload: { scope: "project" } })
			const proposal2 = createProposal({ payload: { scope: "project" } })

			await executor.processProposal(proposal1)
			const result2 = await executor.processProposal(proposal2)

			expect(result2.success).toBe(false)
			expect(result2.error).toContain("Daily execution limit reached")
		})
	})

	describe("Risk History", () => {
		it("should get and set risk history", () => {
			const history = executor.getRiskHistory()
			expect(history).toBeDefined()
			expect(history.totalByType).toBeDefined()
		})
	})
})
