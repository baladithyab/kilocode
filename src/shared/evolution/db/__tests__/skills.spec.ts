import { describe, it, expect, beforeEach } from "vitest"
import { skillQueries } from "../queries/skills"
import { db } from "../db"
import { skills } from "../schema"
import { v4 as uuidv4 } from "uuid"

describe("Skill Queries", () => {
	beforeEach(async () => {
		await db.delete(skills as any)
	})

	it("should create and retrieve a skill", async () => {
		const skillId = uuidv4()
		const skill = {
			id: skillId,
			name: "test-skill",
			description: "A test skill",
			code: "console.log('hello')",
			language: "typescript" as const,
			tags: JSON.stringify(["test", "demo"]),
			usageCount: 0,
			successRate: 0,
			createdAt: new Date(),
			updatedAt: new Date(),
		}

		await skillQueries.create(skill)

		const retrieved = await skillQueries.getById(skillId)
		expect(retrieved).toBeDefined()
		expect(retrieved?.id).toBe(skillId)
		expect(retrieved?.name).toBe("test-skill")
	})

	it("should search skills", async () => {
		const s1 = {
			id: uuidv4(),
			name: "file-reader",
			description: "Reads files from disk",
			code: "",
			language: "typescript" as const,
			tags: JSON.stringify(["fs", "io"]),
			usageCount: 10,
			createdAt: new Date(),
			updatedAt: new Date(),
		}
		const s2 = {
			id: uuidv4(),
			name: "http-client",
			description: "Makes HTTP requests",
			code: "",
			language: "typescript" as const,
			tags: JSON.stringify(["net", "web"]),
			usageCount: 5,
			createdAt: new Date(),
			updatedAt: new Date(),
		}

		await skillQueries.create(s1)
		await skillQueries.create(s2)

		const results = await skillQueries.search("file")
		expect(results).toHaveLength(1)
		expect(results[0].id).toBe(s1.id)

		const results2 = await skillQueries.search("requests")
		expect(results2).toHaveLength(1)
		expect(results2[0].id).toBe(s2.id)
	})

	it("should increment usage", async () => {
		const skillId = uuidv4()
		const skill = {
			id: skillId,
			name: "test-skill",
			description: "A test skill",
			code: "",
			language: "typescript" as const,
			tags: JSON.stringify([]),
			usageCount: 0,
			successRate: 0,
			createdAt: new Date(),
			updatedAt: new Date(),
		}

		await skillQueries.create(skill)
		await skillQueries.incrementUsage(skillId, true)

		const updated = await skillQueries.getById(skillId)
		expect(updated?.usageCount).toBe(1)
		expect(updated?.successRate).toBe(1)

		await skillQueries.incrementUsage(skillId, false)
		const updated2 = await skillQueries.getById(skillId)
		expect(updated2?.usageCount).toBe(2)
		expect(updated2?.successRate).toBe(0.5)
	})
})
