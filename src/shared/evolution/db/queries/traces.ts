import { db } from "../db"
import { traces } from "../schema"
import { eq, and, gte, lte, desc } from "drizzle-orm"

export const traceQueries = {
	async create(trace: typeof traces.$inferInsert) {
		return db
			.insert(traces as any)
			.values(trace)
			.returning()
	},

	async getById(id: string) {
		const result = await db
			.select()
			.from(traces as any)
			.where(eq(traces.id, id))
			.limit(1)
		return result[0]
	},

	async getRecent(limit = 100) {
		return db
			.select()
			.from(traces as any)
			.orderBy(desc(traces.timestamp))
			.limit(limit)
	},

	async getByTimeRange(start: number, end: number) {
		return db
			.select()
			.from(traces as any)
			.where(and(gte(traces.timestamp, start), lte(traces.timestamp, end)))
			.orderBy(desc(traces.timestamp))
	},

	async getErrors(limit = 50) {
		return db
			.select()
			.from(traces as any)
			.where(eq(traces.status, "error"))
			.orderBy(desc(traces.timestamp))
			.limit(limit)
	},

	async getDoomLoopCandidates(threshold: number, timeWindow: number) {
		const now = Date.now()
		const start = now - timeWindow

		return db
			.select()
			.from(traces as any)
			.where(and(eq(traces.status, "error"), gte(traces.timestamp, start)))
			.orderBy(desc(traces.timestamp))
	},
}
