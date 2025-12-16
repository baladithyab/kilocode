/**
 * Tests for A/B Testing Schemas
 */

import {
	createDefaultTokenUsage,
	createDefaultToolUsage,
	calculateComparisonMetrics,
	generateComparisonSummary,
	createComparison,
	generateTestId,
	DEFAULT_AB_TEST_CONFIG,
	DEFAULT_AB_TEST_SETTINGS,
	type ABTestVariantResult,
	type ABTestComparisonMetrics,
} from "./abTestSchemas"

describe("abTestSchemas", () => {
	describe("createDefaultTokenUsage", () => {
		it("should create a token usage object with zeroed values", () => {
			const usage = createDefaultTokenUsage()

			expect(usage).toEqual({
				totalTokensIn: 0,
				totalTokensOut: 0,
				totalCost: 0,
				contextTokens: 0,
			})
		})
	})

	describe("createDefaultToolUsage", () => {
		it("should create an empty tool usage object", () => {
			const usage = createDefaultToolUsage()

			expect(usage).toEqual({})
		})
	})

	describe("generateTestId", () => {
		it("should generate a unique test ID with ab- prefix", () => {
			const id1 = generateTestId()
			const id2 = generateTestId()

			expect(id1).toMatch(/^ab-[a-z0-9]+-[a-z0-9]+$/)
			expect(id2).toMatch(/^ab-[a-z0-9]+-[a-z0-9]+$/)
			// IDs should be different due to random component
			expect(id1).not.toBe(id2)
		})
	})

	describe("DEFAULT_AB_TEST_CONFIG", () => {
		it("should have sensible default values", () => {
			expect(DEFAULT_AB_TEST_CONFIG.timeoutMs).toBe(5 * 60 * 1000) // 5 minutes
			expect(DEFAULT_AB_TEST_CONFIG.maxRequestsPerVariant).toBe(50)
			expect(DEFAULT_AB_TEST_CONFIG.enableCheckpoints).toBe(true)
		})
	})

	describe("DEFAULT_AB_TEST_SETTINGS", () => {
		it("should have sensible default values", () => {
			expect(DEFAULT_AB_TEST_SETTINGS.enabled).toBe(false)
			expect(DEFAULT_AB_TEST_SETTINGS.defaultTimeoutMs).toBe(5 * 60 * 1000)
			expect(DEFAULT_AB_TEST_SETTINGS.maxVariants).toBe(3)
			expect(DEFAULT_AB_TEST_SETTINGS.autoRunAtLevel3).toBe(false)
		})
	})

	describe("calculateComparisonMetrics", () => {
		const createMockVariantResult = (overrides: Partial<ABTestVariantResult> = {}): ABTestVariantResult => ({
			variantId: "test",
			variantName: "Test Variant",
			success: true,
			taskId: "task-123",
			tokenUsage: createDefaultTokenUsage(),
			toolUsage: {},
			totalCost: 0,
			durationMs: 1000,
			requestCount: 1,
			fileChanges: [],
			toolCalls: [],
			startedAt: Date.now(),
			completedAt: Date.now(),
			...overrides,
		})

		it("should calculate metrics when both variants succeed", () => {
			const control = createMockVariantResult({
				variantId: "control",
				totalCost: 0.1,
				durationMs: 5000,
				tokenUsage: { totalTokensIn: 100, totalTokensOut: 50, totalCost: 0.1, contextTokens: 0 },
				fileChanges: [{ path: "a.ts", changeType: "modify", timestamp: Date.now() }],
				toolCalls: [{ name: "read_file", params: {}, success: true, timestamp: Date.now() }],
			})

			const experiment = createMockVariantResult({
				variantId: "experiment",
				totalCost: 0.05,
				durationMs: 3000,
				tokenUsage: { totalTokensIn: 80, totalTokensOut: 40, totalCost: 0.05, contextTokens: 0 },
				fileChanges: [
					{ path: "a.ts", changeType: "modify", timestamp: Date.now() },
					{ path: "b.ts", changeType: "create", timestamp: Date.now() },
				],
				toolCalls: [
					{ name: "read_file", params: {}, success: true, timestamp: Date.now() },
					{ name: "write_file", params: {}, success: true, timestamp: Date.now() },
				],
			})

			const metrics = calculateComparisonMetrics(control, experiment)

			expect(metrics.costDelta).toBeCloseTo(-0.05)
			expect(metrics.costRatio).toBeCloseTo(0.5)
			expect(metrics.durationDelta).toBe(-2000)
			expect(metrics.durationRatio).toBeCloseTo(0.6)
			expect(metrics.tokenDelta.input).toBe(-20)
			expect(metrics.tokenDelta.output).toBe(-10)
			expect(metrics.fileChangesDelta).toBe(1)
			expect(metrics.toolCallsDelta).toBe(1)
			expect(metrics.bothSucceeded).toBe(true)
			expect(metrics.moreEfficient).toBe("experiment")
		})

		it("should prefer successful variant when one fails", () => {
			const control = createMockVariantResult({
				variantId: "control",
				success: true,
				totalCost: 0.1,
				durationMs: 5000,
			})

			const experiment = createMockVariantResult({
				variantId: "experiment",
				success: false,
				error: "Task failed",
				totalCost: 0.05,
				durationMs: 2000,
			})

			const metrics = calculateComparisonMetrics(control, experiment)

			expect(metrics.bothSucceeded).toBe(false)
			expect(metrics.moreEfficient).toBe("control")
		})

		it("should handle tie when both have similar scores", () => {
			const control = createMockVariantResult({
				variantId: "control",
				success: true,
				totalCost: 0.1,
				durationMs: 5000,
			})

			const experiment = createMockVariantResult({
				variantId: "experiment",
				success: true,
				totalCost: 0.1,
				durationMs: 5000,
			})

			const metrics = calculateComparisonMetrics(control, experiment)

			expect(metrics.bothSucceeded).toBe(true)
			expect(metrics.moreEfficient).toBe("tie")
		})
	})

	describe("generateComparisonSummary", () => {
		const createMockVariantResult = (overrides: Partial<ABTestVariantResult> = {}): ABTestVariantResult => ({
			variantId: "test",
			variantName: "Test Variant",
			success: true,
			taskId: "task-123",
			tokenUsage: createDefaultTokenUsage(),
			toolUsage: {},
			totalCost: 0,
			durationMs: 1000,
			requestCount: 1,
			fileChanges: [],
			toolCalls: [],
			startedAt: Date.now(),
			completedAt: Date.now(),
			...overrides,
		})

		it("should generate a summary when both succeed", () => {
			const control = createMockVariantResult({
				variantId: "control",
				totalCost: 0.1,
				durationMs: 5000,
			})

			const experiment = createMockVariantResult({
				variantId: "experiment",
				totalCost: 0.05,
				durationMs: 3000,
			})

			const metrics: ABTestComparisonMetrics = {
				costDelta: -0.05,
				costRatio: 0.5,
				durationDelta: -2000,
				durationRatio: 0.6,
				tokenDelta: { input: 0, output: 0, total: 0 },
				fileChangesDelta: 0,
				toolCallsDelta: 0,
				bothSucceeded: true,
				moreEfficient: "experiment",
			}

			const summary = generateComparisonSummary(control, experiment, metrics)

			expect(summary).toContain("Both variants completed successfully")
			expect(summary).toContain("cheaper")
			expect(summary).toContain("faster")
			expect(summary).toContain("Experiment was more efficient")
		})

		it("should note when control fails", () => {
			const control = createMockVariantResult({
				variantId: "control",
				success: false,
				error: "Task timed out",
			})

			const experiment = createMockVariantResult({
				variantId: "experiment",
				success: true,
			})

			const metrics: ABTestComparisonMetrics = {
				costDelta: 0,
				costRatio: 0,
				durationDelta: 0,
				durationRatio: 0,
				tokenDelta: { input: 0, output: 0, total: 0 },
				fileChangesDelta: 0,
				toolCallsDelta: 0,
				bothSucceeded: false,
				moreEfficient: "experiment",
			}

			const summary = generateComparisonSummary(control, experiment, metrics)

			expect(summary).toContain("Experiment succeeded")
			expect(summary).toContain("control failed")
			expect(summary).toContain("Task timed out")
		})
	})

	describe("createComparison", () => {
		const createMockVariantResult = (overrides: Partial<ABTestVariantResult> = {}): ABTestVariantResult => ({
			variantId: "test",
			variantName: "Test Variant",
			success: true,
			taskId: "task-123",
			tokenUsage: createDefaultTokenUsage(),
			toolUsage: {},
			totalCost: 0,
			durationMs: 1000,
			requestCount: 1,
			fileChanges: [],
			toolCalls: [],
			startedAt: Date.now(),
			completedAt: Date.now(),
			...overrides,
		})

		it("should create a full comparison object", () => {
			const control = createMockVariantResult({
				variantId: "control",
				totalCost: 0.1,
				durationMs: 5000,
			})

			const experiment = createMockVariantResult({
				variantId: "experiment",
				totalCost: 0.05,
				durationMs: 3000,
			})

			const comparison = createComparison(control, experiment)

			expect(comparison.controlId).toBe("control")
			expect(comparison.experimentId).toBe("experiment")
			expect(comparison.metrics).toBeDefined()
			expect(comparison.summary).toBeDefined()
			expect(comparison.recommendation).toBe("prefer-experiment")
		})

		it("should recommend control when it is more efficient", () => {
			const control = createMockVariantResult({
				variantId: "control",
				totalCost: 0.05,
				durationMs: 2000,
			})

			const experiment = createMockVariantResult({
				variantId: "experiment",
				totalCost: 0.15,
				durationMs: 8000,
			})

			const comparison = createComparison(control, experiment)

			expect(comparison.recommendation).toBe("prefer-control")
		})

		it("should be inconclusive when variants are similar", () => {
			const control = createMockVariantResult({
				variantId: "control",
				totalCost: 0.1,
				durationMs: 5000,
			})

			const experiment = createMockVariantResult({
				variantId: "experiment",
				totalCost: 0.1,
				durationMs: 5000,
			})

			const comparison = createComparison(control, experiment)

			expect(comparison.recommendation).toBe("inconclusive")
		})
	})
})
