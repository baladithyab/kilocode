import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { EvolutionEngine } from "../core/EvolutionEngine"
import { DEFAULT_DARWIN_CONFIG } from "@roo-code/types"
import type { LearningSignal, EvolutionProposal } from "@roo-code/types"
import type { TaskDelegator } from "../council"
import * as fs from "fs/promises"
import * as path from "path"
import { ChangeApplicator } from "../application/ChangeApplicator"

// Mock ChangeApplicator
vi.mock("../application/ChangeApplicator", () => {
	return {
		ChangeApplicator: vi.fn().mockImplementation(() => ({
			applyProposal: vi.fn().mockResolvedValue({
				success: true,
				appliedChanges: [],
				rollbackData: {},
			}),
			rollback: vi.fn().mockResolvedValue(undefined),
		})),
	}
})

describe("Phase 4 Integration: Autonomous Evolution System", () => {
	let engine: EvolutionEngine
	let workspacePath: string
	let mockDelegator: TaskDelegator

	beforeEach(async () => {
		// Create temp workspace
		workspacePath = path.join(process.cwd(), "temp-test-workspace-" + Date.now())
		await fs.mkdir(workspacePath, { recursive: true })

		// Mock TaskDelegator for Council
		mockDelegator = {
			getCurrentTask: vi.fn().mockReturnValue({ taskId: "mock-parent-task" }),
			delegateParentAndOpenChild: vi.fn().mockResolvedValue({
				taskId: "mock-child-task",
				success: true,
				userDecision: "approved",
				userFeedback: "Looks good",
			}),
		} as unknown as TaskDelegator

		// Initialize Engine with Phase 4 features enabled
		engine = new EvolutionEngine({
			darwinConfig: {
				...DEFAULT_DARWIN_CONFIG,
				enabled: true,
				autonomyLevel: 2, // Full autonomy
				councilEnabled: true,
				// Phase 5 flags
				enableAutonomousExecution: true,
				enableSkillSynthesis: true,
				enableMultiAgentCouncil: true,
				enableSelfHealing: true,
				enablePerformanceAnalytics: true,
			},
			workspacePath,
			enableAutonomousExecution: true,
			enableRealMultiAgent: true,
			taskDelegator: mockDelegator,
			autoRunThreshold: 1, // Run immediately on 1 signal
			// Configure autonomous executor for testing
			autonomousExecutorConfig: {
				enabled: true,
				autonomyLevel: 2,
				minConfidence: 0.5, // Lower threshold for testing
				requireCouncilForMediumRisk: false, // Skip council for medium risk
			},
		})

		await engine.initialize()
	})

	afterEach(async () => {
		await engine.close()
		await fs.rm(workspacePath, { recursive: true, force: true })
		vi.clearAllMocks()
	})

	it("should execute complete autonomous loop: Signal -> Proposal -> Auto-Approval -> Execution", async () => {
		const signal: LearningSignal = {
			id: "sig-1",
			type: "success_pattern",
			confidence: 0.9,
			sourceEventIds: [],
			detectedAt: Date.now(),
			context: {
				file: "src/test.ts",
				content: "User liked this pattern",
			},
			description: "Positive feedback on pattern",
		}

		// Setup event listener to track flow
		const events: string[] = []
		engine.on((event) => {
			events.push(event.type)
		})

		// Add signal - should trigger auto-run due to threshold=1
		await engine.addSignal(signal)

		// Wait for processing (async)
		await new Promise((resolve) => setTimeout(resolve, 100))

		// Verify flow
		expect(events).toContain("signal_detected")
		expect(events).toContain("proposal_generated")
		// Should be auto-approved and executed
		expect(events).toContain("execution_started")
		expect(events).toContain("execution_completed")
		expect(events).toContain("cycle_complete")

		// Verify state
		const state = engine.getState()
		expect(state.appliedProposals.length).toBe(1)
	})

	it("should escalate high-risk proposals to Council", async () => {
		// Configure for manual mode (autonomy level 0) - Council review required
		await engine.updateConfig({
			...DEFAULT_DARWIN_CONFIG,
			enabled: true,
			autonomyLevel: 0, // Manual - requires Council review
			councilEnabled: true,
		})

		const signal: LearningSignal = {
			id: "sig-2",
			type: "doom_loop",
			confidence: 0.9,
			sourceEventIds: [],
			detectedAt: Date.now(),
			context: { error: "Critical failure" },
			description: "Critical error detected",
		}

		const events: string[] = []
		engine.on((event) => events.push(event.type))

		await engine.addSignal(signal)
		await new Promise((resolve) => setTimeout(resolve, 100))

		// Should generate a proposal
		expect(events).toContain("proposal_generated")

		// With autonomyLevel 0 and councilEnabled, the Council is consulted
		// The mock delegator approves, so the proposal should be approved and applied
		expect(events).toContain("proposal_approved")

		// The proposal was processed (not left pending because Council made a decision)
		const state = engine.getState()
		expect(state.appliedProposals.length).toBeGreaterThanOrEqual(1)
	})

	it("should use Multi-Agent Council for review when enabled", async () => {
		// Enable Multi-Agent Council
		await engine.updateConfig({
			...DEFAULT_DARWIN_CONFIG,
			enabled: true,
			autonomyLevel: 0, // Manual/Council review needed
			councilEnabled: true,
		})

		// Ensure multi-agent is active
		engine.updateMultiAgentConfig({ enableRealMultiAgent: true })
		expect(engine.isMultiAgentCouncilActive()).toBe(true)

		const signal: LearningSignal = {
			id: "sig-3",
			type: "inefficiency",
			confidence: 0.8,
			sourceEventIds: [],
			detectedAt: Date.now(),
			context: { file: "src/app.ts" },
			description: "Improvement suggestion",
		}

		const events: string[] = []
		engine.on((event) => events.push(event.type))

		// Add signal and let the engine process it
		await engine.addSignal(signal)
		await new Promise((resolve) => setTimeout(resolve, 100))

		// Proposal should be generated and processed through Council
		expect(events).toContain("proposal_generated")

		// The mock delegator approves, so proposal should be approved
		expect(events).toContain("proposal_approved")

		// Verify the delegator was called (Council used multi-agent path)
		expect(mockDelegator.delegateParentAndOpenChild).toHaveBeenCalled()
	})

	it("should aggregate analytics data correctly", async () => {
		// Generate some activity
		const signal: LearningSignal = {
			id: "sig-4",
			type: "success_pattern",
			confidence: 0.9,
			sourceEventIds: [],
			detectedAt: Date.now(),
			context: {},
			description: "Test signal",
		}

		await engine.addSignal(signal)
		await new Promise((resolve) => setTimeout(resolve, 100))

		// Check health metrics
		const health = engine.getHealthMetrics()
		expect(health).toBeDefined()
		if (health) {
			expect(health.status).toBe("healthy")
			expect(health.executionsToday).toBeGreaterThanOrEqual(1)
		}

		// Check state stats
		const state = engine.getState()
		expect(state.recentSignals.length).toBeGreaterThan(0)
		expect(state.appliedProposals.length).toBeGreaterThan(0)
	})

	it("should handle execution failures gracefully", async () => {
		// Create a fresh workspace for this test to avoid state pollution
		const failureTestWorkspace = path.join(process.cwd(), "temp-test-workspace-failure-" + Date.now())
		await fs.mkdir(failureTestWorkspace, { recursive: true })

		// Save original mock and replace with failure mock
		const MockChangeApplicator = vi.mocked(ChangeApplicator)
		const originalImpl = MockChangeApplicator.getMockImplementation()

		MockChangeApplicator.mockImplementation(
			() =>
				({
					applyProposal: vi.fn().mockResolvedValue({
						success: false,
						failedChanges: [{ error: "Simulated failure" }],
						appliedChanges: [],
						rollbackData: {},
					}),
					rollback: vi.fn().mockResolvedValue(undefined),
				}) as unknown as ChangeApplicator,
		)

		try {
			// Create a fresh engine with the failure mock
			const failureEngine = new EvolutionEngine({
				darwinConfig: {
					...DEFAULT_DARWIN_CONFIG,
					enabled: true,
					autonomyLevel: 2,
				},
				workspacePath: failureTestWorkspace,
				enableAutonomousExecution: true,
				autoRunThreshold: 1,
				// Configure autonomous executor for testing
				autonomousExecutorConfig: {
					enabled: true,
					autonomyLevel: 2,
					minConfidence: 0.5, // Lower threshold for testing
					requireCouncilForMediumRisk: false,
				},
			})
			await failureEngine.initialize()

			const signal: LearningSignal = {
				id: "sig-5",
				type: "success_pattern",
				confidence: 0.9,
				sourceEventIds: [],
				detectedAt: Date.now(),
				context: {},
				description: "Test signal for failure",
			}

			const events: string[] = []
			failureEngine.on((event) => events.push(event.type))

			await failureEngine.addSignal(signal)
			await new Promise((resolve) => setTimeout(resolve, 100))

			// With execution failure, we expect these events
			// Note: AutonomousExecutor emits execution_started and execution_failed
			expect(events).toContain("execution_started")
			expect(events).toContain("execution_failed")

			// Verify the cycle completed (even with failure)
			expect(events).toContain("cycle_complete")

			// Cleanup
			await failureEngine.close()
		} finally {
			// Restore original mock
			if (originalImpl) {
				MockChangeApplicator.mockImplementation(originalImpl)
			}
			await fs.rm(failureTestWorkspace, { recursive: true, force: true })
		}
	})
})
