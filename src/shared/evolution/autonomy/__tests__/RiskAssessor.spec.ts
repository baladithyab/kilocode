/**
 * Tests for RiskAssessor
 */
import { describe, it, expect, beforeEach } from "vitest"
import type { EvolutionProposal } from "@roo-code/types"
import { RiskAssessor } from "../RiskAssessor"

function createProposal(overrides: Partial<EvolutionProposal> = {}): EvolutionProposal {
	return {
		id: `proposal-${Date.now()}`,
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

describe("RiskAssessor", () => {
	let assessor: RiskAssessor

	beforeEach(() => {
		assessor = new RiskAssessor()
	})

	describe("Basic Risk Assessment", () => {
		it("should assess low risk for rule_update proposals", () => {
			const proposal = createProposal({ type: "rule_update" })
			const result = assessor.assessRisk(proposal)
			expect(result.proposalId).toBe(proposal.id)
			expect(result.riskLevel).toBe("low")
		})

		it("should assess medium risk for config_change proposals", () => {
			const proposal = createProposal({ type: "config_change" })
			const result = assessor.assessRisk(proposal)
			expect(result.riskLevel).toBe("medium")
		})

		it("should assess higher risk for mode_instruction proposals", () => {
			const proposal = createProposal({ type: "mode_instruction" })
			const result = assessor.assessRisk(proposal)
			expect(result.riskLevel).toBe("medium")
		})
	})

	describe("Scope Factor", () => {
		it("should assess lower risk for project scope", () => {
			const proposal = createProposal({ type: "rule_update", payload: { scope: "project" } })
			const result = assessor.assessRisk(proposal)
			const scopeFactor = result.factors.find((f) => f.name === "scope")
			expect(scopeFactor!.value).toBeLessThan(0.5)
		})

		it("should assess higher risk for global scope", () => {
			const proposal = createProposal({ type: "rule_update", payload: { scope: "global" } })
			const result = assessor.assessRisk(proposal)
			const scopeFactor = result.factors.find((f) => f.name === "scope")
			expect(scopeFactor!.value).toBeGreaterThan(0.5)
		})
	})

	describe("Affected Files Factor", () => {
		it("should assess low risk for few files", () => {
			const proposal = createProposal({ payload: { affectedFiles: ["file1.ts"] } })
			const result = assessor.assessRisk(proposal)
			const filesFactor = result.factors.find((f) => f.name === "affected_files")
			expect(filesFactor!.value).toBeLessThan(0.3)
		})

		it("should assess higher risk for many files", () => {
			const proposal = createProposal({
				payload: { affectedFiles: Array(10).fill("file.ts") },
			})
			const result = assessor.assessRisk(proposal)
			const filesFactor = result.factors.find((f) => f.name === "affected_files")
			expect(filesFactor!.value).toBeGreaterThan(0.5)
		})
	})

	describe("Historical Success Rate", () => {
		it("should return neutral risk with insufficient history", () => {
			const proposal = createProposal({ type: "rule_update" })
			const result = assessor.assessRisk(proposal)
			const historyFactor = result.factors.find((f) => f.name === "historical_success")
			expect(historyFactor!.value).toBe(0.5)
		})

		it("should calculate lower risk for high success rate", () => {
			for (let i = 0; i < 5; i++) {
				assessor.recordResult(createProposal({ type: "rule_update" }), true)
			}
			const proposal = createProposal({ type: "rule_update" })
			const result = assessor.assessRisk(proposal)
			const historyFactor = result.factors.find((f) => f.name === "historical_success")
			expect(historyFactor!.value).toBeLessThan(0.2)
		})
	})

	describe("User Override Patterns", () => {
		it("should return neutral with no overrides", () => {
			const proposal = createProposal({ type: "rule_update" })
			const result = assessor.assessRisk(proposal)
			const overrideFactor = result.factors.find((f) => f.name === "user_overrides")
			expect(overrideFactor!.value).toBe(0.5)
		})

		it("should increase risk when users frequently reject", () => {
			for (let i = 0; i < 5; i++) {
				assessor.recordOverride("rule_update", "low", "rejected")
			}
			const proposal = createProposal({ type: "rule_update" })
			const result = assessor.assessRisk(proposal)
			const overrideFactor = result.factors.find((f) => f.name === "user_overrides")
			expect(overrideFactor!.value).toBeGreaterThan(0.8)
		})
	})

	describe("Auto-Approval Checks", () => {
		it("should not allow auto-approval at autonomy level 0", () => {
			const proposal = createProposal({ type: "rule_update" })
			const result = assessor.assessRisk(proposal)
			expect(assessor.isSafeForAutoApproval(result, 0)).toBe(false)
		})

		it("should allow low risk auto-approval at autonomy level 1", () => {
			const proposal = createProposal({ type: "rule_update", payload: { scope: "project" } })
			const result = assessor.assessRisk(proposal)
			expect(result.riskLevel).toBe("low")
			expect(assessor.isSafeForAutoApproval(result, 1)).toBe(true)
		})

		it("should allow medium risk auto-approval at autonomy level 2", () => {
			const proposal = createProposal({ type: "config_change" })
			const result = assessor.assessRisk(proposal)
			expect(result.riskLevel).toBe("medium")
			expect(assessor.isSafeForAutoApproval(result, 2)).toBe(true)
		})
	})

	describe("History Management", () => {
		it("should track success rates correctly", () => {
			assessor.recordResult(createProposal({ type: "rule_update" }), true)
			assessor.recordResult(createProposal({ type: "rule_update" }), true)
			assessor.recordResult(createProposal({ type: "rule_update" }), false)
			expect(assessor.getSuccessRate("rule_update")).toBeCloseTo(2 / 3, 2)
		})

		it("should reset history", () => {
			assessor.recordResult(createProposal({ type: "rule_update" }), true)
			assessor.resetHistory()
			expect(assessor.getSuccessRate("rule_update")).toBeNull()
		})
	})
})
