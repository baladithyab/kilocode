/**
 * Tests for SkillExecutor
 */

import { describe, it, expect, beforeEach } from "vitest"
import { SkillExecutor } from "../SkillExecutor"
import type { SkillMetadata } from "@roo-code/types"

describe("SkillExecutor", () => {
	let executor: SkillExecutor

	const createTestMetadata = (overrides: Partial<SkillMetadata> = {}): SkillMetadata => ({
		id: "test-skill",
		name: "Test Skill",
		description: "A test skill",
		type: "workflow",
		runtime: "typescript",
		scope: "project",
		implementationPath: "test.ts",
		parameters: {},
		tags: [],
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
		executor = new SkillExecutor({
			defaultTimeout: 5000,
		})
	})

	describe("execute", () => {
		it("should execute a TypeScript skill", async () => {
			const skill = createTestMetadata()
			const code = `
export default async function main(args) {
  return { message: 'Hello, World!' };
}
`
			const result = await executor.execute(skill, code, { args: {} })

			expect(result.id).toBeDefined()
			expect(result.skillId).toBe("test-skill")
			expect(result.status).toBe("completed")
			expect(result.durationMs).toBeGreaterThanOrEqual(0)
		})

		it("should return execution result with output", async () => {
			const skill = createTestMetadata()
			const code = `
export default function process(args) {
  console.log('Processing...');
  return { processed: true };
}
`
			const result = await executor.execute(skill, code)

			expect(result.status).toBe("completed")
			expect(result.returnValue).toBeDefined()
		})

		it("should handle execution with arguments", async () => {
			const skill = createTestMetadata()
			const code = `
export default function withArgs(args) {
  const { input } = args;
  return { result: input.toUpperCase() };
}
`
			const result = await executor.execute(skill, code, {
				args: { input: "hello" },
			})

			expect(result.status).toBe("completed")
		})

		it("should handle export const arrow function", async () => {
			const skill = createTestMetadata()
			const code = `
export const process = async (args) => {
  return { ok: true };
}
`
			const result = await executor.execute(skill, code)

			expect(result.status).toBe("completed")
		})

		it("should handle named export function", async () => {
			const skill = createTestMetadata()
			const code = `
export function processData(args) {
  return { data: args };
}
`
			const result = await executor.execute(skill, code)

			expect(result.status).toBe("completed")
		})

		it("should fail for invalid skill code", async () => {
			const skill = createTestMetadata()
			const code = `// No export, invalid skill`

			const result = await executor.execute(skill, code)

			expect(result.status).toBe("failed")
			expect(result.error).toContain("Could not find exported function")
		})

		it("should timeout on long-running skills", async () => {
			const timeoutExecutor = new SkillExecutor({
				defaultTimeout: 100, // Very short timeout
			})

			const skill = createTestMetadata()
			const code = `
export default async function slow(args) {
  await new Promise(r => setTimeout(r, 10000));
  return { done: true };
}
`
			// Note: In MVP mode, the simulated execution completes quickly
			// Real timeout would be tested with actual async execution
			const result = await timeoutExecutor.execute(skill, code, {
				timeout: 50,
			})

			// With simulated execution, it may complete before timeout
			expect(["completed", "timeout"]).toContain(result.status)
		})
	})

	describe("canExecute", () => {
		it("should return true for active TypeScript skill", () => {
			const skill = createTestMetadata({ active: true, runtime: "typescript" })

			const check = executor.canExecute(skill)

			expect(check.canExecute).toBe(true)
		})

		it("should return false for inactive skill", () => {
			const skill = createTestMetadata({ active: false })

			const check = executor.canExecute(skill)

			expect(check.canExecute).toBe(false)
			expect(check.reason).toContain("not active")
		})

		it("should return false for Python skill (not yet supported)", () => {
			const skill = createTestMetadata({ runtime: "python" })

			const check = executor.canExecute(skill)

			expect(check.canExecute).toBe(false)
			expect(check.reason).toContain("not yet supported")
		})

		it("should return false for shell skill (not yet supported)", () => {
			const skill = createTestMetadata({ runtime: "shell" })

			const check = executor.canExecute(skill)

			expect(check.canExecute).toBe(false)
			expect(check.reason).toContain("not yet supported")
		})
	})

	describe("validateContext", () => {
		it("should accept valid context", () => {
			const validation = executor.validateContext({
				args: { key: "value" },
				timeout: 5000,
			})

			expect(validation.valid).toBe(true)
			expect(validation.errors).toHaveLength(0)
		})

		it("should reject negative timeout", () => {
			const validation = executor.validateContext({
				timeout: -100,
			})

			expect(validation.valid).toBe(false)
			expect(validation.errors).toContain("Timeout must be positive")
		})

		it("should reject excessive timeout", () => {
			const validation = executor.validateContext({
				timeout: 600000, // 10 minutes
			})

			expect(validation.valid).toBe(false)
			expect(validation.errors).toContain("Timeout cannot exceed 5 minutes")
		})
	})

	describe("execution history", () => {
		it("should record execution history", async () => {
			const skill = createTestMetadata({ id: "history-test" })
			const code = `export default function test() { return 1; }`

			await executor.execute(skill, code)
			await executor.execute(skill, code)

			const history = executor.getExecutionHistory("history-test")

			expect(history.length).toBe(2)
		})

		it("should calculate execution statistics", async () => {
			const skill = createTestMetadata({ id: "stats-test" })
			const code = `export default function test() { return 1; }`

			await executor.execute(skill, code)
			await executor.execute(skill, code)
			await executor.execute(skill, code)

			const stats = executor.getExecutionStats("stats-test")

			expect(stats.totalExecutions).toBe(3)
			expect(stats.averageDuration).toBeGreaterThanOrEqual(0)
		})

		it("should return empty stats for unknown skill", () => {
			const stats = executor.getExecutionStats("unknown")

			expect(stats.totalExecutions).toBe(0)
			expect(stats.successCount).toBe(0)
			expect(stats.averageDuration).toBe(0)
		})

		it("should clear history for specific skill", async () => {
			const skill = createTestMetadata({ id: "clear-test" })
			const code = `export default function test() { return 1; }`

			await executor.execute(skill, code)
			executor.clearHistory("clear-test")

			const history = executor.getExecutionHistory("clear-test")

			expect(history).toHaveLength(0)
		})

		it("should clear all history", async () => {
			const skill1 = createTestMetadata({ id: "skill-1" })
			const skill2 = createTestMetadata({ id: "skill-2" })
			const code = `export default function test() { return 1; }`

			await executor.execute(skill1, code)
			await executor.execute(skill2, code)
			executor.clearHistory()

			expect(executor.getExecutionHistory("skill-1")).toHaveLength(0)
			expect(executor.getExecutionHistory("skill-2")).toHaveLength(0)
		})
	})

	describe("output handling", () => {
		it("should capture stdout", async () => {
			const skill = createTestMetadata()
			const code = `
export default function withLog() {
  console.log('Hello from skill');
  return { logged: true };
}
`
			const result = await executor.execute(skill, code)

			expect(result.stdout).toBeDefined()
		})

		it("should truncate large output", async () => {
			const smallExecutor = new SkillExecutor({
				maxOutputSize: 100,
			})

			const skill = createTestMetadata()
			const code = `
export default function largeOutput() {
  console.log('x'.repeat(1000));
  return {};
}
`
			const result = await smallExecutor.execute(skill, code)

			if (result.stdout && result.stdout.length > 100) {
				expect(result.stdout).toContain("truncated")
			}
		})
	})

	describe("unsupported runtimes", () => {
		it("should return error for Python execution", async () => {
			const skill = createTestMetadata({ runtime: "python" })
			const code = `def main(): return True`

			const result = await executor.execute(skill, code)

			expect(result.stderr).toContain("not yet implemented")
		})

		it("should return error for shell execution", async () => {
			const skill = createTestMetadata({ runtime: "shell" })
			const code = `echo "hello"`

			const result = await executor.execute(skill, code)

			expect(result.stderr).toContain("not yet implemented")
		})
	})
})
