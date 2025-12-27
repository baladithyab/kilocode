import { describe, it, expect, beforeEach } from "vitest"
import { traceQueries } from "../queries/traces"
import { db } from "../db"
import { traces } from "../schema"
import { sql } from "drizzle-orm"
import { v4 as uuidv4 } from "uuid"

describe("Trace Queries", () => {
	beforeEach(async () => {
		await db.delete(traces as any)
	})

	it("should create and retrieve a trace", async () => {
		const traceId = uuidv4()
		const trace = {
			id: traceId,
			timestamp: Date.now(),
			event: "tool_error",
			toolId: "test-tool",
			status: "error" as const,
			error: "Something went wrong",
			context: JSON.stringify({ foo: "bar" }),
			metadata: JSON.stringify({ baz: "qux" }),
			createdAt: new Date(),
		}

		await traceQueries.create(trace)

		const retrieved = await traceQueries.getById(traceId)
		expect(retrieved).toBeDefined()
		expect(retrieved?.id).toBe(traceId)
		expect(retrieved?.event).toBe("tool_error")
	})

	it("should retrieve recent traces", async () => {
		const trace1 = {
			id: uuidv4(),
			timestamp: Date.now() - 1000,
			event: "tool_success",
			status: "success" as const,
			createdAt: new Date(),
		}
		const trace2 = {
			id: uuidv4(),
			timestamp: Date.now(),
			event: "tool_error",
			status: "error" as const,
			createdAt: new Date(),
		}

		await traceQueries.create(trace1)
		await traceQueries.create(trace2)

		const recent = await traceQueries.getRecent(10)
		expect(recent).toHaveLength(2)
		expect(recent[0].id).toBe(trace2.id) // Most recent first
	})

	it("should retrieve errors", async () => {
		const trace1 = {
			id: uuidv4(),
			timestamp: Date.now(),
			event: "tool_success",
			status: "success" as const,
			createdAt: new Date(),
		}
		const trace2 = {
			id: uuidv4(),
			timestamp: Date.now(),
			event: "tool_error",
			status: "error" as const,
			createdAt: new Date(),
		}

		await traceQueries.create(trace1)
		await traceQueries.create(trace2)

		const errors = await traceQueries.getErrors()
		expect(errors).toHaveLength(1)
		expect(errors[0].id).toBe(trace2.id)
	})
})
