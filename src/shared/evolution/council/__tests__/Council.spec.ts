import { describe, it, expect, beforeEach } from "vitest"
import { Council } from "../Council"
import type { EvolutionProposal } from "@roo-code/types"

describe("Council", () => {
	let council: Council

	const createProposal = (overrides: Partial<EvolutionProposal> = {}): EvolutionProposal => ({
		id: "proposal-1",
		type: "rule_update",
		status: "pending",
		risk: "low",
		title: "Test proposal with good title",
		description: "This is a detailed description of the proposal for testing purposes",
		payload: { test: true },
		sourceSignalId: "signal-1",
		createdAt: Date.now(),
		updatedAt: Date.now(),
		...overrides,
	})

	beforeEach(() => {
		council = new Council({
			votingPolicy: "majority",
			activeRoles: ["analyst", "reviewer", "security"],
		})
	})

	describe("reviewProposal", () => {
		it("should approve low-risk proposals with majority voting", async () => {
			const proposal = createProposal({ risk: "low" })

			const decision = await council.reviewProposal(proposal)

			expect(decision.proposalId).toBe("proposal-1")
			expect(decision.votes.length).toBe(3)
			expect(decision.timestamp).toBeDefined()
		})

		it("should reject high-risk proposals by security role", async () => {
			const proposal = createProposal({ risk: "high" })

			const decision = await council.reviewProposal(proposal)

			// Security role should reject high-risk proposals
			const securityVote = decision.votes.find((v) => v.role === "security")
			expect(securityVote?.vote).toBe("reject")
		})

		it("should require human review for high-risk when configured", async () => {
			council = new Council({
				votingPolicy: "majority",
				requireHumanReview: true,
			})

			const proposal = createProposal({ risk: "high" })

			const decision = await council.reviewProposal(proposal)

			expect(decision.approved).toBe(false)
			expect(decision.reason).toContain("human review")
		})

		it("should request changes for tool creation proposals", async () => {
			const proposal = createProposal({
				type: "tool_creation",
				risk: "medium",
			})

			const decision = await council.reviewProposal(proposal)

			// Security should request changes for tool creation
			const securityVote = decision.votes.find((v) => v.role === "security")
			expect(securityVote?.vote).toBe("request_changes")
		})
	})

	describe("voting policies", () => {
		it("should require unanimity when policy is set", async () => {
			council.setVotingPolicy("unanimity")

			const proposal = createProposal({ risk: "high" }) // Will get rejected by security

			const decision = await council.reviewProposal(proposal)

			expect(decision.approved).toBe(false)
			expect(decision.reason).toContain("Unanimity not reached")
		})

		it("should approve with any_approve policy when no rejections", async () => {
			council.setVotingPolicy("any_approve")

			const proposal = createProposal({ risk: "low" })

			const decision = await council.reviewProposal(proposal)

			// Low-risk proposals should pass any_approve
			expect(decision.votes.filter((v) => v.vote === "reject")).toHaveLength(0)
		})

		it("should block with any_approve policy when there are rejections", async () => {
			council.setVotingPolicy("any_approve")

			const proposal = createProposal({ risk: "high" }) // Security will reject

			const decision = await council.reviewProposal(proposal)

			expect(decision.approved).toBe(false)
			expect(decision.reason).toContain("rejection")
		})
	})

	describe("addUserVote", () => {
		it("should create a valid user vote", async () => {
			const vote = await council.addUserVote("proposal-1", "approve", "Looks good to me")

			expect(vote.proposalId).toBe("proposal-1")
			expect(vote.role).toBe("user")
			expect(vote.vote).toBe("approve")
			expect(vote.reason).toBe("Looks good to me")
			expect(vote.timestamp).toBeDefined()
		})

		it("should include suggested changes when provided", async () => {
			const vote = await council.addUserVote(
				"proposal-1",
				"request_changes",
				"Need modifications",
				"Add more detail to description",
			)

			expect(vote.vote).toBe("request_changes")
			expect(vote.suggestedChanges).toBe("Add more detail to description")
		})
	})

	describe("getVotingPolicy", () => {
		it("should return current voting policy", () => {
			expect(council.getVotingPolicy()).toBe("majority")

			council.setVotingPolicy("unanimity")
			expect(council.getVotingPolicy()).toBe("unanimity")
		})
	})

	describe("analyst vote heuristics", () => {
		it("should approve proposals with source signals", async () => {
			const proposal = createProposal({
				sourceSignalId: "signal-123",
				description: "Well detailed proposal description",
			})

			const decision = await council.reviewProposal(proposal)

			const analystVote = decision.votes.find((v) => v.role === "analyst")
			expect(analystVote?.vote).toBe("approve")
		})

		it("should request changes for proposals without source signals", async () => {
			const proposal = createProposal({
				sourceSignalId: undefined,
				description: "Short",
			})

			const decision = await council.reviewProposal(proposal)

			const analystVote = decision.votes.find((v) => v.role === "analyst")
			expect(analystVote?.vote).toBe("request_changes")
		})
	})

	describe("reviewer vote heuristics", () => {
		it("should approve proposals with clear titles and descriptions", async () => {
			const proposal = createProposal({
				title: "Clear and descriptive title here",
				description: "This description is long enough and contains meaningful content",
			})

			const decision = await council.reviewProposal(proposal)

			const reviewerVote = decision.votes.find((v) => v.role === "reviewer")
			expect(reviewerVote?.vote).toBe("approve")
		})

		it("should request changes for short titles", async () => {
			const proposal = createProposal({
				title: "Short",
				description: "This is still a good description though",
			})

			const decision = await council.reviewProposal(proposal)

			const reviewerVote = decision.votes.find((v) => v.role === "reviewer")
			expect(reviewerVote?.vote).toBe("request_changes")
		})
	})

	describe("suggested changes aggregation", () => {
		it("should collect suggested changes from all voters", async () => {
			const proposal = createProposal({
				type: "tool_creation",
				risk: "medium",
				title: "Short",
				description: "Short",
				sourceSignalId: undefined,
			})

			const decision = await council.reviewProposal(proposal)

			// Should have suggested changes from multiple voters
			expect(decision.suggestedChanges).toBeDefined()
			expect(decision.suggestedChanges?.length).toBeGreaterThan(0)
		})
	})
})
