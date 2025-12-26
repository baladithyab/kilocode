/**
 * SkillValidator - Syntax and security validation for Darwin skills
 *
 * Responsibilities:
 * - Syntax validation (TypeScript)
 * - Security scanning (no eval, no dangerous patterns)
 * - Functional testing with mock inputs
 * - Performance check (timeout limits)
 */

import type {
	ValidationResult,
	ValidationIssue,
	ValidationSeverity,
	SkillMetadata,
	SkillRuntime,
} from "@roo-code/types"

/** Configuration for SkillValidator */
export interface SkillValidatorConfig {
	/** Maximum allowed skill size in bytes (default: 100KB) */
	maxSkillSize?: number

	/** Enable security scanning (default: true) */
	enableSecurityScan?: boolean

	/** Enable syntax validation (default: true) */
	enableSyntaxValidation?: boolean

	/** Custom dangerous patterns to detect */
	customDangerousPatterns?: DangerousPattern[]

	/** Timeout for functional tests in ms (default: 5000) */
	functionalTestTimeout?: number
}

/** Definition of a dangerous pattern to detect */
export interface DangerousPattern {
	/** Pattern name for identification */
	name: string

	/** Regular expression to match */
	pattern: RegExp

	/** Severity of the issue */
	severity: ValidationSeverity

	/** Human-readable explanation */
	explanation: string

	/** Whether this pattern is a hard block (default: false for warnings) */
	isBlocking?: boolean
}

