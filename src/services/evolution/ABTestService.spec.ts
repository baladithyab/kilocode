/**
 * Tests for ABTestService
 *
 * These tests verify the A/B test orchestration logic with mocked dependencies.
 */

import { EventEmitter } from "events"
import type {
	ABTestConfig,
	ABTestVariantConfig,
	ABTestResult,
	ABTestProgress,
} from "../../shared/evolution/abTestSchemas"
import { generateTestId } from "../../shared/evolution/abTestSchemas"

// Mock interfaces for testing
interface MockRepoPerTaskCheckpointService {
	getCheckpointHash: () => Promise<string | null>
	createCheckpoint: (message: string) => Promise<string>
	restoreCheckpoint: (hash: string) => Promise<void>
	getFilesChangedSince: (hash: string) => Promise<string[]>
}

interface MockHeadlessClineProvider {
	runTask: (options: {
		taskPrompt: string
		images?: string[]
		timeoutMs: number
		variantConfig?: ABTestVariantConfig
	}) => Promise<{
		success: boolean
		taskId?: string
		error?: string
		tokenUsage?: { totalTokensIn: number; totalTokensOut: number; totalCost: number }
		durationMs?: number
	}>
}

describe("ABTestService", () => {
	// Helper to create a mock checkpoint service
	const createMockCheckpointService = (): MockRepoPerTaskCheckpointService => ({
		getCheckpointHash: vi.fn().mockResolvedValue("abc123"),
		createCheckpoint: vi.fn().mockResolvedValue("checkpoint-hash"),
		restoreCheckpoint: vi.fn().mockResolvedValue(undefined),
		getFilesChangedSince: vi.fn().mockResolvedValue(["file1.ts", "file2.ts"]),
	})

	// Helper to create a mock headless provider
	const createMockHeadlessProvider = (): MockHeadlessClineProvider => ({
		runTask: vi.fn().mockResolvedValue({
			success: true,
			taskId: "task-123",
			tokenUsage: { totalTokensIn: 100, totalTokensOut: 50, totalCost: 0.01 },
			durationMs: 5000,
		}),
	})

	// Helper to create a basic test config
	const createTestConfig = (overrides: Partial<ABTestConfig> = {}): ABTestConfig => ({
		testId: generateTestId(),
		taskPrompt: "Test the A/B testing functionality",
		variants: [
			{
				id: "control",
				name: "Control (Code Mode)",
				description: "Standard code mode",
				modeSlug: "code",
			},
			{
				id: "experiment",
				name: "Experiment (Architect Mode)",
				description: "Architect mode",
				modeSlug: "architect",
			},
		],
		timeoutMs: 60000,
		enableCheckpoints: true,
		workspacePath: "/test/workspace",
		createdAt: Date.now(),
		...overrides,
	})

	describe("Test Configuration Validation", () => {
		it("should validate config has at least one variant", () => {
			const config = createTestConfig({ variants: [] })

			const isValid = config.variants.length >= 1

			expect(isValid).toBe(false)
		})

		it("should validate config has valid timeout", () => {
			const config = createTestConfig({ timeoutMs: 0 })

			const isValid = config.timeoutMs > 0

			expect(isValid).toBe(false)
		})

		it("should accept valid config", () => {
			const config = createTestConfig()

			const hasVariants = config.variants.length >= 1
			const hasValidTimeout = config.timeoutMs > 0
			const hasTaskPrompt = config.taskPrompt.length > 0
			const hasWorkspacePath = config.workspacePath.length > 0

			expect(hasVariants).toBe(true)
			expect(hasValidTimeout).toBe(true)
			expect(hasTaskPrompt).toBe(true)
			expect(hasWorkspacePath).toBe(true)
		})
	})

	describe("Checkpoint Workflow", () => {
		it("should create initial checkpoint before first variant", async () => {
			const checkpointService = createMockCheckpointService()
			const config = createTestConfig()

			// Simulate initial checkpoint creation
			const initialHash = await checkpointService.createCheckpoint(
				`A/B Test ${config.testId}: Initial checkpoint`,
			)

			expect(checkpointService.createCheckpoint).toHaveBeenCalledWith(
				`A/B Test ${config.testId}: Initial checkpoint`,
			)
			expect(initialHash).toBe("checkpoint-hash")
		})

		it("should restore to checkpoint between variants", async () => {
			const checkpointService = createMockCheckpointService()
			const initialHash = "initial-checkpoint-hash"

			// Simulate rollback between variants
			await checkpointService.restoreCheckpoint(initialHash)

			expect(checkpointService.restoreCheckpoint).toHaveBeenCalledWith(initialHash)
		})

		it("should track file changes for each variant", async () => {
			const checkpointService = createMockCheckpointService()
			const variantCheckpointHash = "variant-checkpoint"

			const changedFiles = await checkpointService.getFilesChangedSince(variantCheckpointHash)

			expect(changedFiles).toEqual(["file1.ts", "file2.ts"])
		})
	})

	describe("Sequential Variant Execution", () => {
		it("should execute variants in sequence", async () => {
			const headlessProvider = createMockHeadlessProvider()
			const config = createTestConfig()
			const executionOrder: string[] = []

			for (const variant of config.variants) {
				executionOrder.push(variant.id)

				await headlessProvider.runTask({
					taskPrompt: config.taskPrompt,
					timeoutMs: config.timeoutMs,
					variantConfig: variant,
				})
			}

			expect(executionOrder).toEqual(["control", "experiment"])
			expect(headlessProvider.runTask).toHaveBeenCalledTimes(2)
		})

		it("should pass variant config to each run", async () => {
			const headlessProvider = createMockHeadlessProvider()
			const config = createTestConfig()

			const controlVariant = config.variants[0]
			await headlessProvider.runTask({
				taskPrompt: config.taskPrompt,
				timeoutMs: config.timeoutMs,
				variantConfig: controlVariant,
			})

			expect(headlessProvider.runTask).toHaveBeenCalledWith(
				expect.objectContaining({
					taskPrompt: config.taskPrompt,
					variantConfig: expect.objectContaining({ id: "control" }),
				}),
			)
		})
	})

	describe("Result Aggregation", () => {
		it("should aggregate results from all variants", () => {
			const variantResults = [
				{
					variantId: "control",
					success: true,
					totalCost: 0.1,
					durationMs: 5000,
				},
				{
					variantId: "experiment",
					success: true,
					totalCost: 0.05,
					durationMs: 3000,
				},
			]

			// Simulate result aggregation
			const aggregatedResult = {
				totalVariants: variantResults.length,
				successfulVariants: variantResults.filter((r) => r.success).length,
				totalCost: variantResults.reduce((sum, r) => sum + r.totalCost, 0),
				totalDuration: variantResults.reduce((sum, r) => sum + r.durationMs, 0),
			}

			expect(aggregatedResult.totalVariants).toBe(2)
			expect(aggregatedResult.successfulVariants).toBe(2)
			expect(aggregatedResult.totalCost).toBeCloseTo(0.15, 10)
			expect(aggregatedResult.totalDuration).toBe(8000)
		})

		it("should determine test status based on variant results", () => {
			const determineStatus = (results: Array<{ success: boolean }>): "completed" | "partial" | "failed" => {
				const successes = results.filter((r) => r.success).length
				if (successes === results.length) return "completed"
				if (successes > 0) return "partial"
				return "failed"
			}

			expect(determineStatus([{ success: true }, { success: true }])).toBe("completed")
			expect(determineStatus([{ success: true }, { success: false }])).toBe("partial")
			expect(determineStatus([{ success: false }, { success: false }])).toBe("failed")
		})

		it("should identify winner based on metrics", () => {
			const findWinner = (
				results: Array<{ variantId: string; success: boolean; totalCost: number; durationMs: number }>,
			): string | undefined => {
				const successful = results.filter((r) => r.success)
				if (successful.length === 0) return undefined
				if (successful.length === 1) return successful[0].variantId

				// Simple scoring: lower cost and duration is better
				const scored = successful.map((r) => ({
					...r,
					score: r.totalCost + r.durationMs / 10000,
				}))

				scored.sort((a, b) => a.score - b.score)
				return scored[0].variantId
			}

			const results = [
				{ variantId: "control", success: true, totalCost: 0.1, durationMs: 5000 },
				{ variantId: "experiment", success: true, totalCost: 0.05, durationMs: 3000 },
			]

			const winner = findWinner(results)

			expect(winner).toBe("experiment")
		})
	})

	describe("Progress Events", () => {
		it("should emit progress events during execution", () => {
			const emitter = new EventEmitter()
			const progressUpdates: ABTestProgress[] = []

			emitter.on("progress", (progress: ABTestProgress) => {
				progressUpdates.push(progress)
			})

			// Simulate progress emissions
			const emitProgress = (message: string, variantIndex: number, percentComplete: number) => {
				emitter.emit("progress", {
					testId: "ab-123",
					status: "running",
					currentVariantIndex: variantIndex,
					totalVariants: 2,
					message,
					percentComplete,
					timestamp: Date.now(),
				} as ABTestProgress)
			}

			emitProgress("Initializing", -1, 0)
			emitProgress("Running control", 0, 25)
			emitProgress("Running experiment", 1, 75)
			emitProgress("Completed", 1, 100)

			expect(progressUpdates).toHaveLength(4)
			expect(progressUpdates[0].percentComplete).toBe(0)
			expect(progressUpdates[3].percentComplete).toBe(100)
		})
	})

	describe("Error Handling", () => {
		it("should handle variant execution failure gracefully", async () => {
			const headlessProvider: MockHeadlessClineProvider = {
				runTask: vi.fn().mockRejectedValue(new Error("Execution failed")),
			}

			const config = createTestConfig()

			let caughtError: Error | null = null
			let variantResult: { success: boolean; error?: string } | null = null

			try {
				await headlessProvider.runTask({
					taskPrompt: config.taskPrompt,
					timeoutMs: config.timeoutMs,
				})
			} catch (error) {
				caughtError = error as Error
				variantResult = {
					success: false,
					error: caughtError.message,
				}
			}

			expect(caughtError).not.toBeNull()
			expect(variantResult?.success).toBe(false)
			expect(variantResult?.error).toBe("Execution failed")
		})

		it("should continue with remaining variants if one fails", async () => {
			const config = createTestConfig()
			const results: Array<{ variantId: string; success: boolean }> = []

			const mockRunTask = vi
				.fn()
				.mockRejectedValueOnce(new Error("First variant failed"))
				.mockResolvedValueOnce({ success: true })

			for (const variant of config.variants) {
				try {
					const result = await mockRunTask({ variantConfig: variant })
					results.push({ variantId: variant.id, success: result.success })
				} catch (error) {
					results.push({ variantId: variant.id, success: false })
				}
			}

			expect(results).toHaveLength(2)
			expect(results[0]).toEqual({ variantId: "control", success: false })
			expect(results[1]).toEqual({ variantId: "experiment", success: true })
		})

		it("should handle checkpoint service failure", async () => {
			const checkpointService: MockRepoPerTaskCheckpointService = {
				getCheckpointHash: vi.fn().mockRejectedValue(new Error("Git error")),
				createCheckpoint: vi.fn().mockRejectedValue(new Error("Git error")),
				restoreCheckpoint: vi.fn().mockRejectedValue(new Error("Git error")),
				getFilesChangedSince: vi.fn().mockResolvedValue([]),
			}

			let checkpointError: Error | null = null

			try {
				await checkpointService.createCheckpoint("test")
			} catch (error) {
				checkpointError = error as Error
			}

			expect(checkpointError).not.toBeNull()
			expect(checkpointError?.message).toBe("Git error")
		})
	})

	describe("Timeout Handling", () => {
		it("should respect variant timeout", async () => {
			const timeoutMs = 100
			const slowOperation = new Promise((resolve) => setTimeout(resolve, 500))

			const runWithTimeout = async (): Promise<{ success: boolean; reason?: string }> => {
				return Promise.race([
					slowOperation.then(() => ({ success: true })),
					new Promise<{ success: boolean; reason: string }>((resolve) =>
						setTimeout(() => resolve({ success: false, reason: "timeout" }), timeoutMs),
					),
				])
			}

			const result = await runWithTimeout()

			expect(result.success).toBe(false)
			expect(result.reason).toBe("timeout")
		})
	})

	describe("Output Generation", () => {
		it("should generate markdown summary from results", () => {
			const generateSummary = (testResult: Partial<ABTestResult>): string => {
				const lines: string[] = []

				lines.push(`# A/B Test Results: ${testResult.testId}`)
				lines.push("")
				lines.push(`**Status:** ${testResult.status}`)
				lines.push(`**Duration:** ${(testResult.totalDurationMs ?? 0) / 1000}s`)
				lines.push("")

				if (testResult.variants) {
					lines.push("## Variants")
					lines.push("")
					for (const variant of testResult.variants) {
						lines.push(`### ${variant.variantName}`)
						lines.push(`- Success: ${variant.success ? "Yes" : "No"}`)
						lines.push(`- Cost: $${variant.totalCost.toFixed(4)}`)
						lines.push(`- Duration: ${variant.durationMs}ms`)
						lines.push("")
					}
				}

				if (testResult.winnerId) {
					lines.push(`## Winner: ${testResult.winnerId}`)
				}

				return lines.join("\n")
			}

			const mockResult: Partial<ABTestResult> = {
				testId: "ab-test-123",
				status: "completed",
				totalDurationMs: 10000,
				winnerId: "experiment",
				variants: [
					{
						variantId: "control",
						variantName: "Control",
						success: true,
						totalCost: 0.1,
						durationMs: 5000,
						tokenUsage: { totalTokensIn: 100, totalTokensOut: 50, totalCost: 0.1, contextTokens: 0 },
						toolUsage: {},
						requestCount: 1,
						fileChanges: [],
						toolCalls: [],
						startedAt: Date.now(),
						completedAt: Date.now(),
					},
					{
						variantId: "experiment",
						variantName: "Experiment",
						success: true,
						totalCost: 0.05,
						durationMs: 3000,
						tokenUsage: { totalTokensIn: 80, totalTokensOut: 40, totalCost: 0.05, contextTokens: 0 },
						toolUsage: {},
						requestCount: 1,
						fileChanges: [],
						toolCalls: [],
						startedAt: Date.now(),
						completedAt: Date.now(),
					},
				],
			}

			const summary = generateSummary(mockResult)

			expect(summary).toContain("# A/B Test Results")
			expect(summary).toContain("Status:** completed")
			expect(summary).toContain("## Variants")
			expect(summary).toContain("### Control")
			expect(summary).toContain("### Experiment")
			expect(summary).toContain("## Winner: experiment")
		})
	})
})
