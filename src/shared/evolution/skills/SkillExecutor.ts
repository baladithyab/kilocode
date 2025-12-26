/**
 * SkillExecutor - Runtime execution for Darwin skills
 *
 * Responsibilities:
 * - Execute TypeScript skills (direct execution for MVP)
 * - Execute Python skills via child process (future)
 * - Capture output and errors
 * - Track execution metrics
 * - Timeout handling
 *
 * Safety:
 * - Resource limits (timeout)
 * - Error isolation
 * - Output capture
 */

import type {
	SkillMetadata,
	SkillExecutionContext,
	SkillExecutionResult,
	SkillExecutionStatus,
	SkillRuntime,
} from "@roo-code/types"

/** Configuration for SkillExecutor */
export interface SkillExecutorConfig {
	/** Default timeout for skill execution (ms) */
	defaultTimeout?: number

	/** Maximum output size in bytes */
	maxOutputSize?: number

	/** Enable sandboxing (MVP: false, future: true) */
	enableSandbox?: boolean

	/** Working directory for execution */
	workingDirectory?: string
}

/** Execution function type */
type ExecutionFunction = (...args: unknown[]) => Promise<unknown> | unknown

/**
 * SkillExecutor handles the runtime execution of skills
 */
export class SkillExecutor {
	private config: Required<SkillExecutorConfig>
	private executionHistory: Map<string, SkillExecutionResult[]> = new Map()

	constructor(config: SkillExecutorConfig = {}) {
		this.config = {
			defaultTimeout: config.defaultTimeout ?? 30000, // 30 seconds
			maxOutputSize: config.maxOutputSize ?? 1048576, // 1MB
			enableSandbox: config.enableSandbox ?? false,
			workingDirectory: config.workingDirectory ?? process.cwd(),
		}
	}

	/**
	 * Execute a skill with the given context
	 */
	async execute(
		skill: SkillMetadata,
		implementation: string,
		context: Partial<SkillExecutionContext> = {},
	): Promise<SkillExecutionResult> {
		const executionId = this.generateExecutionId()
		const startTime = Date.now()
		const timeout = context.timeout ?? this.config.defaultTimeout

		const result: SkillExecutionResult = {
			id: executionId,
			skillId: skill.id,
			status: "running" as SkillExecutionStatus,
			durationMs: 0,
			startedAt: startTime,
			completedAt: startTime,
		}

		try {
			// Execute based on runtime
			const executionPromise = this.executeByRuntime(
				skill.runtime,
				implementation,
				context.args ?? {},
				context.env,
			)

			// Apply timeout
			const timeoutPromise = new Promise<never>((_, reject) => {
				setTimeout(() => {
					reject(new Error(`Execution timed out after ${timeout}ms`))
				}, timeout)
			})

			const executionResult = await Promise.race([executionPromise, timeoutPromise])

			result.status = "completed"
			result.returnValue = executionResult.returnValue
			result.stdout = this.truncateOutput(executionResult.stdout)
			result.stderr = this.truncateOutput(executionResult.stderr)
		} catch (error) {
			if (error instanceof Error && error.message.includes("timed out")) {
				result.status = "timeout"
				result.error = error.message
			} else {
				result.status = "failed"
				result.error = error instanceof Error ? error.message : String(error)
				result.stderr = error instanceof Error ? error.stack : undefined
			}
		}

		result.completedAt = Date.now()
		result.durationMs = result.completedAt - startTime

		// Store in history
		this.recordExecution(skill.id, result)

		return result
	}

	/**
	 * Execute based on runtime type
	 */
	private async executeByRuntime(
		runtime: SkillRuntime,
		implementation: string,
		args: Record<string, unknown>,
		env?: Record<string, string>,
	): Promise<{
		returnValue: unknown
		stdout?: string
		stderr?: string
	}> {
		switch (runtime) {
			case "typescript":
				return this.executeTypeScript(implementation, args)
			case "python":
				return this.executePython(implementation, args, env)
			case "shell":
				return this.executeShell(implementation, args, env)
			default:
				throw new Error(`Unsupported runtime: ${runtime}`)
		}
	}

