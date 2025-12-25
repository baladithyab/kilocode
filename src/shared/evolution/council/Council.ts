/**
 * Council - Multi-agent review system for evolution proposals
 *
 * Responsibilities:
 * - Coordinate review of proposals
 * - Simple voting mechanism (unanimity/majority)
 * - Aggregate votes and reach consensus
 * - For MVP: Simple programmatic voting simulation
 *
 * Future: Will integrate with delegateParentAndOpenChild for real multi-agent review
 */

import type { EvolutionProposal, CouncilVote, CouncilRole, CouncilVoteValue, DarwinConfig } from "@roo-code/types"
import { DEFAULT_DARWIN_CONFIG } from "@roo-code/types"

/** Result of council decision */
export interface CouncilDecision {
	/** Proposal that was reviewed */
	proposalId: string

	/** Whether the proposal was approved */
	approved: boolean

	/** Overall reason for the decision */
	reason: string

	/** Individual votes */
	votes: CouncilVote[]

	/** Timestamp of decision */
	timestamp: number

	/** Suggested changes if any */
	suggestedChanges?: string
}

/** Voting policy */
export type VotingPolicy = "unanimity" | "majority" | "any_approve"

/** Council configuration */
export interface CouncilConfig {
	/** Darwin configuration */
	darwinConfig?: DarwinConfig

	/** Voting policy to use */
	votingPolicy?: VotingPolicy

	/** Roles that participate in voting */
	activeRoles?: CouncilRole[]

	/** Whether to include human in review (always true for high-risk) */
	requireHumanReview?: boolean
}

/**
 * Council coordinates multi-agent review of evolution proposals
 */
export class Council {
	private config: DarwinConfig
	private votingPolicy: VotingPolicy
	private activeRoles: CouncilRole[]
	private requireHumanReview: boolean

	constructor(councilConfig: CouncilConfig = {}) {
		this.config = councilConfig.darwinConfig ?? DEFAULT_DARWIN_CONFIG
		this.votingPolicy = councilConfig.votingPolicy ?? "majority"
		this.activeRoles = councilConfig.activeRoles ?? ["analyst", "reviewer", "security"]
		this.requireHumanReview = councilConfig.requireHumanReview ?? false
	}

	/**
	 * Update configuration
	 */
	updateConfig(config: DarwinConfig): void {
		this.config = config
	}

	/**
	 * Review a proposal and make a decision
	 *
	 * For MVP: Uses programmatic simulation
	 * Future: Will use real agent delegation
	 */
	async reviewProposal(proposal: EvolutionProposal): Promise<CouncilDecision> {
		const timestamp = Date.now()
		const votes: CouncilVote[] = []

		// High-risk proposals always require human review
		if (proposal.risk === "high" && this.requireHumanReview) {
			return {
				proposalId: proposal.id,
				approved: false,
				reason: "High-risk proposal requires human review",
				votes: [],
				timestamp,
			}
		}

		// Collect votes from each active role
		for (const role of this.activeRoles) {
			const vote = await this.getVoteForRole(role, proposal)
			votes.push(vote)
		}

		// Aggregate votes based on policy
		const decision = this.aggregateVotes(proposal.id, votes, timestamp)

		return decision
	}

	/**
	 * Get vote for a specific role
	 *
	 * MVP: Simulated voting based on heuristics
	 * Future: Will delegate to specialized agents
	 */
	private async getVoteForRole(role: CouncilRole, proposal: EvolutionProposal): Promise<CouncilVote> {
		const timestamp = Date.now()

		switch (role) {
			case "analyst":
				return this.getAnalystVote(proposal, timestamp)
			case "reviewer":
				return this.getReviewerVote(proposal, timestamp)
			case "security":
				return this.getSecurityVote(proposal, timestamp)
			case "user":
				// User votes are handled separately
				return {
					proposalId: proposal.id,
					role: "user",
					vote: "abstain",
					reason: "Awaiting user input",
					timestamp,
				}
			default:
				return {
					proposalId: proposal.id,
					role,
					vote: "abstain",
					reason: "Unknown role",
					timestamp,
				}
		}
	}

	/**
	 * Analyst vote: Focuses on whether the proposal addresses the signal
	 */
	private getAnalystVote(proposal: EvolutionProposal, timestamp: number): CouncilVote {
		// Heuristic: Approve if proposal has a source signal
		const hasSource = !!proposal.sourceSignalId
		const hasDetails = proposal.description.length > 20

		if (hasSource && hasDetails) {
			return {
				proposalId: proposal.id,
				role: "analyst",
				vote: "approve",
				reason: "Proposal is well-grounded in detected signals",
				timestamp,
			}
		}

		return {
			proposalId: proposal.id,
			role: "analyst",
			vote: "request_changes",
			reason: "Proposal needs more detail or clearer signal connection",
			timestamp,
			suggestedChanges: "Add more context about the triggering pattern",
		}
	}

