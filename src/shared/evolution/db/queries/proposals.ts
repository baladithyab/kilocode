import { db } from "../db"
import { proposals } from "../schema"
import { eq, desc, and, gte } from "drizzle-orm"

export const proposalQueries = {
	async create(proposal: typeof proposals.$inferInsert) {
		return db
			.insert(proposals as any)
			.values(proposal)
			.returning()
	},

	async getById(id: string) {
		const result = await db
			.select()
			.from(proposals as any)
			.where(eq(proposals.id, id))
			.limit(1)
		return result[0]
	},

	async getPending() {
		return db
			.select()
			.from(proposals as any)
			.where(eq(proposals.status, "pending"))
			.orderBy(desc(proposals.createdAt))
	},

	async getByStatus(status: "pending" | "approved" | "rejected" | "applied" | "failed" | "rolled_back") {
		return db
			.select()
			.from(proposals as any)
			.where(eq(proposals.status, status))
			.orderBy(desc(proposals.createdAt))
	},

	async updateStatus(
		id: string,
		status: "pending" | "approved" | "rejected" | "applied" | "failed" | "rolled_back",
		reviewNotes?: string,
	) {
		return db
			.update(proposals as any)
			.set({ status, reviewNotes, updatedAt: new Date() })
			.where(eq(proposals.id, id))
			.returning()
	},
}
