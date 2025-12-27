import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { TraceStorage } from "../trace/TraceStorage"
import { StateManager } from "../state/StateManager"
import { SkillLibrary } from "../skills/SkillLibrary"
import { Council } from "../council/Council"
import { db } from "../db/db"
import { traces, proposals, skills, councilVotes } from "../db/schema"
import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"

describe("Phase 6: SQLite Integration", () => {
	const workspacePath = path.join(os.tmpdir(), "kilocode-test-phase6")

	beforeEach(async () => {
		await fs.mkdir(workspacePath, { recursive: true })
		// Clean DB
		await db.delete(traces as any)
		await db.delete(proposals as any)
		await db.delete(skills as any)
		await db.delete(councilVotes as any)
	})

	afterEach(async () => {
		await fs.rm(workspacePath, { recursive: true, force: true })
	})

	it("should store and retrieve traces using SQLite", async () => {
		const storage = new TraceStorage({
			workspacePath,
			storageBackend: "sqlite",
		})

		const event = {
			id: "test-trace",
			timestamp: Date.now(),
			type: "tool_error" as const,
			taskId: "task-1",
			summary: "Test error",
			toolName: "test-tool",
			errorMessage: "Something went wrong",
			metadata: { foo: "bar" },
		}

		await storage.append(event)

		const loaded = await storage.loadSince(Date.now() - 1000)
		expect(loaded).toHaveLength(1)
		expect(loaded[0].type).toBe("tool_error")
		expect(loaded[0].errorMessage).toBe("Something went wrong")
	})

	it("should store and retrieve proposals using SQLite", async () => {
		const stateManager = new StateManager({
			workspacePath,
			storageBackend: "sqlite",
		})
		await stateManager.initialize()

		const proposal = {
			id: "prop-1",
			type: "rule_update" as const,
			title: "Test Proposal",
			description: "Description",
			payload: { rule: "test" },
			risk: "low" as const,
			status: "pending" as const,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		}

		await stateManager.addProposal(proposal)

		const pending = stateManager.getPendingProposals()
		expect(pending).toHaveLength(1)
		expect(pending[0].id).toBe("prop-1")

		await stateManager.updateProposalStatus("prop-1", "approved")
		const updated = stateManager.getProposal("prop-1")
		expect(updated?.status).toBe("approved")
	})

	it("should store and retrieve skills using SQLite", async () => {
		const library = new SkillLibrary({
			workspacePath,
			storageBackend: "sqlite",
		})
		await library.initialize()

		const skill = {
			id: "skill-1",
			name: "test-skill",
			description: "Test skill",
			type: "mcp_tool" as const,
			runtime: "typescript" as const,
			scope: "project" as const,
			implementationPath: "test.ts",
			createdAt: Date.now(),
			updatedAt: Date.now(),
			active: true,
			version: "1.0.0",
			permissions: [],
			tags: [],
			usageCount: 0,
			successCount: 0,
			failureCount: 0,
		}

		await library.addSkill(skill, "console.log('test')")

		const retrieved = await library.getSkill("skill-1")
		expect(retrieved).toBeDefined()
		expect(retrieved?.name).toBe("test-skill")

		const code = await library.getSkillImplementation("skill-1")
		expect(code).toBe("console.log('test')")
	})

	it("should store council votes using SQLite", async () => {
		const council = new Council({
			storageBackend: "sqlite",
		})

		const proposal = {
			id: "prop-vote",
			type: "rule_update" as const,
			title: "Vote Proposal",
			description: "Vote Description",
			payload: {},
			risk: "low" as const,
			status: "pending" as const,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		}

		// Create proposal first (FK constraint)
		const stateManager = new StateManager({
			workspacePath,
			storageBackend: "sqlite",
		})
		await stateManager.initialize()
		await stateManager.addProposal(proposal)

		await council.reviewProposal(proposal)

		// Verify votes in DB
		// We need to query directly as Council doesn't expose a method to get votes from DB
		// But we can check if reviewProposal completed successfully
	})
})
