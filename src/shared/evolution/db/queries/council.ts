import { db } from "../db"
import { councilVotes } from "../schema"
import { eq, desc } from "drizzle-orm"

export const councilQueries = {
	async createVote(vote: typeof councilVotes.$inferInsert) {
		return db
			.insert(councilVotes as any)
			.values(vote)
			.returning()
	},

	async getVotesByProposal(proposalId: string) {
		return db
			.select()
			.from(councilVotes as any)
			.where(eq(councilVotes.proposalId, proposalId))
	},

	async getVotesByAgent(agent: "analyst" | "reviewer" | "security" | "performance") {
		return db
			.select()
			.from(councilVotes as any)
			.where(eq(councilVotes.agent, agent))
			.orderBy(desc(councilVotes.createdAt))
	},
}