	/**
	 * Reviewer vote: Focuses on proposal quality and clarity
	 */
	private getReviewerVote(proposal: EvolutionProposal, timestamp: number): CouncilVote {
		// Heuristic: Check title and description quality
		const hasClearTitle = proposal.title.length >= 10 && !proposal.title.includes("undefined")
		const hasClearDescription = proposal.description.length >= 30

		if (hasClearTitle && hasClearDescription) {
			return {
				proposalId: proposal.id,
				role: "reviewer",
				vote: "approve",
				reason: "Proposal is clear and well-documented",
				timestamp,
			}
		}

		return {
			proposalId: proposal.id,
			role: "reviewer",
			vote: "request_changes",
			reason: "Proposal needs clearer title or description",
			timestamp,
			suggestedChanges: "Improve title and description clarity",
		}
	}

	/**
	 * Security vote: Focuses on risk assessment
	 */
	private getSecurityVote(proposal: EvolutionProposal, timestamp: number): CouncilVote {
		// Heuristic: Be more cautious with high-risk proposals
		if (proposal.risk === "high") {
			return {
				proposalId: proposal.id,
				role: "security",
				vote: "reject",
				reason: "High-risk proposal requires additional review",
				timestamp,
			}
		}

		if (proposal.risk === "medium") {
			// Check for potentially dangerous types
			if (proposal.type === "tool_creation") {
				return {
					proposalId: proposal.id,
					role: "security",
					vote: "request_changes",
					reason: "Tool creation requires security review",
					timestamp,
					suggestedChanges: "Add security constraints to tool specification",
				}
			}
		}

		return {
			proposalId: proposal.id,
			role: "security",
			vote: "approve",
			reason: "No security concerns identified",
			timestamp,
		}
	}

	/**
	 * Aggregate votes based on voting policy
	 */
	private aggregateVotes(proposalId: string, votes: CouncilVote[], timestamp: number): CouncilDecision {
		const approveCount = votes.filter((v) => v.vote === "approve").length
		const rejectCount = votes.filter((v) => v.vote === "reject").length
		const requestChangesCount = votes.filter((v) => v.vote === "request_changes").length
		const totalActive = votes.filter((v) => v.vote !== "abstain").length

		let approved = false
		let reason = ""
		let suggestedChanges: string | undefined

		switch (this.votingPolicy) {
			case "unanimity":
				approved = approveCount === totalActive && totalActive > 0
				reason = approved
					? "All council members approved"
					: `Unanimity not reached: ${approveCount}/${totalActive} approved`
				break

			case "majority":
				approved = approveCount > totalActive / 2
				reason = approved
					? `Majority approved: ${approveCount}/${totalActive}`
					: `Majority not reached: ${approveCount}/${totalActive} approved`
				break

			case "any_approve":
				approved = approveCount > 0 && rejectCount === 0
				reason = approved
					? `Approved with no rejections: ${approveCount} votes`
					: rejectCount > 0
						? `Blocked by ${rejectCount} rejection(s)`
						: "No approvals received"
				break
		}

		// Collect suggested changes
		if (requestChangesCount > 0) {
			const suggestions = votes
				.filter((v) => v.suggestedChanges)
				.map((v) => `[${v.role}] ${v.suggestedChanges}`)
				.join("; ")
			if (suggestions) {
				suggestedChanges = suggestions
			}
		}

		return {
			proposalId,
			approved,
			reason,
			votes,
			timestamp,
			suggestedChanges,
		}
	}

	/**
	 * Add a user vote to a decision
	 */
	async addUserVote(
		proposalId: string,
		vote: CouncilVoteValue,
		reason: string,
		suggestedChanges?: string,
	): Promise<CouncilVote> {
		return {
			proposalId,
			role: "user",
			vote,
			reason,
			timestamp: Date.now(),
			suggestedChanges,
		}
	}

	/**
	 * Set voting policy
	 */
	setVotingPolicy(policy: VotingPolicy): void {
		this.votingPolicy = policy
	}

	/**
	 * Get current voting policy
	 */
	getVotingPolicy(): VotingPolicy {
		return this.votingPolicy
	}
}