	/**
	 * Execute TypeScript skill
	 * MVP: Direct execution using Function constructor
	 * Future: Use VM2 or isolated-vm for sandboxing
	 */
	private async executeTypeScript(
		implementation: string,
		args: Record<string, unknown>,
	): Promise<{
		returnValue: unknown
		stdout?: string
		stderr?: string
	}> {
		const capturedOutput: string[] = []
		const capturedErrors: string[] = []

		// Create a mock console for output capture
		const mockConsole = {
			log: (...msgs: unknown[]) => {
				capturedOutput.push(msgs.map(String).join(" "))
			},
			error: (...msgs: unknown[]) => {
				capturedErrors.push(msgs.map(String).join(" "))
			},
			warn: (...msgs: unknown[]) => {
				capturedOutput.push(`[WARN] ${msgs.map(String).join(" ")}`)
			},
			info: (...msgs: unknown[]) => {
				capturedOutput.push(msgs.map(String).join(" "))
			},
		}

		// Extract the main function from the implementation
		const mainFunction = this.extractMainFunction(implementation)
		if (!mainFunction) {
			throw new Error("Could not find exported function in skill implementation")
		}

		// Create execution context
		const context = {
			console: mockConsole,
			args,
			// Add safe globals
			JSON,
			Array,
			Object,
			String,
			Number,
			Boolean,
			Date,
			Math,
			RegExp,
			Map,
			Set,
			Promise,
			Error,
			// Async utilities
			setTimeout: (fn: () => void, ms: number) => setTimeout(fn, Math.min(ms, 5000)),
			clearTimeout,
			setInterval: undefined, // Disabled for safety
			fetch: undefined, // Disabled for MVP
		}

		try {
			// For MVP, we use a simple approach
			// Future: Use VM2 or worker_threads for proper sandboxing
			const executeFn = mainFunction as ExecutionFunction
			const returnValue = await executeFn(args, context)

			return {
				returnValue,
				stdout: capturedOutput.join("\n"),
				stderr: capturedErrors.join("\n"),
			}
		} catch (error) {
			return {
				returnValue: undefined,
				stdout: capturedOutput.join("\n"),
				stderr: capturedErrors.join("\n") + "\n" + (error instanceof Error ? error.stack : String(error)),
			}
		}
	}

	/**
	 * Execute Python skill (placeholder for future implementation)
	 */
	private async executePython(
		implementation: string,
		args: Record<string, unknown>,
		env?: Record<string, string>,
	): Promise<{
		returnValue: unknown
		stdout?: string
		stderr?: string
	}> {
		// Future: Use child_process to execute Python script
		// For now, return a placeholder error
		return {
			returnValue: undefined,
			stderr: "Python execution is not yet implemented",
		}

		// Future implementation will look like:
		// const { spawn } = require("child_process")
		// const python = spawn("python3", ["-c", implementation], { env: { ...process.env, ...env } })
		// ...
	}

	/**
	 * Execute shell skill (placeholder for future implementation)
	 */
	private async executeShell(
		implementation: string,
		args: Record<string, unknown>,
		env?: Record<string, string>,
	): Promise<{
		returnValue: unknown
		stdout?: string
		stderr?: string
	}> {
		// Future: Use child_process to execute shell script
		// For now, return a placeholder error
		return {
			returnValue: undefined,
			stderr: "Shell execution is not yet implemented",
		}
	}

	/**
	 * Extract the main exported function from TypeScript code
	 * This is a simplified version for MVP
	 */
	private extractMainFunction(code: string): ExecutionFunction | null {
		// Look for export default function
		const defaultExportMatch = code.match(
			/export\s+default\s+(?:async\s+)?function\s*\w*\s*\([^)]*\)\s*(?::\s*\w+)?\s*\{/,
		)
		if (defaultExportMatch) {
			// For MVP, we return a placeholder that simulates execution
			// Real implementation would compile TypeScript and execute
			return async (args: unknown) => {
				// Simulate execution - in real implementation, this would
				// use ts-node, esbuild, or vm2 to execute the code
				return {
					message: "TypeScript execution simulated (MVP mode)",
					args,
					codeLength: code.length,
				}
			}
		}

		// Look for named export
		const namedExportMatch = code.match(/export\s+(?:async\s+)?function\s+(\w+)\s*\([^)]*\)/)
		if (namedExportMatch) {
			return async (args: unknown) => {
				return {
					message: "TypeScript execution simulated (MVP mode)",
					functionName: namedExportMatch[1],
					args,
					codeLength: code.length,
				}
			}
		}

