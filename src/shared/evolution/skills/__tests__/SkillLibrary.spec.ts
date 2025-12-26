/**
 * Tests for SkillLibrary
 */

import { describe, it, expect, beforeEach } from "vitest"
import { SkillLibrary, type FileSystem } from "../SkillLibrary"
import type { SkillMetadata } from "@roo-code/types"

// Mock file system for testing
class MockFileSystem implements FileSystem {
	private files: Map<string, string> = new Map()

	async readFile(path: string): Promise<string> {
		const content = this.files.get(path)
		if (content === undefined) {
			throw new Error(`ENOENT: no such file or directory: ${path}`)
		}
		return content
	}

	async writeFile(path: string, content: string): Promise<void> {
		this.files.set(path, content)
	}

	async exists(path: string): Promise<boolean> {
		return this.files.has(path)
	}

	async mkdir(_path: string, _options?: { recursive?: boolean }): Promise<void> {
		// No-op
	}

	async readdir(dirPath: string): Promise<string[]> {
		const prefix = dirPath.endsWith("/") ? dirPath : dirPath + "/"
		const files: string[] = []
		for (const key of this.files.keys()) {
			if (key.startsWith(prefix)) {
				const relative = key.slice(prefix.length)
				const firstPart = relative.split("/")[0]
				if (firstPart && !files.includes(firstPart)) {
					files.push(firstPart)
				}
			}
		}
		return files
	}

	async unlink(path: string): Promise<void> {
		this.files.delete(path)
	}

	async stat(path: string): Promise<{ isDirectory: boolean; isFile: boolean }> {
		return {
			isDirectory: false,
			isFile: this.files.has(path),
		}
	}

	// Test helper to set initial files
	setFile(path: string, content: string): void {
		this.files.set(path, content)
	}
}