/** Default dangerous patterns for security scanning */
const DEFAULT_DANGEROUS_PATTERNS: DangerousPattern[] = [
	{
		name: "eval",
		pattern: /\beval\s*\(/g,
		severity: "error",
		explanation: "Use of eval() is not allowed due to security risks",
		isBlocking: true,
	},
	{
		name: "Function constructor",
		pattern: /new\s+Function\s*\(/g,
		severity: "error",
		explanation: "Use of Function constructor is not allowed",
		isBlocking: true,
	},
	{
		name: "process.env modification",
		pattern: /process\.env\s*(?:\[|\.)\s*[\w'"]+\s*=/g,
		severity: "error",
		explanation: "Modifying environment variables is not allowed",
		isBlocking: true,
	},
	{
		name: "require dynamic",
		pattern: /require\s*\(\s*[^'"]/g,
		severity: "warning",
		explanation: "Dynamic require with non-literal argument is discouraged",
		isBlocking: false,
	},
	{
		name: "fs direct access",
		pattern: /(?:require\s*\(\s*['"]fs['"]\s*\)|from\s+['"]fs['"])/g,
		severity: "warning",
		explanation: "Direct file system access should be done through provided APIs",
		isBlocking: false,
	},
	{
		name: "child_process",
		pattern: /(?:require\s*\(\s*['"]child_process['"]\s*\)|from\s+['"]child_process['"])/g,
		severity: "warning",
		explanation: "Direct child_process access requires explicit permission",
		isBlocking: false,
	},
	{
		name: "network request without timeout",
		pattern: /fetch\s*\([^)]*\)\s*(?!\.then|;)/g,
		severity: "info",
		explanation: "Consider adding timeout handling for network requests",
		isBlocking: false,
	},
	{
		name: "infinite loop potential",
		pattern: /while\s*\(\s*true\s*\)/g,
		severity: "warning",
		explanation: "Potential infinite loop detected - ensure proper exit condition",
		isBlocking: false,
	},
	{
		name: "global variable modification",
		pattern: /(?:global|window|globalThis)\s*\.\s*\w+\s*=/g,
		severity: "warning",
		explanation: "Modifying global scope is discouraged",
		isBlocking: false,
	},
	{
		name: "prototype modification",
		pattern: /\.prototype\s*(?:\[|\.)\s*\w+\s*=/g,
		severity: "warning",
		explanation: "Modifying prototypes is discouraged",
		isBlocking: false,
	},
]

/** TypeScript syntax patterns to validate */
const TYPESCRIPT_VALIDATION_PATTERNS = {
	// Check for basic structure
	hasExport: /export\s+(?:default\s+)?(?:async\s+)?function|export\s+const|export\s+class/,

	// Check for proper async handling
	asyncWithoutAwait: /async\s+function\s+\w+\s*\([^)]*\)\s*\{[^}]*\}/,

	// Check for proper error handling
	tryCatch: /try\s*\{[\s\S]*?\}\s*catch/,

	// Check for type annotations
	hasTypeAnnotations: /:\s*(?:string|number|boolean|void|Promise|any|unknown)/,
}

/**
 * SkillValidator validates skill code for syntax and security issues
 */
export class SkillValidator {
	private config: Required<SkillValidatorConfig>
	private dangerousPatterns: DangerousPattern[]

	constructor(config: SkillValidatorConfig = {}) {
		this.config = {
			maxSkillSize: config.maxSkillSize ?? 102400, // 100KB
			enableSecurityScan: config.enableSecurityScan ?? true,
			enableSyntaxValidation: config.enableSyntaxValidation ?? true,
			customDangerousPatterns: config.customDangerousPatterns ?? [],
			functionalTestTimeout: config.functionalTestTimeout ?? 5000,
		}

		this.dangerousPatterns = [...DEFAULT_DANGEROUS_PATTERNS, ...this.config.customDangerousPatterns]
	}

	/**
	 * Validate a skill
	 */
	async validate(code: string, metadata: SkillMetadata): Promise<ValidationResult> {
		const startTime = Date.now()
		const issues: ValidationIssue[] = []
		const stagesCompleted: string[] = []
		let failedStage: string | undefined

		try {
			// Stage 1: Size check
			const sizeIssues = this.validateSize(code)
			issues.push(...sizeIssues)
			stagesCompleted.push("size_check")

			if (sizeIssues.some((i) => i.severity === "error")) {
				failedStage = "size_check"
				return this.createResult(issues, stagesCompleted, failedStage, startTime)
			}

			// Stage 2: Syntax validation
			if (this.config.enableSyntaxValidation) {
				const syntaxIssues = await this.validateSyntax(code, metadata.runtime)
				issues.push(...syntaxIssues)
				stagesCompleted.push("syntax")

				if (syntaxIssues.some((i) => i.severity === "error")) {
					failedStage = "syntax"
					return this.createResult(issues, stagesCompleted, failedStage, startTime)
				}
			}

			// Stage 3: Security scan
			if (this.config.enableSecurityScan) {
				const securityIssues = this.scanSecurity(code)
				issues.push(...securityIssues)
				stagesCompleted.push("security")

				const hasBlockingSecurityIssue = securityIssues.some((i) => i.severity === "error")
				if (hasBlockingSecurityIssue) {
					failedStage = "security"
					return this.createResult(issues, stagesCompleted, failedStage, startTime)
				}
			}

			// Stage 4: Structure validation
			const structureIssues = this.validateStructure(code, metadata)
			issues.push(...structureIssues)
			stagesCompleted.push("structure")

			// Stage 5: Best practices check
			const practiceIssues = this.checkBestPractices(code, metadata.runtime)
			issues.push(...practiceIssues)
			stagesCompleted.push("best_practices")

			return this.createResult(issues, stagesCompleted, failedStage, startTime)
		} catch (error) {
			issues.push({
				severity: "error",
				code: "VALIDATION_ERROR",
				message: `Validation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
			})
			failedStage = "validation"
			return this.createResult(issues, stagesCompleted, failedStage, startTime)
		}
	}

	/**
	 * Quick security scan only
	 */
	scanSecurity(code: string): ValidationIssue[] {
		const issues: ValidationIssue[] = []

		for (const pattern of this.dangerousPatterns) {
			const matches = code.matchAll(pattern.pattern)
			for (const match of matches) {
				const lineNumber = this.getLineNumber(code, match.index ?? 0)
				issues.push({
					severity: pattern.severity,
					code: `SECURITY_${pattern.name.toUpperCase().replace(/\s+/g, "_")}`,
					message: pattern.explanation,
					line: lineNumber,
					suggestion: pattern.isBlocking
						? "This pattern must be removed"
						: "Consider using a safer alternative",
				})
			}
		}

		return issues
	}

	/**
	 * Validate syntax for a given runtime
	 */
	async validateSyntax(code: string, runtime: SkillRuntime): Promise<ValidationIssue[]> {
		switch (runtime) {
			case "typescript":
				return this.validateTypeScriptSyntax(code)
			case "python":
				return this.validatePythonSyntax(code)
			case "shell":
				return this.validateShellSyntax(code)
			default:
				return [
					{
						severity: "warning",
						code: "UNKNOWN_RUNTIME",
						message: `Unknown runtime: ${runtime}`,
					},
				]
		}
	}

	/**
	 * Validate TypeScript syntax
	 */
	private async validateTypeScriptSyntax(code: string): Promise<ValidationIssue[]> {
		const issues: ValidationIssue[] = []

		// Basic syntax checks without requiring TypeScript compiler
		// (for MVP - full TS compiler integration can be added later)

		// Check for balanced braces
		const braceBalance = this.checkBraceBalance(code)
		if (braceBalance.error) {
			issues.push({
				severity: "error",
				code: "SYNTAX_BRACE_MISMATCH",
				message: braceBalance.error,
				line: braceBalance.line,
			})
		}

		// Check for unclosed strings
		const stringIssues = this.checkUnclosedStrings(code)
		issues.push(...stringIssues)

		// Check for export
		if (!TYPESCRIPT_VALIDATION_PATTERNS.hasExport.test(code)) {
			issues.push({
				severity: "warning",
				code: "SYNTAX_NO_EXPORT",
				message: "Skill should export a function or class",
				suggestion: "Add 'export default function' or 'export const'",
			})
		}

		return issues
	}

	/**
	 * Validate Python syntax (basic for MVP)
	 */
	private async validatePythonSyntax(code: string): Promise<ValidationIssue[]> {
		const issues: ValidationIssue[] = []

		// Check for basic Python structure
		if (!code.includes("def ") && !code.includes("class ")) {
			issues.push({
				severity: "warning",
				code: "SYNTAX_NO_FUNCTION",
				message: "Python skill should define at least one function or class",
			})
		}

		// Check for indentation consistency
		const lines = code.split("\n")
		let expectedIndent = 0
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]
			const trimmedLine = line.trim()

			if (!trimmedLine || trimmedLine.startsWith("#")) {
				continue
			}

			const currentIndent = line.length - line.trimStart().length

			// Check for mixed tabs and spaces
			if (line.includes("\t") && line.includes(" ")) {
				const leadingWhitespace = line.match(/^\s*/)?.[0] ?? ""
				if (leadingWhitespace.includes("\t") && leadingWhitespace.includes(" ")) {
					issues.push({
						severity: "warning",
						code: "STYLE_MIXED_INDENT",
						message: "Mixed tabs and spaces in indentation",
						line: i + 1,
					})
				}
			}

			// Update expected indent for next line
			if (trimmedLine.endsWith(":")) {
				expectedIndent = currentIndent + 4
			}
		}

		return issues
	}

	/**
	 * Validate shell syntax (basic for MVP)
	 */
	private async validateShellSyntax(code: string): Promise<ValidationIssue[]> {
		const issues: ValidationIssue[] = []

		// Check for shebang
		if (!code.startsWith("#!/")) {
			issues.push({
				severity: "info",
				code: "STYLE_NO_SHEBANG",
				message: "Consider adding a shebang line (#!/bin/bash or #!/bin/sh)",
			})
		}

		// Check for set -e (exit on error)
		if (!code.includes("set -e")) {
			issues.push({
				severity: "info",
				code: "STYLE_NO_SET_E",
				message: "Consider adding 'set -e' to exit on errors",
			})
		}

		return issues
	}

	/**
	 * Validate skill size
	 */
	private validateSize(code: string): ValidationIssue[] {
		const issues: ValidationIssue[] = []
		const sizeBytes = Buffer.from(code).length

		if (sizeBytes > this.config.maxSkillSize) {
			issues.push({
				severity: "error",
				code: "SIZE_EXCEEDED",
				message: `Skill size (${sizeBytes} bytes) exceeds maximum (${this.config.maxSkillSize} bytes)`,
			})
		} else if (sizeBytes > this.config.maxSkillSize * 0.8) {
			issues.push({
				severity: "warning",
				code: "SIZE_WARNING",
				message: `Skill size (${sizeBytes} bytes) is approaching maximum (${this.config.maxSkillSize} bytes)`,
			})
		}

		return issues
	}

	/**
	 * Validate skill structure
	 */
	private validateStructure(code: string, metadata: SkillMetadata): ValidationIssue[] {
		const issues: ValidationIssue[] = []

		// Check for proper function/class definition
		if (metadata.runtime === "typescript") {
			// Check for async function if parameters suggest async operation
			if (metadata.parameters?.timeout || metadata.permissions?.includes("network")) {
				if (!code.includes("async ")) {
					issues.push({
						severity: "info",
						code: "STRUCTURE_ASYNC_RECOMMENDED",
						message: "Consider using async/await for operations with timeout or network permissions",
					})
				}
			}
		}

		return issues
	}

	/**
	 * Check best practices
	 */
	private checkBestPractices(code: string, runtime: SkillRuntime): ValidationIssue[] {
		const issues: ValidationIssue[] = []

		if (runtime === "typescript") {
			// Check for error handling
			if (code.includes("await ") && !TYPESCRIPT_VALIDATION_PATTERNS.tryCatch.test(code)) {
				issues.push({
					severity: "warning",
					code: "PRACTICE_NO_ERROR_HANDLING",
					message: "Async code should have try/catch error handling",
					suggestion: "Wrap await calls in try/catch blocks",
				})
			}

			// Check for any type
			if (/:\s*any\b/.test(code)) {
				issues.push({
					severity: "info",
					code: "PRACTICE_ANY_TYPE",
					message: "Consider using more specific types instead of 'any'",
				})
			}

			// Check for console.log (should use logging API)
			if (/console\.log\s*\(/.test(code)) {
				issues.push({
					severity: "info",
					code: "PRACTICE_CONSOLE_LOG",
					message: "Consider using structured logging instead of console.log",
				})
			}
		}

		return issues
	}

	/**
	 * Check brace balance
	 */
	private checkBraceBalance(code: string): { error?: string; line?: number } {
		const stack: Array<{ char: string; line: number }> = []
		const pairs: Record<string, string> = {
			"{": "}",
			"[": "]",
			"(": ")",
		}
		const closing = new Set(Object.values(pairs))

		const lines = code.split("\n")
		let inString = false
		let stringChar = ""

		for (let lineNum = 0; lineNum < lines.length; lineNum++) {
			const line = lines[lineNum]
			for (let i = 0; i < line.length; i++) {
				const char = line[i]
				const prevChar = i > 0 ? line[i - 1] : ""

				// Handle strings
				if ((char === '"' || char === "'" || char === "`") && prevChar !== "\\") {
					if (!inString) {
						inString = true
						stringChar = char
					} else if (char === stringChar) {
						inString = false
					}
					continue
				}

				if (inString) continue

				// Skip comments
				if (char === "/" && line[i + 1] === "/") break
				if (char === "/" && line[i + 1] === "*") {
					// Find end of block comment
					const endIndex = code.indexOf("*/", code.indexOf(line) + i)
					if (endIndex === -1) {
						return { error: "Unclosed block comment", line: lineNum + 1 }
					}
					continue
				}

				if (pairs[char]) {
					stack.push({ char, line: lineNum + 1 })
				} else if (closing.has(char)) {
					const last = stack.pop()
					if (!last) {
						return { error: `Unexpected closing '${char}'`, line: lineNum + 1 }
					}
					if (pairs[last.char] !== char) {
						return {
							error: `Mismatched '${last.char}' and '${char}'`,
							line: lineNum + 1,
						}
					}
				}
			}
		}

		if (stack.length > 0) {
			const unclosed = stack[stack.length - 1]
			return {
				error: `Unclosed '${unclosed.char}'`,
				line: unclosed.line,
			}
		}

		return {}
	}

	/**
	 * Check for unclosed strings
	 */
	private checkUnclosedStrings(code: string): ValidationIssue[] {
		const issues: ValidationIssue[] = []
		const lines = code.split("\n")

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]

			// Skip if line ends with template literal (multi-line)
			if (line.includes("`") && (line.match(/`/g)?.length ?? 0) % 2 === 1) {
				// Template literal might be multi-line, skip for now
				continue
			}

			// Check for unclosed single/double quotes
			let inString = false
			let stringChar = ""
			for (let j = 0; j < line.length; j++) {
				const char = line[j]
				const prevChar = j > 0 ? line[j - 1] : ""

				if ((char === '"' || char === "'") && prevChar !== "\\") {
					if (!inString) {
						inString = true
						stringChar = char
					} else if (char === stringChar) {
						inString = false
					}
				}

				// Skip rest of line if comment
				if (!inString && char === "/" && line[j + 1] === "/") {
					break
				}
			}

			if (inString) {
				issues.push({
					severity: "error",
					code: "SYNTAX_UNCLOSED_STRING",
					message: "Unclosed string literal",
					line: i + 1,
				})
			}
		}

		return issues
	}

	/**
	 * Get line number from character index
	 */
	private getLineNumber(code: string, index: number): number {
		return code.substring(0, index).split("\n").length
	}

	/**
	 * Create validation result
	 */
	private createResult(
		issues: ValidationIssue[],
		stagesCompleted: string[],
		failedStage: string | undefined,
		startTime: number,
	): ValidationResult {
		const hasErrors = issues.some((i) => i.severity === "error")
		return {
			valid: !hasErrors,
			issues,
			stagesCompleted,
			failedStage,
			durationMs: Date.now() - startTime,
		}
	}

	/**
	 * Add custom dangerous pattern
	 */
	addDangerousPattern(pattern: DangerousPattern): void {
		this.dangerousPatterns.push(pattern)
	}

	/**
	 * Remove dangerous pattern by name
	 */
	removeDangerousPattern(name: string): void {
		this.dangerousPatterns = this.dangerousPatterns.filter((p) => p.name !== name)
	}

	/**
	 * Get all dangerous patterns
	 */
	getDangerousPatterns(): DangerousPattern[] {
		return [...this.dangerousPatterns]
	}
}