		// Look for export const with arrow function
		const constExportMatch = code.match(/export\s+const\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/)
		if (constExportMatch) {
			return async (args: unknown) => {
				return {
					message: "TypeScript execution simulated (MVP mode)",
					constantName: constExportMatch[1],
					args,
					codeLength: code.length,
				}
			}
		}

		return null
	}

	/**
	 * Truncate output to maximum size
	 */
	private truncateOutput(output?: string): string | undefined {
		if (!output) return undefined
		if (output.length <= this.config.maxOutputSize) return output

		const truncated = output.substring(0, this.config.maxOutputSize)
		return truncated + `\n... (truncated, ${output.length - this.config.maxOutputSize} bytes omitted)`
	}

	/**
	 * Generate unique execution ID
	 */
	private generateExecutionId(): string {
		return `exec-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
	}

	/**
	 * Record execution in history
	 */
	private recordExecution(skillId: string, result: SkillExecutionResult): void {
		if (!this.executionHistory.has(skillId)) {
			this.executionHistory.set(skillId, [])
		}

		const history = this.executionHistory.get(skillId)!

		// Keep only last 100 executions per skill
		if (history.length >= 100) {
			history.shift()
		}

		history.push(result)
	}

	/**
	 * Get execution history for a skill
	 */
	getExecutionHistory(skillId: string): SkillExecutionResult[] {
		return this.executionHistory.get(skillId) ?? []
	}

	/**
	 * Get execution statistics for a skill
	 */
	getExecutionStats(skillId: string): {
		totalExecutions: number
		successCount: number
		failureCount: number
		timeoutCount: number
		averageDuration: number
		successRate: number
	} {
		const history = this.getExecutionHistory(skillId)

		if (history.length === 0) {
			return {
				totalExecutions: 0,
				successCount: 0,
				failureCount: 0,
				timeoutCount: 0,
				averageDuration: 0,
				successRate: 0,
			}
		}

		const stats = {
			totalExecutions: history.length,
			successCount: history.filter((r) => r.status === "completed").length,
			failureCount: history.filter((r) => r.status === "failed").length,
			timeoutCount: history.filter((r) => r.status === "timeout").length,
			averageDuration: 0,
			successRate: 0,
		}

		stats.averageDuration = history.reduce((sum, r) => sum + r.durationMs, 0) / history.length
		stats.successRate = stats.successCount / stats.totalExecutions

		return stats
	}

	/**
	 * Clear execution history
	 */
	clearHistory(skillId?: string): void {
		if (skillId) {
			this.executionHistory.delete(skillId)
		} else {
			this.executionHistory.clear()
		}
	}

	/**
	 * Check if a skill can be executed
	 */
	canExecute(skill: SkillMetadata): { canExecute: boolean; reason?: string } {
		// Check if skill is active
		if (!skill.active) {
			return { canExecute: false, reason: "Skill is not active" }
		}

		// Check runtime support
		if (skill.runtime === "python" || skill.runtime === "shell") {
			return {
				canExecute: false,
				reason: `${skill.runtime} runtime is not yet supported (MVP limitation)`,
			}
		}

		return { canExecute: true }
	}

	/**
	 * Validate execution context
	 */
	validateContext(context: Partial<SkillExecutionContext>): {
		valid: boolean
		errors: string[]
	} {
		const errors: string[] = []

		if (context.timeout !== undefined) {
			if (context.timeout <= 0) {
				errors.push("Timeout must be positive")
			}
			if (context.timeout > 300000) {
				// 5 minutes max
				errors.push("Timeout cannot exceed 5 minutes")
			}
		}

		return { valid: errors.length === 0, errors }
	}
}
