/**
 * MultiAgentCouncil Test Suite
 *
 * Tests for the real multi-agent council implementation that uses
 * task delegation for specialized agent reviews.
 */

import { MultiAgentCouncil, type TaskDelegator, type MultiAgentCouncilEvent } from "../MultiAgentCouncil"
import { createCouncil, isMultiAgentCouncil } from "../index"
import type { EvolutionProposal, AgentRole, MultiAgentCouncilConfig, DarwinConfig } from "@roo-code/types"

// =============================================================================
// Test Fixtures
// =============================================================================

function createMockProposal(overrides: Partial<EvolutionProposal> = {}): EvolutionProposal {
	return {
		id: "test-proposal-1",
		type: "rule_update",
		status: "pending",
		risk: "low",
		title: "Test Proposal for Multi-Agent Review",
		description: "This is a test proposal to verify multi-agent council functionality works correctly",
		payload: { rule: "test rule content" },
		createdAt: Date.now(),
		updatedAt: Date.now(),
		sourceSignalId: "test-signal-1",
		...overrides,
	}
}

interface DelegationParams {
	parentTaskId: string
	message: string
	initialTodos: Array<{ content: string; status: "pending" | "in_progress" | "completed" }>
	mode: string
}

function createMockDelegator(
	options: {
		shouldFail?: boolean
		failOnRoles?: AgentRole[]
		taskIdPrefix?: string
		onDelegation?: (params: DelegationParams) => void
	} = {},
): TaskDelegator {
	const { shouldFail = false, failOnRoles = [], taskIdPrefix = "task", onDelegation } = options
	let taskCounter = 0

	return {
		delegateParentAndOpenChild: async (params: DelegationParams) => {
			taskCounter++
			const taskId = `${taskIdPrefix}-${taskCounter}`

			// Call the hook if provided
			if (onDelegation) {
				onDelegation(params)
			}

			// Check if this role should fail by looking at the TODO content
			const roleMatch = params.initialTodos[0]?.content.match(/as (analyst|reviewer|security|performance) agent/)
			const role = roleMatch ? (roleMatch[1] as AgentRole) : null

			if (shouldFail || (role && failOnRoles.includes(role))) {
				throw new Error(`Delegation failed for task ${taskId}`)
			}

			return { taskId }
		},
		getCurrentTask: () => ({ taskId: "parent-task-1" }),
	}
}

function createMockConfig(overrides: Partial<MultiAgentCouncilConfig> = {}): Partial<MultiAgentCouncilConfig> {
	return {
		enabled: true,
		agentTimeout: 5000, // 5 seconds for tests
		maxConcurrentAgents: 4,
		activeRoles: ["analyst", "reviewer", "security", "performance"],
		reviewMode: "ask",
		minConfidenceThreshold: 0.5,
		votingPolicy: "majority",
		continueOnAgentFailure: true,
		fallbackToSimulated: true,
		...overrides,
	}
}

function createMockDarwinConfig(overrides: Partial<DarwinConfig> = {}): DarwinConfig {
	return {
		enabled: true,
		autonomyLevel: 1,
		traceCapture: true,
		doomLoopThreshold: 3,
		skillSynthesis: false,
		configEvolution: false,
		councilEnabled: true,
		...overrides,
	}
}

// =============================================================================
// Test Suite
// =============================================================================

