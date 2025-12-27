import { db } from "../db"
import { skills } from "../schema"
import { eq, desc, like, or } from "drizzle-orm"

export const skillQueries = {
	async create(skill: typeof skills.$inferInsert) {
		return db
			.insert(skills as any)
			.values(skill)
			.returning()
	},

	async getById(id: string) {
		const result = await db
			.select()
			.from(skills as any)
			.where(eq(skills.id, id))
			.limit(1)
		return result[0]
	},

	async getByName(name: string) {
		const result = await db
			.select()
			.from(skills as any)
			.where(eq(skills.name, name))
			.limit(1)
		return result[0]
	},

	async search(query: string) {
		return db
			.select()
			.from(skills as any)
			.where(or(like(skills.name, `%${query}%`), like(skills.description, `%${query}%`)))
			.orderBy(desc(skills.usageCount))
	},

	async incrementUsage(id: string, success: boolean) {
		const skill = await this.getById(id)
		if (!skill) return null

		const newUsageCount = (skill.usageCount || 0) + 1
		const newSuccessRate = success
			? ((skill.successRate || 0) * (skill.usageCount || 0) + 1) / newUsageCount
			: ((skill.successRate || 0) * (skill.usageCount || 0)) / newUsageCount

		return db
			.update(skills as any)
			.set({
				usageCount: newUsageCount,
				successRate: newSuccessRate,
				lastUsed: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(skills.id, id))
			.returning()
	},
}
