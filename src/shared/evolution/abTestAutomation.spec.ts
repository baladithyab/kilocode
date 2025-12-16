/**
 * Tests for A/B Testing Automation Support in automation.ts
 */

import type { TokenUsage, HistoryItem } from "@roo-code/types"
import {
	AutomationLevel,
	DEFAULT_AUTOMATION_CONFIG,
	DEFAULT_AB_TEST_AUTOMATION_CONFIG,
	DEFAULT_AB_TEST_TRIGGERS,
	shouldTriggerABTest,
	createABTestConfigFromAutomation,
	evaluateABTestResult,
	type EvolutionAutomationConfig,
	type ABTestAutomationConfig,
	type ABTestTriggerConditions,
} from "./automation"

import type { ABTestResult, ABTestVariantResult } from "./abTestSchemas"
import { createDefaultTokenUsage } from "./abTestSchemas"

describe("A/B Testing Automation Support", () => {
	describe("DEFAULT_AB_TEST_AUTOMATION_CONFIG", () => {
		it("should have sensible defaults", () => {
			expect(DEFAULT_AB_TEST_AUTOMATION_CONFIG.enabled).toBe(false)
			expect(DEFAULT_AB_TEST_AUTOMATION_CONFIG.defaultTimeoutMs).toBe(300000) // 5 minutes
			expect(DEFAULT_AB_TEST_AUTOMATION_CONFIG.maxVariants).toBe(4)
			expect(DEFAULT_AB_TEST_AUTOMATION_CONFIG.enableCheckpoints).toBe(true)
			expect(DEFAULT_AB_TEST_AUTOMATION_CONFIG.defaultVariants).toHaveLength(2)
		})

		it("should have control and architect as default variants", () => {
			const variants = DEFAULT_AB_TEST_AUTOMATION_CONFIG.defaultVariants
			expect(variants[0].id).toBe("control")
			expect(variants[0].modeSlug).toBe("code")
			expect(variants[1].id).toBe("architect")
			expect(variants[1].modeSlug).toBe("architect")
		})
	})

	describe("DEFAULT_AB_TEST_TRIGGERS", () => {
		it("should have sensible defaults", () => {
			expect(DEFAULT_AB_TEST_TRIGGERS.costThreshold).toBe(50)
			expect(DEFAULT_AB_TEST_TRIGGERS.onComplexTask).toBe(true)
			expect(DEFAULT_AB_TEST_TRIGGERS.sampleRate).toBe(0.1)
		})
	})

	describe("shouldTriggerABTest", () => {
		const level3Config: EvolutionAutomationConfig = {
			...DEFAULT_AUTOMATION_CONFIG,
			level: AutomationLevel.FullClosedLoop,
		}

		const enabledABConfig: ABTestAutomationConfig = {
			...DEFAULT_AB_TEST_AUTOMATION_CONFIG,
			enabled: true,
		}

		const defaultTokenUsage: TokenUsage = {
			totalTokensIn: 1000,
			totalTokensOut: 500,
			totalCost: 0.05,
			contextTokens: 0,
		}

		it("should not trigger if automation level is below Level 3", () => {
			const config: EvolutionAutomationConfig = {
				...DEFAULT_AUTOMATION_CONFIG,
				level: AutomationLevel.AutoApplyLowRisk,
			}

			const result = shouldTriggerABTest(config, enabledABConfig, DEFAULT_AB_TEST_TRIGGERS)

			expect(result.shouldTrigger).toBe(false)
			expect(result.reason).toContain("below Level 3")
		})

		it("should not trigger if A/B testing is disabled", () => {
			const disabledABConfig: ABTestAutomationConfig = {
				...DEFAULT_AB_TEST_AUTOMATION_CONFIG,
				enabled: false,
			}

			const result = shouldTriggerABTest(level3Config, disabledABConfig, DEFAULT_AB_TEST_TRIGGERS)

			expect(result.shouldTrigger).toBe(false)
			expect(result.reason).toContain("disabled")
		})

		it("should trigger when cost exceeds threshold", () => {
			const highCostUsage: TokenUsage = {
				...defaultTokenUsage,
				totalCost: 60, // Above 50 threshold
			}

			const result = shouldTriggerABTest(level3Config, enabledABConfig, DEFAULT_AB_TEST_TRIGGERS, highCostUsage)

			expect(result.shouldTrigger).toBe(true)
			expect(result.reason).toContain("cost")
			expect(result.reason).toContain("exceeded")
		})

		it("should not trigger when cost is below threshold", () => {
			const lowCostUsage: TokenUsage = {
				...defaultTokenUsage,
				totalCost: 10, // Below 50 threshold
			}

			// Disable sample rate to test only cost
			const triggers: ABTestTriggerConditions = {
				...DEFAULT_AB_TEST_TRIGGERS,
				sampleRate: 0,
				onComplexTask: false,
			}

			const result = shouldTriggerABTest(level3Config, enabledABConfig, triggers, lowCostUsage)

			expect(result.shouldTrigger).toBe(false)
			expect(result.reason).toContain("No trigger conditions met")
		})

		it("should trigger on complex task detection", () => {
			const historyItem = {
				id: "task-123",
				number: 1,
				task: "Refactor the authentication module",
				ts: Date.now(),
				totalCost: 0,
				tokensIn: 0,
				tokensOut: 0,
			} as HistoryItem

			// Disable other triggers
			const triggers: ABTestTriggerConditions = {
				costThreshold: 0,
				sampleRate: 0,
				onComplexTask: true,
			}

			const result = shouldTriggerABTest(level3Config, enabledABConfig, triggers, defaultTokenUsage, historyItem)

			expect(result.shouldTrigger).toBe(true)
			expect(result.reason).toContain("complex")
		})

		it("should detect various complex task indicators", () => {
			const complexIndicators = ["refactor", "redesign", "implement", "create", "build", "architecture"]

			for (const indicator of complexIndicators) {
				const historyItem = {
					id: "task-123",
					number: 1,
					task: `${indicator} the feature`,
					ts: Date.now(),
					totalCost: 0,
					tokensIn: 0,
					tokensOut: 0,
				} as HistoryItem

				const triggers: ABTestTriggerConditions = {
					costThreshold: 0,
					sampleRate: 0,
					onComplexTask: true,
				}

				const result = shouldTriggerABTest(
					level3Config,
					enabledABConfig,
					triggers,
					defaultTokenUsage,
					historyItem,
				)

				expect(result.shouldTrigger).toBe(true)
			}
		})

		it("should not trigger on simple tasks when onComplexTask is enabled", () => {
			const historyItem = {
				id: "task-123",
				number: 1,
				task: "Fix typo in readme",
				ts: Date.now(),
				totalCost: 0,
				tokensIn: 0,
				tokensOut: 0,
			} as HistoryItem

			const triggers: ABTestTriggerConditions = {
				costThreshold: 0,
				sampleRate: 0,
				onComplexTask: true,
			}

			const result = shouldTriggerABTest(level3Config, enabledABConfig, triggers, defaultTokenUsage, historyItem)

			expect(result.shouldTrigger).toBe(false)
		})
	})

	describe("createABTestConfigFromAutomation", () => {
		it("should create a valid A/B test config", () => {
			const taskPrompt = "Refactor the user authentication module"
			const workspacePath = "/path/to/workspace"

			const config = createABTestConfigFromAutomation(
				taskPrompt,
				DEFAULT_AB_TEST_AUTOMATION_CONFIG,
				workspacePath,
			)

			expect(config.taskPrompt).toBe(taskPrompt)
			expect(config.workspacePath).toBe(workspacePath)
			expect(config.timeoutMs).toBe(DEFAULT_AB_TEST_AUTOMATION_CONFIG.defaultTimeoutMs)
			expect(config.enableCheckpoints).toBe(DEFAULT_AB_TEST_AUTOMATION_CONFIG.enableCheckpoints)
			expect(config.variants).toHaveLength(2)
		})

		it("should respect maxVariants limit", () => {
			const abConfig: ABTestAutomationConfig = {
				...DEFAULT_AB_TEST_AUTOMATION_CONFIG,
				maxVariants: 1,
			}

			const config = createABTestConfigFromAutomation("test task", abConfig, "/workspace")

			expect(config.variants).toHaveLength(1)
		})
	})

	describe("evaluateABTestResult", () => {
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

		const createMockABTestResult = (overrides: Partial<ABTestResult> = {}): ABTestResult => ({
			testId: "ab-test-123",
			config: {
				testId: "ab-test-123",
				taskPrompt: "Test task",
				variants: [],
				timeoutMs: 300000,
				enableCheckpoints: true,
				workspacePath: "/workspace",
				createdAt: Date.now(),
			},
			startedAt: Date.now(),
			completedAt: Date.now(),
			totalDurationMs: 10000,
			variants: [],
			comparisons: [],
			status: "completed",
			...overrides,
		})

		it("should return error recommendation for failed tests", () => {
			const result = createMockABTestResult({
				status: "failed",
				error: "Test failed due to timeout",
			})

			const evaluation = evaluateABTestResult(result)

			expect(evaluation.success).toBe(false)
			expect(evaluation.recommendation).toBe("error")
			expect(evaluation.explanation).toContain("failed")
		})

		it("should return error when all variants failed", () => {
			const result = createMockABTestResult({
				status: "completed",
				variants: [
					createMockVariantResult({ variantId: "control", success: false, error: "Timeout" }),
					createMockVariantResult({ variantId: "experiment", success: false, error: "Error" }),
				],
			})

			const evaluation = evaluateABTestResult(result)

			expect(evaluation.success).toBe(false)
			expect(evaluation.recommendation).toBe("error")
			expect(evaluation.explanation).toContain("All variants failed")
		})

		it("should recommend the only successful variant", () => {
			const result = createMockABTestResult({
				status: "partial",
				variants: [
					createMockVariantResult({ variantId: "control", success: true, totalCost: 0.1 }),
					createMockVariantResult({ variantId: "experiment", success: false, error: "Failed" }),
				],
			})

			const evaluation = evaluateABTestResult(result)

			expect(evaluation.success).toBe(true)
			expect(evaluation.winnerId).toBe("control")
			expect(evaluation.recommendation).toBe("use_control")
		})

		it("should recommend experiment when it is significantly better", () => {
			const result = createMockABTestResult({
				status: "completed",
				variants: [
					createMockVariantResult({
						variantId: "control",
						success: true,
						totalCost: 0.2,
						durationMs: 10000,
					}),
					createMockVariantResult({
						variantId: "experiment",
						success: true,
						totalCost: 0.05, // Much cheaper
						durationMs: 3000, // Much faster
					}),
				],
			})

			const evaluation = evaluateABTestResult(result)

			expect(evaluation.success).toBe(true)
			expect(evaluation.recommendation).toBe("use_experiment")
		})

		it("should recommend control when it is significantly better", () => {
			const result = createMockABTestResult({
				status: "completed",
				variants: [
					createMockVariantResult({
						variantId: "control",
						success: true,
						totalCost: 0.05,
						durationMs: 3000,
					}),
					createMockVariantResult({
						variantId: "experiment",
						success: true,
						totalCost: 0.2,
						durationMs: 10000,
					}),
				],
			})

			const evaluation = evaluateABTestResult(result)

			expect(evaluation.success).toBe(true)
			expect(evaluation.recommendation).toBe("use_control")
		})

		it("should be inconclusive when variants have similar performance", () => {
			const result = createMockABTestResult({
				status: "completed",
				variants: [
					createMockVariantResult({
						variantId: "control",
						success: true,
						totalCost: 0.1,
						durationMs: 5000,
					}),
					createMockVariantResult({
						variantId: "experiment",
						success: true,
						totalCost: 0.095, // Only slightly different
						durationMs: 5100, // Only slightly different
					}),
				],
			})

			const evaluation = evaluateABTestResult(result)

			expect(evaluation.success).toBe(true)
			expect(evaluation.recommendation).toBe("inconclusive")
		})
	})
})