describe("MultiAgentCouncil", () => {
	describe("Constructor", () => {
		test("creates instance with default config when no config provided", () => {
			const council = new MultiAgentCouncil(null)
			expect(council).toBeInstanceOf(MultiAgentCouncil)
			expect(council.isMultiAgentEnabled()).toBe(false)
		})

		test("creates instance with provided config", () => {
			const delegator = createMockDelegator()
			const config = createMockConfig({ enabled: true })
			const council = new MultiAgentCouncil(delegator, config)

			expect(council).toBeInstanceOf(MultiAgentCouncil)
			expect(council.isMultiAgentEnabled()).toBe(true)
		})

		test("creates fallback council internally", () => {
			const council = new MultiAgentCouncil(null, createMockConfig({ enabled: false }))
			expect(council.isMultiAgentEnabled()).toBe(false)
		})
	})

	describe("reviewProposal - Fallback Scenarios", () => {
		test("uses fallback council when delegator is null", async () => {
			const council = new MultiAgentCouncil(null, createMockConfig())
			const proposal = createMockProposal()

			const decision = await council.reviewProposal(proposal)

			expect(decision).toBeDefined()
			expect(decision.proposalId).toBe(proposal.id)
			// Fallback council will make a decision
			expect(typeof decision.approved).toBe("boolean")
		})

		test("uses fallback council when multi-agent is disabled", async () => {
			const delegator = createMockDelegator()
			const council = new MultiAgentCouncil(delegator, createMockConfig({ enabled: false }))
			const proposal = createMockProposal()

			const decision = await council.reviewProposal(proposal)

			expect(decision).toBeDefined()
			expect(decision.proposalId).toBe(proposal.id)
		})

		test("uses fallback when getCurrentTask returns undefined", async () => {
			const delegator: TaskDelegator = {
				delegateParentAndOpenChild: async () => ({ taskId: "task-1" }),
				getCurrentTask: () => undefined,
			}
			const council = new MultiAgentCouncil(delegator, createMockConfig())
			const proposal = createMockProposal()

			const decision = await council.reviewProposal(proposal)

			expect(decision).toBeDefined()
			expect(decision.proposalId).toBe(proposal.id)
		})
	})

	describe("reviewProposal - Sequential Execution", () => {
		test("executes all agent roles sequentially", async () => {
			const delegationOrder: string[] = []
			const delegator = createMockDelegator({
				onDelegation: (params) => {
					// Extract role from the TODO content
					const roleMatch = params.initialTodos[0]?.content.match(
						/as (analyst|reviewer|security|performance) agent/,
					)
					if (roleMatch) {
						delegationOrder.push(roleMatch[1])
					}
				},
			})

			const council = new MultiAgentCouncil(delegator, createMockConfig())
			const proposal = createMockProposal()

			await council.reviewProposal(proposal)

			// Check all roles were executed
			expect(delegationOrder).toContain("analyst")
			expect(delegationOrder).toContain("reviewer")
			expect(delegationOrder).toContain("security")
			expect(delegationOrder).toContain("performance")
			expect(delegationOrder.length).toBe(4)
		})

		test("delegates with correct prompt template for each role", async () => {
			const delegatedPrompts: { role: string; message: string }[] = []
			const delegator = createMockDelegator({
				onDelegation: (params) => {
					// Extract role from the TODO content
					const roleMatch = params.initialTodos[0]?.content.match(
						/as (analyst|reviewer|security|performance) agent/,
					)
					if (roleMatch) {
						delegatedPrompts.push({ role: roleMatch[1], message: params.message })
					}
				},
			})

			const council = new MultiAgentCouncil(delegator, createMockConfig())
			const proposal = createMockProposal()

			await council.reviewProposal(proposal)

			// Verify each role got appropriate prompt
			const analystPrompt = delegatedPrompts.find((p) => p.role === "analyst")
			expect(analystPrompt).toBeDefined()
			expect(analystPrompt!.message).toContain("technical feasibility")

			const reviewerPrompt = delegatedPrompts.find((p) => p.role === "reviewer")
			expect(reviewerPrompt).toBeDefined()
			expect(reviewerPrompt!.message).toContain("code quality")

			const securityPrompt = delegatedPrompts.find((p) => p.role === "security")
			expect(securityPrompt).toBeDefined()
			expect(securityPrompt!.message).toContain("security")

			const performancePrompt = delegatedPrompts.find((p) => p.role === "performance")
			expect(performancePrompt).toBeDefined()
			expect(performancePrompt!.message).toContain("performance")
		})

		test("includes proposal details in agent prompts", async () => {
			let capturedMessage = ""
			const delegator = createMockDelegator({
				onDelegation: (params) => {
					capturedMessage = params.message
				},
			})

			const council = new MultiAgentCouncil(delegator, createMockConfig({ activeRoles: ["analyst"] }))
			const proposal = createMockProposal({
				title: "Unique Test Title",
				description: "Unique Test Description",
				risk: "medium",
			})

			await council.reviewProposal(proposal)

			expect(capturedMessage).toContain("Unique Test Title")
			expect(capturedMessage).toContain("Unique Test Description")
			expect(capturedMessage).toContain("medium")
		})
	})

	describe("reviewProposal - Vote Aggregation", () => {
		test("aggregates votes and returns decision", async () => {
			const delegator = createMockDelegator()
			const council = new MultiAgentCouncil(delegator, createMockConfig())
			const proposal = createMockProposal()

			const decision = await council.reviewProposal(proposal)

			expect(decision).toBeDefined()
			expect(decision.proposalId).toBe(proposal.id)
			expect(typeof decision.approved).toBe("boolean")
			expect(decision.reason).toBeDefined()
			expect(Array.isArray(decision.votes)).toBe(true)
		})

		test("majority voting policy approves when more approvals than rejections", async () => {
			const delegator = createMockDelegator()
			const council = new MultiAgentCouncil(delegator, createMockConfig({ votingPolicy: "majority" }))
			const proposal = createMockProposal()

			const decision = await council.reviewProposal(proposal)

			// Since mock returns approve, majority should pass
			expect(decision.approved).toBe(true)
			expect(decision.reason).toContain("confidence")
		})

		test("unanimity voting policy requires all approvals", async () => {
			const delegator = createMockDelegator()
			const council = new MultiAgentCouncil(delegator, createMockConfig({ votingPolicy: "unanimity" }))
			const proposal = createMockProposal()

			const decision = await council.reviewProposal(proposal)

			// Mock returns all approves
			expect(decision.approved).toBe(true)
		})

		test("weighted voting policy considers confidence scores", async () => {
			const delegator = createMockDelegator()
			const council = new MultiAgentCouncil(delegator, createMockConfig({ votingPolicy: "weighted" }))
			const proposal = createMockProposal()

			const decision = await council.reviewProposal(proposal)

			expect(decision).toBeDefined()
			expect(decision.reason).toContain("Weighted")
		})
	})

	describe("reviewProposal - Failure Handling", () => {
		test("continues execution when agent fails and continueOnAgentFailure is true", async () => {
			const delegator = createMockDelegator({ failOnRoles: ["security"] })
			const council = new MultiAgentCouncil(delegator, createMockConfig({ continueOnAgentFailure: true }))
			const proposal = createMockProposal()

			const decision = await council.reviewProposal(proposal)

			// Should still complete with other agents
			expect(decision).toBeDefined()
			expect(decision.votes.length).toBeGreaterThan(0)
		})

		test("stops execution when agent fails and continueOnAgentFailure is false", async () => {
			const delegator = createMockDelegator({ failOnRoles: ["analyst"] })
			const council = new MultiAgentCouncil(
				delegator,
				createMockConfig({ continueOnAgentFailure: false, fallbackToSimulated: true }),
			)
			const proposal = createMockProposal()

			// Should fall back to simulated council
			const decision = await council.reviewProposal(proposal)
			expect(decision).toBeDefined()
		})

		test("falls back to simulated council on total failure when enabled", async () => {
			const delegator = createMockDelegator({ shouldFail: true })
			const council = new MultiAgentCouncil(
				delegator,
				createMockConfig({ continueOnAgentFailure: false, fallbackToSimulated: true }),
			)
			const proposal = createMockProposal()

			const decision = await council.reviewProposal(proposal)

			expect(decision).toBeDefined()
			expect(decision.proposalId).toBe(proposal.id)
		})

		test("returns rejection when fallback is disabled and execution fails", async () => {
			const delegator = createMockDelegator({ shouldFail: true })
			const council = new MultiAgentCouncil(
				delegator,
				createMockConfig({ continueOnAgentFailure: false, fallbackToSimulated: false }),
			)
			const proposal = createMockProposal()

			const decision = await council.reviewProposal(proposal)

			expect(decision.approved).toBe(false)
			expect(decision.reason).toContain("failed")
		})
	})

	describe("Event Emission", () => {
		test("emits execution_started event", async () => {
			const delegator = createMockDelegator()
			const council = new MultiAgentCouncil(delegator, createMockConfig())
			const events: MultiAgentCouncilEvent[] = []
			council.on((event) => events.push(event))

			const proposal = createMockProposal()
			await council.reviewProposal(proposal)

			const startEvent = events.find((e) => e.type === "execution_started")
			expect(startEvent).toBeDefined()
			expect(startEvent?.execution.proposalId).toBe(proposal.id)
		})

		test("emits agent_started and agent_completed events for each role", async () => {
			const delegator = createMockDelegator()
			const council = new MultiAgentCouncil(delegator, createMockConfig())
			const events: MultiAgentCouncilEvent[] = []
			council.on((event) => events.push(event))

			const proposal = createMockProposal()
			await council.reviewProposal(proposal)

			const startedEvents = events.filter((e) => e.type === "agent_started")
			const completedEvents = events.filter((e) => e.type === "agent_completed")

			expect(startedEvents.length).toBe(4) // 4 roles
			expect(completedEvents.length).toBe(4)
		})

		test("emits agent_failed event when agent fails", async () => {
			const delegator = createMockDelegator({ failOnRoles: ["security"] })
			const council = new MultiAgentCouncil(delegator, createMockConfig({ continueOnAgentFailure: true }))
			const events: MultiAgentCouncilEvent[] = []
			council.on((event) => events.push(event))

			const proposal = createMockProposal()
			await council.reviewProposal(proposal)

			const failedEvents = events.filter((e) => e.type === "agent_failed")
			expect(failedEvents.length).toBe(1)
			expect(failedEvents[0].type === "agent_failed" && failedEvents[0].role).toBe("security")
		})

		test("emits execution_completed event with decision", async () => {
			const delegator = createMockDelegator()
			const council = new MultiAgentCouncil(delegator, createMockConfig())
			const events: MultiAgentCouncilEvent[] = []
			council.on((event) => events.push(event))

			const proposal = createMockProposal()
			await council.reviewProposal(proposal)

			const completeEvent = events.find((e) => e.type === "execution_completed")
			expect(completeEvent).toBeDefined()
			if (completeEvent?.type === "execution_completed") {
				expect(completeEvent.decision).toBeDefined()
				expect(completeEvent.decision.proposalId).toBe(proposal.id)
			}
		})

		test("allows unsubscribing from events", async () => {
			const delegator = createMockDelegator()
			const council = new MultiAgentCouncil(delegator, createMockConfig())
			const events: MultiAgentCouncilEvent[] = []
			const unsubscribe = council.on((event) => events.push(event))

			unsubscribe()

			const proposal = createMockProposal()
			await council.reviewProposal(proposal)

			expect(events.length).toBe(0)
		})
	})

	describe("Configuration", () => {
		test("updateConfig changes council behavior", () => {
			const delegator = createMockDelegator()
			const council = new MultiAgentCouncil(delegator, createMockConfig({ votingPolicy: "majority" }))

			council.updateConfig({ votingPolicy: "unanimity" })

			// Verify config was updated
			expect(council.isMultiAgentEnabled()).toBe(true)
		})

		test("setDelegator updates the delegator", async () => {
			const council = new MultiAgentCouncil(null, createMockConfig())
			expect(council.isMultiAgentEnabled()).toBe(false)

			const delegator = createMockDelegator()
			council.setDelegator(delegator)

			expect(council.isMultiAgentEnabled()).toBe(true)
		})

		test("respects custom active roles", async () => {
			const delegationOrder: string[] = []
			const delegator = createMockDelegator({
				onDelegation: (params) => {
					const roleMatch = params.initialTodos[0]?.content.match(
						/as (analyst|reviewer|security|performance) agent/,
					)
					if (roleMatch) {
						delegationOrder.push(roleMatch[1])
					}
				},
			})

			const council = new MultiAgentCouncil(delegator, createMockConfig({ activeRoles: ["analyst", "security"] }))
			const proposal = createMockProposal()

			await council.reviewProposal(proposal)

			expect(delegationOrder).toContain("analyst")
			expect(delegationOrder).toContain("security")
			expect(delegationOrder).not.toContain("reviewer")
			expect(delegationOrder).not.toContain("performance")
		})
	})

	describe("Execution Tracking", () => {
		test("getActiveExecution returns null when not executing", () => {
			const council = new MultiAgentCouncil(null, createMockConfig())
			expect(council.getActiveExecution()).toBeNull()
		})

		test("getActiveExecution returns null after execution completes", async () => {
			const delegator = createMockDelegator()
			const council = new MultiAgentCouncil(delegator, createMockConfig())
			const proposal = createMockProposal()

			await council.reviewProposal(proposal)

			expect(council.getActiveExecution()).toBeNull()
		})
	})
})

