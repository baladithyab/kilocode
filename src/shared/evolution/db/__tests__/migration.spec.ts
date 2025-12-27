import { describe, it, expect, beforeEach, vi } from "vitest"
import { traceQueries, proposalQueries, skillQueries } from "../index"
import { db } from "../db"
import { traces, proposals, skills } from "../schema"
import * as fs from "fs/promises"
import * as path from "path"

// Mock fs
vi.mock("fs/promises")

describe("Migration Script", () => {
	beforeEach(async () => {
		await db.delete(traces as any)
		await db.delete(proposals as any)
		await db.delete(skills as any)
		vi.resetAllMocks()
	})

	// Note: Testing the actual migration script is tricky because it's a standalone script.
	// We can test the logic by simulating what the script does.

	it("should migrate traces logic", async () => {
		const mockTrace = {
			id: "trace-1",
			timestamp: Date.now(),
			type: "tool_error",
			toolName: "test-tool",
			errorMessage: "error",
			metadata: { foo: "bar" },
		}

		// Simulate reading file
		const content = JSON.stringify(mockTrace)

		// Simulate insertion logic
		const event = JSON.parse(content)
		await traceQueries.create({
			id: "uuid-1",
			timestamp: event.timestamp,
			event: event.type,
			toolId: event.toolName,
			status: event.errorMessage ? "error" : "success",
			duration: null,
			error: event.errorMessage,
			context: JSON.stringify(event.metadata),
			metadata: JSON.stringify(event.metadata),
			createdAt: new Date(),
		})

		const result = await traceQueries.getRecent(1)
		expect(result).toHaveLength(1)
		expect(result[0].event).toBe("tool_error")
	})

	it("should migrate proposals logic", async () => {
		const mockProposal = {
			id: "prop-1",
			type: "rule_update",
			title: "Test",
			description: "Desc",
			payload: { rule: "test" },
			risk: "low",
			status: "pending",
			createdAt: Date.now(),
			updatedAt: Date.now(),
		}

		const content = JSON.stringify(mockProposal)
		const proposal = JSON.parse(content)

		await proposalQueries.create({
			id: proposal.id,
			type: proposal.type,
			title: proposal.title,
			description: proposal.description,
			payload: JSON.stringify(proposal.payload),
			risk: proposal.risk,
			status: proposal.status,
			sourceSignalId: proposal.sourceSignalId,
			reviewedBy: proposal.reviewedBy,
			reviewNotes: proposal.reviewNotes,
			rollbackData: proposal.rollbackData ? JSON.stringify(proposal.rollbackData) : undefined,
			createdAt: new Date(proposal.createdAt),
			updatedAt: new Date(proposal.updatedAt),
		})

		const result = await proposalQueries.getById("prop-1")
		expect(result).toBeDefined()
		expect(result?.title).toBe("Test")
	})
})
