import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { traceQueries } from "../queries/traces"
import { db } from "../db"
import { traces } from "../schema"
import { v4 as uuidv4 } from "uuid"

describe("Performance Benchmarks", () => {
	beforeEach(async () => {
		await db.delete(traces as any)
	})

	it("should insert 1000 traces quickly", async () => {
		const start = Date.now()
		const batchSize = 1000

		// Prepare batch
		const batch = Array.from({ length: batchSize }).map(() => ({
			id: uuidv4(),
			timestamp: Date.now(),
			event: "tool_success",
			status: "success" as const,
			createdAt: new Date(),
		}))

		// Insert one by one (Drizzle batch insert is better but let's test raw speed)
		// Actually Drizzle supports batch insert
		await db.insert(traces as any).values(batch)

		const duration = Date.now() - start
		console.log(`Inserted ${batchSize} traces in ${duration}ms`)
		expect(duration).toBeLessThan(1000) // Should be very fast with SQLite
	})

	it("should query 10k traces quickly", async () => {
		// Seed data
		const batchSize = 10000
		const batch = Array.from({ length: batchSize }).map((_, i) => ({
			id: uuidv4(),
			timestamp: Date.now() - i * 1000,
			event: i % 10 === 0 ? "tool_error" : "tool_success",
			status: i % 10 === 0 ? "error" : ("success" as const),
			createdAt: new Date(),
		}))

		// Split into chunks to avoid SQL limit
		const chunkSize = 500
		for (let i = 0; i < batchSize; i += chunkSize) {
			await db.insert(traces as any).values(batch.slice(i, i + chunkSize))
		}

		const start = Date.now()
		const results = await traceQueries.getRecent(1000)
		const duration = Date.now() - start

		console.log(`Queried 1000 recent traces from ${batchSize} in ${duration}ms`)
		expect(duration).toBeLessThan(100) // Should be instant with index
		expect(results).toHaveLength(1000)

		const startError = Date.now()
		const errors = await traceQueries.getErrors(100)
		const durationError = Date.now() - startError

		console.log(`Queried 100 errors from ${batchSize} in ${durationError}ms`)
		expect(durationError).toBeLessThan(100) // Should be instant with index
	})
})