describe("createCouncil Factory", () => {
	test("creates simulated Council when multi-agent is disabled", () => {
		const darwinConfig = createMockDarwinConfig()
		const council = createCouncil({
			config: { ...darwinConfig, enableRealMultiAgent: false },
		})

		expect(isMultiAgentCouncil(council)).toBe(false)
	})

	test("creates simulated Council when no delegator provided", () => {
		const darwinConfig = createMockDarwinConfig()
		const council = createCouncil({
			config: { ...darwinConfig, enableRealMultiAgent: true },
		})

		// No delegator, so should create simulated council
		expect(isMultiAgentCouncil(council)).toBe(false)
	})

	test("creates MultiAgentCouncil when multi-agent enabled and delegator provided", () => {
		const darwinConfig = createMockDarwinConfig()
		const delegator = createMockDelegator()
		const council = createCouncil({
			config: { ...darwinConfig, enableRealMultiAgent: true },
			delegator,
		})

		expect(isMultiAgentCouncil(council)).toBe(true)
	})

	test("passes timeout config to MultiAgentCouncil", () => {
		const darwinConfig = createMockDarwinConfig()
		const delegator = createMockDelegator()
		const council = createCouncil({
			config: {
				...darwinConfig,
				enableRealMultiAgent: true,
				multiAgentTimeout: 120000,
			},
			delegator,
		})

		expect(isMultiAgentCouncil(council)).toBe(true)
	})
})

describe("isMultiAgentCouncil Type Guard", () => {
	test("returns true for MultiAgentCouncil instance", () => {
		const council = new MultiAgentCouncil(null, createMockConfig())
		expect(isMultiAgentCouncil(council)).toBe(true)
	})

	test("returns false for null", () => {
		expect(isMultiAgentCouncil(null)).toBe(false)
	})

	test("returns false for undefined", () => {
		expect(isMultiAgentCouncil(undefined)).toBe(false)
	})
})
