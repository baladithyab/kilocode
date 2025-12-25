import { describe, it, expect, beforeEach } from "vitest"
import { ProposalGenerator } from "../ProposalGenerator"
import type { LearningSignal, DarwinConfig } from "@roo-code/types"

describe("ProposalGenerator", () => {
	let generator: ProposalGenerator

	beforeEach(() => {
		generator = new ProposalGenerator({
			minConfidenceThreshold: 0.5,
			maxProposalsPerSignal: 2,
		})
	})

	describe("generateFromSignal", () => {
		it("should generate proposals for doom_loop signals", () => {
			const signal: LearningSignal = {
				id: "signal-1",
				type: "doom_loop",
				confidence: 0.9,
				description: "Detected 5 consecutive failures with write_to_file",
				sourceEventIds: ["event-1", "event-2", "event-3"],
				detectedAt: Date.now(),
				suggestedAction: "Add validation before writing",
				context: {
					toolName: "write_to_file",
					errorCount: 5,
					suggestion: "Verify file path exists before writing",
				},
			}

			const proposals = generator.generateFromSignal(signal)

			expect(proposals).toHaveLength(2) // max 2 per signal
			expect(proposals[0].type).toBe("rule_update")
			expect(proposals[0].risk).toBe("medium")
			expect(proposals[0].sourceSignalId).toBe("signal-1")
			expect(proposals[0].status).toBe("pending")
		})

		it("should skip signals with low confidence", () => {
			const signal: LearningSignal = {
				id: "signal-2",
				type: "doom_loop",
				confidence: 0.3, // Below threshold
				description: "Weak pattern detected",
				sourceEventIds: ["event-1"],
				detectedAt: Date.now(),
			}

			const proposals = generator.generateFromSignal(signal)

			expect(proposals).toHaveLength(0)
		})

		it("should generate proposals for capability_gap signals", () => {
			const signal: LearningSignal = {
				id: "signal-3",
				type: "capability_gap",
				confidence: 0.85,
				description: "Missing git stash capability",
				sourceEventIds: ["event-1"],
				detectedAt: Date.now(),
				context: {
					capability: "git_stash",
				},
			}

			const proposals = generator.generateFromSignal(signal)

			expect(proposals.length).toBeGreaterThan(0)
			expect(proposals[0].type).toBe("tool_creation")
			expect(proposals[0].risk).toBe("high")
		})

		it("should generate proposals for success_pattern signals", () => {
			const signal: LearningSignal = {
				id: "signal-4",
				type: "success_pattern",
				confidence: 0.95,
				description: "Consistent pattern of reading file before modification",
				sourceEventIds: ["event-1", "event-2"],
				detectedAt: Date.now(),
				context: {
					patternName: "read-before-write",
				},
			}

			const proposals = generator.generateFromSignal(signal)

			expect(proposals.length).toBeGreaterThan(0)
			expect(proposals[0].type).toBe("rule_update")
			expect(proposals[0].risk).toBe("low")
		})
	})

	describe("generateFromSignals", () => {
		it("should generate proposals from multiple signals", () => {
			const signals: LearningSignal[] = [
				{
					id: "signal-1",
					type: "doom_loop",
					confidence: 0.9,
					description: "Loop 1",
					sourceEventIds: [],
					detectedAt: Date.now(),
					context: { toolName: "tool1" },
				},
				{
					id: "signal-2",
					type: "inefficiency",
					confidence: 0.8,
					description: "Slow operation",
					sourceEventIds: [],
					detectedAt: Date.now(),
					context: { area: "file_ops" },
				},
			]

			const proposals = generator.generateFromSignals(signals)

			expect(proposals.length).toBeGreaterThan(0)
		})

		it("should deduplicate similar proposals", () => {
			const signals: LearningSignal[] = [
				{
					id: "signal-1",
					type: "doom_loop",
					confidence: 0.9,
					description: "Same tool failure",
					sourceEventIds: [],
					detectedAt: Date.now(),
					context: { toolName: "write_to_file" },
				},
				{
					id: "signal-2",
					type: "doom_loop",
					confidence: 0.85,
					description: "Same tool failure again",
					sourceEventIds: [],
					detectedAt: Date.now(),
					context: { toolName: "write_to_file" },
				},
			]

			const proposals = generator.generateFromSignals(signals)

			// Should deduplicate based on type and title
			const ruleUpdateProposals = proposals.filter((p) => p.type === "rule_update")
			expect(ruleUpdateProposals.length).toBeLessThanOrEqual(2) // deduplicated
		})
	})

	describe("validateProposal", () => {
		it("should validate a well-formed proposal", () => {
			const signal: LearningSignal = {
				id: "signal-1",
				type: "doom_loop",
				confidence: 0.9,
				description: "Test signal with enough detail for a good proposal",
				sourceEventIds: [],
				detectedAt: Date.now(),
				context: { toolName: "test_tool" },
			}

			const proposals = generator.generateFromSignal(signal)
			expect(proposals.length).toBeGreaterThan(0)

			const result = generator.validateProposal(proposals[0])
			expect(result.valid).toBe(true)
			expect(result.errors).toHaveLength(0)
		})

		it("should reject proposal without ID", () => {
			const result = generator.validateProposal({
				id: "",
				type: "rule_update",
				status: "pending",
				risk: "low",
				title: "Test Title",
				description: "Test description here",
				payload: {},
				createdAt: Date.now(),
				updatedAt: Date.now(),
			})

			expect(result.valid).toBe(false)
			expect(result.errors).toContain("Proposal must have an ID")
		})

		it("should reject proposal with short title", () => {
			const result = generator.validateProposal({
				id: "test-id",
				type: "rule_update",
				status: "pending",
				risk: "low",
				title: "Hi", // too short
				description: "Test description here",
				payload: {},
				createdAt: Date.now(),
				updatedAt: Date.now(),
			})

			expect(result.valid).toBe(false)
			expect(result.errors).toContain("Proposal must have a title (at least 5 characters)")
		})
	})

	describe("updateConfig", () => {
		it("should update configuration", () => {
			const newConfig: DarwinConfig = {
				enabled: true,
				autonomyLevel: 1,
				traceCapture: true,
				doomLoopThreshold: 5,
				skillSynthesis: true,
				configEvolution: false,
				councilEnabled: true,
			}

			generator.updateConfig(newConfig)
			// No assertion needed, just verify it doesn't throw
		})
	})

	describe("assessRisk", () => {
		it("should return high risk for tool creation", () => {
			const risk = generator.assessRisk("tool_creation")
			expect(risk).toBe("high")
		})

		it("should return medium risk for rule updates", () => {
			const risk = generator.assessRisk("rule_update")
			expect(risk).toBe("medium")
		})

		it("should return low risk for config changes", () => {
			const risk = generator.assessRisk("config_change")
			expect(risk).toBe("low")
		})
	})
})
