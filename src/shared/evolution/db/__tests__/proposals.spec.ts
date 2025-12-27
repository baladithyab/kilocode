import { describe, it, expect, beforeEach } from "vitest"
import { proposalQueries } from "../queries/proposals"
import { db } from "../db"
import { proposals } from "../schema"
import { v4 as uuidv4 } from "uuid"

describe("Proposal Queries", () => {
	beforeEach(async () => {
		await db.delete(proposals as any)
	})

	it("should create and retrieve a proposal", async () => {
		const proposalId = uuidv4()
		const proposal = {
			id: proposalId,
			type: "rule_update",
			title: "Test Proposal",
			description: "This is a test proposal",
			payload: JSON.stringify({ rule: "test" }),
			risk: "low" as const,
			status: "pending" as const,
			createdAt: new Date(),
			updatedAt: new Date(),
		}

		await proposalQueries.create(proposal)

		const retrieved = await proposalQueries.getById(proposalId)
		expect(retrieved).toBeDefined()
		expect(retrieved?.id).toBe(proposalId)
		expect(retrieved?.title).toBe("Test Proposal")
	})

	it("should retrieve pending proposals", async () => {
		const p1 = {
			id: uuidv4(),
			type: "rule_update",
			title: "P1",
			description: "P1",
			payload: JSON.stringify({}),
			risk: "low" as const,
			status: "pending" as const,
			createdAt: new Date(Date.now() - 1000),
			updatedAt: new Date(),
		}
		const p2 = {
			id: uuidv4(),
			type: "rule_update",
			title: "P2",
			description: "P2",
			payload: JSON.stringify({}),
			risk: "low" as const,
			status: "approved" as const,
			createdAt: new Date(),
			updatedAt: new Date(),
		}

		await proposalQueries.create(p1)
		await proposalQueries.create(p2)

		const pending = await proposalQueries.getPending()
		expect(pending).toHaveLength(1)
		expect(pending[0].id).toBe(p1.id)
	})

	it("should update proposal status", async () => {
		const proposalId = uuidv4()
		const proposal = {
			id: proposalId,
			type: "rule_update",
			title: "Test Proposal",
			description: "This is a test proposal",
			payload: JSON.stringify({ rule: "test" }),
			risk: "low" as const,
			status: "pending" as const,
			createdAt: new Date(),
			updatedAt: new Date(),
		}

		await proposalQueries.create(proposal)
		await proposalQueries.updateStatus(proposalId, "approved", "Looks good")

		const updated = await proposalQueries.getById(proposalId)
		expect(updated?.status).toBe("approved")
		expect(updated?.reviewNotes).toBe("Looks good")
	})
})
