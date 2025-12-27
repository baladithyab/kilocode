import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { db } from "../db"
import { sql } from "drizzle-orm"

describe("Darwin Database", () => {
	it("should connect to the database", async () => {
		const result = await db.run(sql`SELECT 1`)
		expect(result).toBeDefined()
	})

	it("should have required tables", async () => {
		const tables = await db.run(sql`SELECT name FROM sqlite_master WHERE type='table'`)
		const tableNames = tables.rows.map((r: any) => r.name)

		expect(tableNames).toContain("traces")
		expect(tableNames).toContain("proposals")
		expect(tableNames).toContain("skills")
		expect(tableNames).toContain("council_votes")
		expect(tableNames).toContain("execution_history")
	})
})