describe("SkillLibrary", () => {
	let library: SkillLibrary
	let mockFs: MockFileSystem

	const createTestSkill = (overrides: Partial<SkillMetadata> = {}): SkillMetadata => ({
		id: `skill-test-${Date.now()}`,
		name: "Test Skill",
		description: "A test skill for unit testing",
		type: "workflow",
		runtime: "typescript",
		scope: "project",
		implementationPath: "test_skill.ts",
		parameters: {},
		tags: ["test"],
		usageCount: 0,
		successCount: 0,
		failureCount: 0,
		active: true,
		version: "1.0.0",
		createdAt: Date.now(),
		updatedAt: Date.now(),
		permissions: [],
		...overrides,
	})

	beforeEach(() => {
		mockFs = new MockFileSystem()
		library = new SkillLibrary(
			{
				workspacePath: "/test/workspace",
				skillsDir: ".kilocode/skills",
			},
			mockFs,
		)
	})

	describe("initialize", () => {
		it("should initialize the library", async () => {
			await library.initialize()
			// Should not throw
		})

		it("should be idempotent", async () => {
			await library.initialize()
			await library.initialize() // Should not throw
		})
	})

	describe("addSkill", () => {
		it("should add a new skill", async () => {
			await library.initialize()

			const skill = createTestSkill({ id: "my-test-skill" })
			const implementation = "export default function test() { return 'hello'; }"

			await library.addSkill(skill, implementation)

			const retrieved = await library.getSkill("my-test-skill")
			expect(retrieved).toBeDefined()
			expect(retrieved?.name).toBe("Test Skill")
		})

		it("should store implementation", async () => {
			await library.initialize()

			const skill = createTestSkill({ id: "impl-test" })
			const implementation = "export default function test() { return 42; }"

			await library.addSkill(skill, implementation)

			const code = await library.getSkillImplementation("impl-test")
			expect(code).toBe(implementation)
		})

		it("should reject skills without ID", async () => {
			await library.initialize()

			const skill = createTestSkill({ id: "" })

			await expect(library.addSkill(skill, "// code")).rejects.toThrow("Skill must have an ID")
		})

		it("should reject skills without name", async () => {
			await library.initialize()

			const skill = createTestSkill({ name: "" })

			await expect(library.addSkill(skill, "// code")).rejects.toThrow("Skill must have a name")
		})
	})

	describe("searchSkills", () => {
		it("should find skills by name", async () => {
			await library.initialize()

			await library.addSkill(
				createTestSkill({ id: "file-processor", name: "File Processor", description: "Process files" }),
				"// code",
			)
			await library.addSkill(
				createTestSkill({ id: "data-transform", name: "Data Transform", description: "Transform data" }),
				"// code",
			)

			const results = await library.searchSkills("file")

			expect(results.length).toBeGreaterThan(0)
			expect(results[0].id).toBe("file-processor")
		})

		it("should find skills by description", async () => {
			await library.initialize()

			await library.addSkill(
				createTestSkill({
					id: "api-client",
					name: "API Client",
					description: "Make HTTP requests to external services",
				}),
				"// code",
			)

			const results = await library.searchSkills("HTTP requests")

			expect(results.length).toBeGreaterThan(0)
			expect(results[0].id).toBe("api-client")
		})

		it("should find skills by tags", async () => {
			await library.initialize()

			await library.addSkill(
				createTestSkill({
					id: "database-query",
					name: "Database Query",
					tags: ["sql", "database", "query"],
				}),
				"// code",
			)

			const results = await library.searchSkills("sql")

			expect(results.length).toBeGreaterThan(0)
			expect(results[0].id).toBe("database-query")
		})

		it("should return empty array for unmatched query", async () => {
			await library.initialize()

			await library.addSkill(createTestSkill({ id: "some-skill", name: "Some Skill" }), "// code")

			const results = await library.searchSkills("nonexistent")

			expect(results).toHaveLength(0)
		})

		it("should respect limit parameter", async () => {
			await library.initialize()

			for (let i = 0; i < 10; i++) {
				await library.addSkill(
					createTestSkill({ id: `skill-${i}`, name: `Test Skill ${i}`, tags: ["common"] }),
					"// code",
				)
			}

			const results = await library.searchSkills("test", 3)

			expect(results.length).toBeLessThanOrEqual(3)
		})
	})

	describe("updateSkillMetrics", () => {
		it("should update usage count", async () => {
			await library.initialize()

			const skill = createTestSkill({ id: "metrics-test", usageCount: 0 })
			await library.addSkill(skill, "// code")

			await library.updateSkillMetrics("metrics-test", { usageCount: 5 })

			const updated = await library.getSkill("metrics-test")
			expect(updated?.usageCount).toBe(5)
		})

		it("should calculate success rate", async () => {
			await library.initialize()

			const skill = createTestSkill({ id: "rate-test" })
			await library.addSkill(skill, "// code")

			await library.updateSkillMetrics("rate-test", {
				successCount: 8,
				failureCount: 2,
			})

			const updated = await library.getSkill("rate-test")
			expect(updated?.successRate).toBe(0.8)
		})

		it("should throw for non-existent skill", async () => {
			await library.initialize()

			await expect(library.updateSkillMetrics("nonexistent", { usageCount: 1 })).rejects.toThrow(
				"Skill not found",
			)
		})
	})

	describe("recordExecution", () => {
		it("should increment usage count on success", async () => {
			await library.initialize()

			const skill = createTestSkill({ id: "exec-test", usageCount: 0, successCount: 0 })
			await library.addSkill(skill, "// code")

			await library.recordExecution("exec-test", true)

			const updated = await library.getSkill("exec-test")
			expect(updated?.usageCount).toBe(1)
			expect(updated?.successCount).toBe(1)
		})

		it("should increment failure count on failure", async () => {
			await library.initialize()

			const skill = createTestSkill({ id: "fail-test", usageCount: 0, failureCount: 0 })
			await library.addSkill(skill, "// code")

			await library.recordExecution("fail-test", false)

			const updated = await library.getSkill("fail-test")
			expect(updated?.usageCount).toBe(1)
			expect(updated?.failureCount).toBe(1)
		})
	})

	describe("listSkills", () => {
		it("should list all skills", async () => {
			await library.initialize()

			await library.addSkill(createTestSkill({ id: "skill-1" }), "// code")
			await library.addSkill(createTestSkill({ id: "skill-2" }), "// code")
			await library.addSkill(createTestSkill({ id: "skill-3" }), "// code")

			const skills = await library.listSkills()

			expect(skills).toHaveLength(3)
		})

		it("should filter by scope", async () => {
			await library.initialize()

			await library.addSkill(createTestSkill({ id: "project-1", scope: "project" }), "// code")
			await library.addSkill(createTestSkill({ id: "global-1", scope: "global" }), "// code")

			const projectSkills = await library.listSkills("project")

			expect(projectSkills).toHaveLength(1)
			expect(projectSkills[0].id).toBe("project-1")
		})
	})

	describe("listActiveSkills", () => {
		it("should only list active skills", async () => {
			await library.initialize()

			await library.addSkill(createTestSkill({ id: "active-1", active: true }), "// code")
			await library.addSkill(createTestSkill({ id: "inactive-1", active: false }), "// code")

			const activeSkills = await library.listActiveSkills()

			expect(activeSkills).toHaveLength(1)
			expect(activeSkills[0].id).toBe("active-1")
		})
	})

	describe("deleteSkill", () => {
		it("should delete a skill", async () => {
			await library.initialize()

			await library.addSkill(createTestSkill({ id: "to-delete" }), "// code")
			await library.deleteSkill("to-delete")

			const skill = await library.getSkill("to-delete")
			expect(skill).toBeNull()
		})

		it("should throw for non-existent skill", async () => {
			await library.initialize()

			await expect(library.deleteSkill("nonexistent")).rejects.toThrow("Skill not found")
		})
	})

	describe("deactivateSkill / activateSkill", () => {
		it("should deactivate a skill", async () => {
			await library.initialize()

			await library.addSkill(createTestSkill({ id: "toggle-test", active: true }), "// code")
			await library.deactivateSkill("toggle-test")

			const skill = await library.getSkill("toggle-test")
			expect(skill?.active).toBe(false)
		})

		it("should activate a skill", async () => {
			await library.initialize()

			await library.addSkill(createTestSkill({ id: "activate-test", active: false }), "// code")
			await library.activateSkill("activate-test")

			const skill = await library.getSkill("activate-test")
			expect(skill?.active).toBe(true)
		})
	})

	describe("getStats", () => {
		it("should return correct statistics", async () => {
			await library.initialize()

			await library.addSkill(
				createTestSkill({
					id: "stat-1",
					scope: "project",
					type: "workflow",
					runtime: "typescript",
					active: true,
					successRate: 0.9,
				}),
				"// code",
			)
			await library.addSkill(
				createTestSkill({
					id: "stat-2",
					scope: "global",
					type: "mcp_tool",
					runtime: "typescript",
					active: false,
					successRate: 0.7,
				}),
				"// code",
			)

			const stats = await library.getStats()

			expect(stats.totalSkills).toBe(2)
			expect(stats.activeSkills).toBe(1)
			expect(stats.skillsByScope.project).toBe(1)
			expect(stats.skillsByScope.global).toBe(1)
			expect(stats.averageSuccessRate).toBe(0.8)
		})
	})
})
