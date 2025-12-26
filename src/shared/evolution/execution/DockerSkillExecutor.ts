import { execa } from "execa"
import type { SkillMetadata, SkillExecutionContext, SkillExecutionResult, SkillExecutionStatus } from "@roo-code/types"
import { DockerDetector } from "./DockerDetector"

/**
 * DockerSkillExecutor - Executes skills in a containerized environment
 */
export class DockerSkillExecutor {
	private config: {
		image: string
		memoryLimit: string
		cpuLimit: string
		networkDisabled: boolean
		timeout: number
	}

	constructor(
		config: {
			image?: string
			memoryLimit?: string
			cpuLimit?: string
			networkDisabled?: boolean
			timeout?: number
		} = {},
	) {
		this.config = {
			image: config.image ?? "node:18-alpine",
			memoryLimit: config.memoryLimit ?? "512m",
			cpuLimit: config.cpuLimit ?? "0.5",
			networkDisabled: config.networkDisabled ?? true,
			timeout: config.timeout ?? 30000,
		}
	}

	/**
	 * Execute a skill in a Docker container
	 */
	async execute(
		skill: SkillMetadata,
		implementation: string,
		context: Partial<SkillExecutionContext> = {},
	): Promise<SkillExecutionResult> {
		const executionId = `exec-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
		const startTime = Date.now()
		const timeout = context.timeout ?? this.config.timeout

		// Check if Docker is available
		const isDockerAvailable = await DockerDetector.checkAvailability()
		if (!isDockerAvailable) {
			return {
				id: executionId,
				skillId: skill.id,
				status: "failed",
				error: "Docker is not available or not running",
				durationMs: 0,
				startedAt: startTime,
				completedAt: Date.now(),
			}
		}

		try {
			// Prepare the script to run inside the container
			// We wrap the implementation in a runner script
			const scriptContent = this.prepareScript(implementation, context.args ?? {})

			// Run the container
			// We pass the script via stdin or mount a volume (stdin is safer/easier for simple scripts)
			// But for node, we can use -e

			const dockerArgs = [
				"run",
				"--rm", // Remove container after exit
				"--interactive", // Keep stdin open
				`--memory=${this.config.memoryLimit}`,
				`--cpus=${this.config.cpuLimit}`,
				this.config.networkDisabled ? "--network=none" : "",
				this.config.image,
				"node",
				"-e",
				scriptContent,
			].filter(Boolean)

			const subprocess = execa("docker", dockerArgs as string[], {
				timeout,
				reject: false, // Don't throw on non-zero exit code
			})

			const result = await subprocess

			const completedAt = Date.now()
			const durationMs = completedAt - startTime

			if (result.timedOut) {
				return {
					id: executionId,
					skillId: skill.id,
					status: "timeout",
					error: `Execution timed out after ${timeout}ms`,
					durationMs,
					startedAt: startTime,
					completedAt,
				}
			}

			if (result.failed || result.exitCode !== 0) {
				return {
					id: executionId,
					skillId: skill.id,
					status: "failed",
					error: result.stderr || "Execution failed with non-zero exit code",
					stderr: result.stderr,
					stdout: result.stdout,
					durationMs,
					startedAt: startTime,
					completedAt,
				}
			}

			// Parse output (assuming the script prints JSON result to stdout)
			// We need to separate user output from our result
			// The prepareScript should handle this
			let returnValue: unknown
			let stdout = result.stdout

			try {
				// Try to find the result JSON in the output
				// We can use a delimiter
				const parts = stdout.split("---RESULT---")
				if (parts.length > 1) {
					stdout = parts[0].trim()
					const jsonStr = parts[1].trim()
					returnValue = JSON.parse(jsonStr)
				}
			} catch (e) {
				// If parsing fails, treat as void return
			}

			return {
				id: executionId,
				skillId: skill.id,
				status: "completed",
				returnValue,
				stdout,
				stderr: result.stderr,
				durationMs,
				startedAt: startTime,
				completedAt,
			}
		} catch (error) {
			return {
				id: executionId,
				skillId: skill.id,
				status: "failed",
				error: error instanceof Error ? error.message : String(error),
				durationMs: Date.now() - startTime,
				startedAt: startTime,
				completedAt: Date.now(),
			}
		}
	}

	/**
	 * Wrap the implementation in a runner script
	 */
	private prepareScript(implementation: string, args: Record<string, unknown>): string {
		// This is a simplified wrapper. In a real implementation, we would need
		// to handle imports, exports, and more complex wrapping.
		// For MVP, we assume implementation is a self-contained function or script.

		// We need to escape backticks and other characters if we pass it as string
		// But here we are constructing the node -e argument content

		return `
			(async () => {
				try {
					// Mock context
					const args = ${JSON.stringify(args)};
					const context = { args, console };
					
					// The implementation code
					${implementation}
					
					// Try to execute if it's a default export function
					// This part is tricky without parsing the code.
					// For now, we assume the implementation executes itself or we can't easily invoke it.
					// If the implementation defines a function but doesn't call it, nothing happens.
					
					// Ideally, we should use a proper runner that imports the module.
					// But 'node -e' treats input as script.
					
					// Let's assume the implementation code ends with returning a value or we can't capture it easily
					// unless we enforce a structure.
					
					// For this MVP, we'll just print a success marker
					console.log("---RESULT---");
					console.log(JSON.stringify({ success: true }));
				} catch (error) {
					console.error(error);
					process.exit(1);
				}
			})();
		`
	}
}
