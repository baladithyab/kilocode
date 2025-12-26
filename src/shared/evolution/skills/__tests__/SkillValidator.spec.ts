/**
 * Tests for SkillValidator
 */

import { describe, it, expect, beforeEach } from "vitest"
import { SkillValidator } from "../SkillValidator"
import type { SkillMetadata } from "@roo-code/types"

describe("SkillValidator", () => {
	let validator: SkillValidator

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
		validator = new SkillValidator()
	})

	describe("validate", () => {
		it("should pass valid TypeScript code", async () => {
			const code = `
export default async function process(args: { input: string }): Promise<{ result: string }> {
  try {
    return { result: args.input.toUpperCase() };
  } catch (error) {
    throw new Error('Processing failed');
  }
}
`
			const result = await validator.validate(code, createTestMetadata())

			expect(result.valid).toBe(true)
			expect(result.issues.filter((i) => i.severity === "error")).toHaveLength(0)
		})

		it("should detect code that is too large", async () => {
			const largeCode = "x".repeat(200000) // 200KB

			const result = await validator.validate(largeCode, createTestMetadata())

			expect(result.valid).toBe(false)
			expect(result.issues.some((i) => i.code === "SIZE_EXCEEDED")).toBe(true)
		})

		it("should complete all validation stages on valid code", async () => {
			const code = `export const test = () => "hello";`

			const result = await validator.validate(code, createTestMetadata())

			expect(result.stagesCompleted).toContain("size_check")
			expect(result.stagesCompleted).toContain("syntax")
			expect(result.stagesCompleted).toContain("security")
			expect(result.stagesCompleted).toContain("structure")
			expect(result.stagesCompleted).toContain("best_practices")
		})
	})

	describe("scanSecurity", () => {
		it("should detect eval usage", () => {
			const code = `const result = eval('1 + 1');`

			const issues = validator.scanSecurity(code)

			expect(issues.some((i) => i.code.includes("EVAL"))).toBe(true)
			expect(issues.some((i) => i.severity === "error")).toBe(true)
		})

		it("should detect Function constructor", () => {
			const code = `const fn = new Function('a', 'return a + 1');`

			const issues = validator.scanSecurity(code)

			expect(issues.some((i) => i.code.includes("FUNCTION_CONSTRUCTOR"))).toBe(true)
		})

		it("should detect process.env modification", () => {
			const code = `process.env.SECRET = 'value';`

			const issues = validator.scanSecurity(code)

			expect(issues.some((i) => i.code.includes("PROCESS"))).toBe(true)
		})

		it("should warn about direct fs access", () => {
			const code = `import * as fs from 'fs';`

			const issues = validator.scanSecurity(code)

			expect(issues.some((i) => i.code.includes("FS"))).toBe(true)
			expect(issues.some((i) => i.severity === "warning")).toBe(true)
		})

		it("should warn about child_process access", () => {
			const code = `import { spawn } from 'child_process';`

			const issues = validator.scanSecurity(code)

			expect(issues.some((i) => i.code.includes("CHILD_PROCESS"))).toBe(true)
		})

		it("should detect potential infinite loops", () => {
			const code = `while (true) { doSomething(); }`

			const issues = validator.scanSecurity(code)

			expect(issues.some((i) => i.code.includes("INFINITE_LOOP"))).toBe(true)
		})

		it("should warn about global variable modification", () => {
			const code = `global.myVar = 'value';`

			const issues = validator.scanSecurity(code)

			expect(issues.some((i) => i.code.includes("GLOBAL"))).toBe(true)
		})

		it("should warn about prototype modification", () => {
			const code = `String.prototype.myMethod = function() {};`

			const issues = validator.scanSecurity(code)

			expect(issues.some((i) => i.code.includes("PROTOTYPE"))).toBe(true)
		})

		it("should pass clean code", () => {
			const code = `
export default function process(input: string): string {
  return input.toUpperCase();
}
`
			const issues = validator.scanSecurity(code)

			expect(issues.filter((i) => i.severity === "error")).toHaveLength(0)
		})
	})

	describe("validateSyntax", () => {
		it("should detect unclosed braces", async () => {
			const code = `
function test() {
  if (true) {
    console.log('hello');
  // missing closing brace
}
`
			const issues = await validator.validateSyntax(code, "typescript")

			expect(issues.some((i) => i.code.includes("BRACE"))).toBe(true)
		})

		it("should detect unclosed strings", async () => {
			const code = `const str = "unclosed string;`

			const issues = await validator.validateSyntax(code, "typescript")

			expect(issues.some((i) => i.code.includes("STRING"))).toBe(true)
		})

		it("should warn about missing export", async () => {
			const code = `function internalOnly() { return 42; }`

			const issues = await validator.validateSyntax(code, "typescript")

			expect(issues.some((i) => i.code.includes("EXPORT"))).toBe(true)
		})

		it("should pass code with export", async () => {
			const code = `export function myFunction() { return 42; }`

			const issues = await validator.validateSyntax(code, "typescript")

			expect(issues.filter((i) => i.code.includes("EXPORT"))).toHaveLength(0)
		})
	})

	describe("Python validation", () => {
		it("should warn about missing function definition", async () => {
			const code = `print("hello world")`

			const issues = await validator.validateSyntax(code, "python")

			expect(issues.some((i) => i.code.includes("FUNCTION"))).toBe(true)
		})

		it("should pass code with function definition", async () => {
			const code = `
def main():
    print("hello")

if __name__ == "__main__":
    main()
`
			const issues = await validator.validateSyntax(code, "python")

			expect(issues.filter((i) => i.code.includes("FUNCTION"))).toHaveLength(0)
		})
	})

	describe("Shell validation", () => {
		it("should suggest shebang", async () => {
			const code = `echo "hello world"`

			const issues = await validator.validateSyntax(code, "shell")

			expect(issues.some((i) => i.code.includes("SHEBANG"))).toBe(true)
		})

		it("should suggest set -e", async () => {
			const code = `#!/bin/bash
echo "hello"
`
			const issues = await validator.validateSyntax(code, "shell")

			expect(issues.some((i) => i.code.includes("SET_E"))).toBe(true)
		})

		it("should pass proper shell script", async () => {
			const code = `#!/bin/bash
set -e
echo "hello"
`
			const issues = await validator.validateSyntax(code, "shell")

			expect(issues.filter((i) => i.severity === "error")).toHaveLength(0)
		})
	})

	describe("best practices", () => {
		it("should warn about async without error handling", async () => {
			const code = `
export default async function noErrorHandle() {
  const result = await fetch('https://api.example.com');
  return result;
}
`
			const result = await validator.validate(code, createTestMetadata())

			expect(result.issues.some((i) => i.code.includes("ERROR_HANDLING"))).toBe(true)
		})

		it("should inform about any type usage", async () => {
			const code = `
export default function useAny(input: any): any {
  return input;
}
`
			const result = await validator.validate(code, createTestMetadata())

			expect(result.issues.some((i) => i.code.includes("ANY_TYPE"))).toBe(true)
		})

		it("should inform about console.log usage", async () => {
			const code = `
export default function logging() {
  console.log('debug info');
}
`
			const result = await validator.validate(code, createTestMetadata())

			expect(result.issues.some((i) => i.code.includes("CONSOLE_LOG"))).toBe(true)
		})
	})

	describe("custom patterns", () => {
		it("should allow adding custom dangerous patterns", () => {
			validator.addDangerousPattern({
				name: "test_pattern",
				pattern: /TEST_FORBIDDEN/g,
				severity: "error",
				explanation: "Test pattern is not allowed",
				isBlocking: true,
			})

			const issues = validator.scanSecurity("const x = TEST_FORBIDDEN;")

			expect(issues.some((i) => i.message.includes("Test pattern"))).toBe(true)
		})

		it("should allow removing dangerous patterns", () => {
			validator.removeDangerousPattern("eval")

			const issues = validator.scanSecurity("const x = eval('1');")

			expect(issues.filter((i) => i.code.includes("EVAL"))).toHaveLength(0)
		})

		it("should return all dangerous patterns", () => {
			const patterns = validator.getDangerousPatterns()

			expect(patterns.length).toBeGreaterThan(0)
			expect(patterns.some((p) => p.name === "eval")).toBe(true)
		})
	})

	describe("configuration", () => {
		it("should respect maxSkillSize config", async () => {
			const smallValidator = new SkillValidator({ maxSkillSize: 100 })
			const code = "x".repeat(200)

			const result = await smallValidator.validate(code, createTestMetadata())

			expect(result.issues.some((i) => i.code === "SIZE_EXCEEDED")).toBe(true)
		})

		it("should allow disabling security scan", async () => {
			const noSecurityValidator = new SkillValidator({ enableSecurityScan: false })
			const code = `const x = eval('1');`

			const result = await noSecurityValidator.validate(code, createTestMetadata())

			expect(result.stagesCompleted).not.toContain("security")
		})

		it("should allow disabling syntax validation", async () => {
			const noSyntaxValidator = new SkillValidator({ enableSyntaxValidation: false })
			const code = `function broken() { // unclosed`

			const result = await noSyntaxValidator.validate(code, createTestMetadata())

			expect(result.stagesCompleted).not.toContain("syntax")
		})
	})
})
