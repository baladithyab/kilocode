/**
 * Tests for Evolution Layer Automation
 */

import {
	AutomationLevel,
	checkRateLimits,
	createLogEntry,
	createOrchestrationResult,
	DEFAULT_AUTOMATION_CONFIG,
	DEFAULT_RATE_LIMIT_STATE,
	evaluateAutoApply,
	evaluateTriggerConditions,
	formatLogEntry,
	inferCategoryFromPath,
	isSafeToAutoApply,
	requiresHumanApproval,
	TriggerReason,
	updateRateLimitState,
	type AutomationRateLimitState,
	type EvolutionAutomationConfig,
	type ProposalChange,
} from "./automation"
import type { TokenUsage, HistoryItem } from "@roo-code/types"

describe("automation", () => {
	// Helper to create a minimal TokenUsage
	function createTokenUsage(totalCost: number = 0): TokenUsage {
		return {
			totalTokensIn: 1000,
			totalTokensOut: 500,
			totalCost,
			contextTokens: 1500,
		}
	}

	// Helper to create a base automation config
	function createConfig(overrides: Partial<EvolutionAutomationConfig> = {}): EvolutionAutomationConfig {
		return {
			...DEFAULT_AUTOMATION_CONFIG,
			...overrides,
			triggers: {
				...DEFAULT_AUTOMATION_CONFIG.triggers,
				...(overrides.triggers ?? {}),
			},
			safety: {
				...DEFAULT_AUTOMATION_CONFIG.safety,
				...(overrides.safety ?? {}),
			},
		}
	}

	describe("AutomationLevel", () => {
		test("enum values are correct", () => {
			expect(AutomationLevel.Manual).toBe(0)
			expect(AutomationLevel.AutoTrigger).toBe(1)
			expect(AutomationLevel.AutoApplyLowRisk).toBe(2)
			expect(AutomationLevel.FullClosedLoop).toBe(3)
		})
	})

	describe("DEFAULT_AUTOMATION_CONFIG", () => {
		test("has correct default values", () => {
			expect(DEFAULT_AUTOMATION_CONFIG.level).toBe(AutomationLevel.Manual)
			expect(DEFAULT_AUTOMATION_CONFIG.triggers.failureRate).toBe(0.3)
			expect(DEFAULT_AUTOMATION_CONFIG.triggers.costThreshold).toBe(100)
			expect(DEFAULT_AUTOMATION_CONFIG.triggers.cooldown).toBe(3600)
			expect(DEFAULT_AUTOMATION_CONFIG.safety.maxDailyRuns).toBe(5)
			expect(DEFAULT_AUTOMATION_CONFIG.safety.autoApplyTypes).toEqual(["mode-map", "docs"])
		})
	})

	describe("evaluateTriggerConditions", () => {
		test("Level 0 Manual mode never triggers", () => {
			const config = createConfig({ level: AutomationLevel.Manual })
			const tokenUsage = createTokenUsage(999) // Very high cost

			const result = evaluateTriggerConditions(config, tokenUsage)

			expect(result.shouldTrigger).toBe(false)
			expect(result.reason).toBe(TriggerReason.None)
		})

		test("Level 1 triggers on high cost", () => {
			const config = createConfig({
				level: AutomationLevel.AutoTrigger,
				triggers: { failureRate: 0.3, costThreshold: 100, cooldown: 3600 },
			})
			const tokenUsage = createTokenUsage(150)

			const result = evaluateTriggerConditions(config, tokenUsage)

			expect(result.shouldTrigger).toBe(true)
			expect(result.reason).toBe(TriggerReason.HighCost)
			expect(result.details).toContain("150.00")
			expect(result.details).toContain("100.00")
		})

		test("does not trigger when cost is below threshold", () => {
			const config = createConfig({
				level: AutomationLevel.AutoTrigger,
				triggers: { failureRate: 0.3, costThreshold: 100, cooldown: 3600 },
			})
			const tokenUsage = createTokenUsage(50)

			const result = evaluateTriggerConditions(config, tokenUsage)

			expect(result.shouldTrigger).toBe(false)
			expect(result.reason).toBe(TriggerReason.None)
		})

		test("triggers exactly at threshold", () => {
			const config = createConfig({
				level: AutomationLevel.AutoTrigger,
				triggers: { failureRate: 0.3, costThreshold: 100, cooldown: 3600 },
			})
			const tokenUsage = createTokenUsage(100)

			const result = evaluateTriggerConditions(config, tokenUsage)

			expect(result.shouldTrigger).toBe(true)
			expect(result.reason).toBe(TriggerReason.HighCost)
		})

		test("cost threshold of 0 disables cost triggering", () => {
			const config = createConfig({
				level: AutomationLevel.AutoTrigger,
				triggers: { failureRate: 0.3, costThreshold: 0, cooldown: 3600 },
			})
			const tokenUsage = createTokenUsage(999)

			const result = evaluateTriggerConditions(config, tokenUsage)

			expect(result.shouldTrigger).toBe(false)
		})

		test("triggers on task failure indicator in history item", () => {
			const config = createConfig({
				level: AutomationLevel.AutoTrigger,
				triggers: { failureRate: 0.3, costThreshold: 100, cooldown: 3600 },
			})
			const tokenUsage = createTokenUsage(10)
			const historyItem = {
				id: "test-id",
				number: 1,
				task: "Task failed: Could not complete the request",
				ts: Date.now(),
				totalCost: 0,
				tokensIn: 0,
				tokensOut: 0,
			} as HistoryItem

			const result = evaluateTriggerConditions(config, tokenUsage, historyItem)

			expect(result.shouldTrigger).toBe(true)
			expect(result.reason).toBe(TriggerReason.Failure)
		})

		test("triggers on error indicator in task title", () => {
			const config = createConfig({ level: AutomationLevel.AutoApplyLowRisk })
			const tokenUsage = createTokenUsage(10)
			const historyItem = {
				id: "test-id",
				number: 1,
				task: "Error occurred during processing",
				ts: Date.now(),
				totalCost: 0,
				tokensIn: 0,
				tokensOut: 0,
			} as HistoryItem

			const result = evaluateTriggerConditions(config, tokenUsage, historyItem)

			expect(result.shouldTrigger).toBe(true)
			expect(result.reason).toBe(TriggerReason.Failure)
		})

		test("high cost takes priority when no error detected", () => {
			const config = createConfig({
				level: AutomationLevel.AutoTrigger,
				triggers: { failureRate: 0.3, costThreshold: 100, cooldown: 3600 },
			})
			const tokenUsage = createTokenUsage(200)
			const historyItem = {
				id: "test-id",
				number: 1,
				task: "Normal task title",
				ts: Date.now(),
				totalCost: 0,
				tokensIn: 0,
				tokensOut: 0,
			} as HistoryItem

			const result = evaluateTriggerConditions(config, tokenUsage, historyItem)

			expect(result.shouldTrigger).toBe(true)
			expect(result.reason).toBe(TriggerReason.HighCost)
		})
	})

	describe("checkRateLimits", () => {
		test("allows first run with empty state", () => {
			const config = createConfig({ level: AutomationLevel.AutoTrigger })
			const state = DEFAULT_RATE_LIMIT_STATE

			const result = checkRateLimits(config, state)

			expect(result.allowed).toBe(true)
			expect(result.reason).toBeUndefined()
		})

		test("blocks when daily limit reached", () => {
			const config = createConfig({
				level: AutomationLevel.AutoTrigger,
				safety: { maxDailyRuns: 5, autoApplyTypes: ["docs"] },
			})
			const now = new Date("2024-01-15T12:00:00Z")
			const state: AutomationRateLimitState = {
				lastRunTimestamp: now.getTime() - 60000, // 1 minute ago
				dailyRunCount: 5,
				dailyRunDate: "2024-01-15",
				lastTriggerReason: TriggerReason.HighCost,
			}

			const result = checkRateLimits(config, state, now)

			expect(result.allowed).toBe(false)
			expect(result.reason).toContain("Daily limit")
		})

		test("resets daily count on new day", () => {
			const config = createConfig({
				level: AutomationLevel.AutoTrigger,
				safety: { maxDailyRuns: 5, autoApplyTypes: ["docs"] },
			})
			const now = new Date("2024-01-16T12:00:00Z")
			const state: AutomationRateLimitState = {
				lastRunTimestamp: now.getTime() - 86400000, // 1 day ago
				dailyRunCount: 5,
				dailyRunDate: "2024-01-15", // Yesterday
				lastTriggerReason: TriggerReason.HighCost,
			}

			const result = checkRateLimits(config, state, now)

			expect(result.allowed).toBe(true)
		})

		test("blocks during cooldown period", () => {
			const config = createConfig({
				level: AutomationLevel.AutoTrigger,
				triggers: { failureRate: 0.3, costThreshold: 100, cooldown: 3600 }, // 1 hour
			})
			const now = new Date("2024-01-15T12:00:00Z")
			const state: AutomationRateLimitState = {
				lastRunTimestamp: now.getTime() - 1800000, // 30 minutes ago
				dailyRunCount: 1,
				dailyRunDate: "2024-01-15",
				lastTriggerReason: TriggerReason.HighCost,
			}

			const result = checkRateLimits(config, state, now)

			expect(result.allowed).toBe(false)
			expect(result.reason).toContain("Cooldown")
		})

		test("allows after cooldown period", () => {
			const config = createConfig({
				level: AutomationLevel.AutoTrigger,
				triggers: { failureRate: 0.3, costThreshold: 100, cooldown: 3600 }, // 1 hour
			})
			const now = new Date("2024-01-15T12:00:00Z")
			const state: AutomationRateLimitState = {
				lastRunTimestamp: now.getTime() - 4000000, // More than 1 hour ago
				dailyRunCount: 1,
				dailyRunDate: "2024-01-15",
				lastTriggerReason: TriggerReason.HighCost,
			}

			const result = checkRateLimits(config, state, now)

			expect(result.allowed).toBe(true)
		})
	})

	describe("updateRateLimitState", () => {
		test("increments daily count on same day", () => {
			const now = new Date("2024-01-15T12:00:00Z")
			const state: AutomationRateLimitState = {
				lastRunTimestamp: now.getTime() - 60000,
				dailyRunCount: 2,
				dailyRunDate: "2024-01-15",
				lastTriggerReason: TriggerReason.HighCost,
			}

			const newState = updateRateLimitState(state, TriggerReason.Failure, now)

			expect(newState.dailyRunCount).toBe(3)
			expect(newState.dailyRunDate).toBe("2024-01-15")
			expect(newState.lastTriggerReason).toBe(TriggerReason.Failure)
			expect(newState.lastRunTimestamp).toBe(now.getTime())
		})

		test("resets count on new day", () => {
			const now = new Date("2024-01-16T12:00:00Z")
			const state: AutomationRateLimitState = {
				lastRunTimestamp: now.getTime() - 86400000,
				dailyRunCount: 5,
				dailyRunDate: "2024-01-15", // Yesterday
				lastTriggerReason: TriggerReason.HighCost,
			}

			const newState = updateRateLimitState(state, TriggerReason.HighCost, now)

			expect(newState.dailyRunCount).toBe(1)
			expect(newState.dailyRunDate).toBe("2024-01-16")
		})
	})

	describe("isSafeToAutoApply", () => {
		test("returns false for Level 0 and 1", () => {
			expect(isSafeToAutoApply("docs", createConfig({ level: AutomationLevel.Manual }))).toBe(false)
			expect(isSafeToAutoApply("docs", createConfig({ level: AutomationLevel.AutoTrigger }))).toBe(false)
		})

		test("returns true for configured categories at Level 2", () => {
			const config = createConfig({
				level: AutomationLevel.AutoApplyLowRisk,
				safety: { maxDailyRuns: 5, autoApplyTypes: ["docs", "mode-map"] },
			})

			expect(isSafeToAutoApply("docs", config)).toBe(true)
			expect(isSafeToAutoApply("mode-map", config)).toBe(true)
			expect(isSafeToAutoApply("rubric", config)).toBe(false)
			expect(isSafeToAutoApply("memory", config)).toBe(false)
		})

		test("returns true for all configured categories at Level 3", () => {
			const config = createConfig({
				level: AutomationLevel.FullClosedLoop,
				safety: { maxDailyRuns: 5, autoApplyTypes: ["docs", "memory", "rubric", "mode-map"] },
			})

			expect(isSafeToAutoApply("docs", config)).toBe(true)
			expect(isSafeToAutoApply("memory", config)).toBe(true)
			expect(isSafeToAutoApply("rubric", config)).toBe(true)
			expect(isSafeToAutoApply("mode-map", config)).toBe(true)
		})
	})

	describe("inferCategoryFromPath", () => {
		test("detects mode-map files", () => {
			expect(inferCategoryFromPath("docs/llm-mode-map.yaml")).toBe("mode-map")
			expect(inferCategoryFromPath("config/ModeMap.json")).toBe("mode-map")
			expect(inferCategoryFromPath(".kilocode/modemap.yaml")).toBe("mode-map")
		})

		test("detects documentation files", () => {
			expect(inferCategoryFromPath("docs/readme.md")).toBe("docs")
			expect(inferCategoryFromPath("docs/guide/getting-started.md")).toBe("docs")
			expect(inferCategoryFromPath("README.md")).toBe("docs")
			expect(inferCategoryFromPath("CHANGELOG.md")).toBe("docs")
		})

		test("detects memory files", () => {
			expect(inferCategoryFromPath(".kilocode/memory/context.yaml")).toBe("memory")
			expect(inferCategoryFromPath(".kilocode/memory/sessions/session1.json")).toBe("memory")
		})

		test("detects rubric files", () => {
			expect(inferCategoryFromPath(".kilocode/rubrics/quality.yaml")).toBe("rubric")
			expect(inferCategoryFromPath("evals/rubric-test.yaml")).toBe("rubric")
		})

		test("returns undefined for uncategorizable paths", () => {
			expect(inferCategoryFromPath("src/main.ts")).toBeUndefined()
			expect(inferCategoryFromPath("package.json")).toBeUndefined()
			expect(inferCategoryFromPath(".github/workflows/ci.yml")).toBeUndefined()
		})

		test("handles Windows-style paths", () => {
			expect(inferCategoryFromPath("docs\\readme.md")).toBe("docs")
			expect(inferCategoryFromPath(".kilocode\\memory\\test.yaml")).toBe("memory")
		})
	})

	describe("evaluateAutoApply", () => {
		test("returns canAutoApply false for Level 0 and 1", () => {
			const changes: ProposalChange[] = [{ path: "docs/readme.md", changeType: "modify" }]

			const result1 = evaluateAutoApply(changes, createConfig({ level: AutomationLevel.Manual }))
			const result2 = evaluateAutoApply(changes, createConfig({ level: AutomationLevel.AutoTrigger }))

			expect(result1.canAutoApply).toBe(false)
			expect(result2.canAutoApply).toBe(false)
		})

		test("returns canAutoApply true when all changes are safe", () => {
			const config = createConfig({
				level: AutomationLevel.AutoApplyLowRisk,
				safety: { maxDailyRuns: 5, autoApplyTypes: ["docs", "mode-map"] },
			})
			const changes: ProposalChange[] = [
				{ path: "docs/readme.md", changeType: "modify" },
				{ path: "docs/llm-mode-map.yaml", changeType: "modify" },
			]

			const result = evaluateAutoApply(changes, config)

			expect(result.canAutoApply).toBe(true)
			expect(result.safeChanges).toHaveLength(2)
			expect(result.unsafeChanges).toHaveLength(0)
		})

		test("returns canAutoApply false when some changes are unsafe", () => {
			const config = createConfig({
				level: AutomationLevel.AutoApplyLowRisk,
				safety: { maxDailyRuns: 5, autoApplyTypes: ["docs"] },
			})
			const changes: ProposalChange[] = [
				{ path: "docs/readme.md", changeType: "modify" },
				{ path: "src/main.ts", changeType: "modify" },
			]

			const result = evaluateAutoApply(changes, config)

			expect(result.canAutoApply).toBe(false)
			expect(result.safeChanges).toHaveLength(1)
			expect(result.unsafeChanges).toHaveLength(1)
			expect(result.reason).toContain("require manual approval")
		})

		test("returns canAutoApply false for empty changes", () => {
			const config = createConfig({ level: AutomationLevel.AutoApplyLowRisk })
			const changes: ProposalChange[] = []

			const result = evaluateAutoApply(changes, config)

			expect(result.canAutoApply).toBe(false)
			expect(result.reason).toContain("No changes")
		})

		test("uses provided category if present", () => {
			const config = createConfig({
				level: AutomationLevel.AutoApplyLowRisk,
				safety: { maxDailyRuns: 5, autoApplyTypes: ["memory"] },
			})
			const changes: ProposalChange[] = [
				{ path: "some/random/path.txt", changeType: "create", category: "memory" },
			]

			const result = evaluateAutoApply(changes, config)

			expect(result.canAutoApply).toBe(true)
			expect(result.safeChanges).toHaveLength(1)
		})
	})

	describe("requiresHumanApproval", () => {
		test("returns true for council.yaml", () => {
			expect(requiresHumanApproval(".kilocode/evolution/council.yaml")).toBe(true)
		})

		test("returns true for rules.md", () => {
			expect(requiresHumanApproval(".kilocode/rules/rules.md")).toBe(true)
			expect(requiresHumanApproval(".kilocode/rules/custom-rules.md")).toBe(true)
		})

		test("returns true for package.json", () => {
			expect(requiresHumanApproval("package.json")).toBe(true)
			expect(requiresHumanApproval("packages/core/package.json")).toBe(true)
		})

		test("returns true for pnpm-lock.yaml", () => {
			expect(requiresHumanApproval("pnpm-lock.yaml")).toBe(true)
		})

		test("returns true for .github/ files", () => {
			expect(requiresHumanApproval(".github/workflows/ci.yml")).toBe(true)
			expect(requiresHumanApproval(".github/CODEOWNERS")).toBe(true)
		})

		test("returns false for allowed paths", () => {
			expect(requiresHumanApproval("docs/readme.md")).toBe(false)
			expect(requiresHumanApproval("docs/llm-mode-map.yaml")).toBe(false)
			expect(requiresHumanApproval(".kilocode/memory/test.yaml")).toBe(false)
			expect(requiresHumanApproval("src/test.ts")).toBe(false)
		})

		test("handles Windows-style paths", () => {
			expect(requiresHumanApproval(".kilocode\\rules\\rules.md")).toBe(true)
			expect(requiresHumanApproval(".github\\workflows\\ci.yml")).toBe(true)
		})
	})

	describe("createOrchestrationResult", () => {
		test("creates default result", () => {
			const result = createOrchestrationResult()

			expect(result.triggered).toBe(false)
			expect(result.reason).toBe(TriggerReason.None)
			expect(result.rateLimited).toBe(false)
			expect(result.traceExported).toBe(false)
			expect(result.councilRan).toBe(false)
			expect(result.proposalGenerated).toBe(false)
			expect(result.autoApplied).toBe(false)
		})

		test("merges partial values", () => {
			const result = createOrchestrationResult({
				triggered: true,
				reason: TriggerReason.HighCost,
				details: "test details",
			})

			expect(result.triggered).toBe(true)
			expect(result.reason).toBe(TriggerReason.HighCost)
			expect(result.details).toBe("test details")
			expect(result.rateLimited).toBe(false) // Default
		})
	})

	describe("createLogEntry", () => {
		test("creates log entry with all fields", () => {
			const entry = createLogEntry("test.event", "start", { foo: "bar" })

			expect(entry.event).toBe("test.event")
			expect(entry.phase).toBe("start")
			expect(entry.data).toEqual({ foo: "bar" })
			expect(entry.timestamp).toBeDefined()
			expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp)
		})

		test("creates log entry without data", () => {
			const entry = createLogEntry("test.event", "end")

			expect(entry.event).toBe("test.event")
			expect(entry.phase).toBe("end")
			expect(entry.data).toBeUndefined()
		})
	})

	describe("formatLogEntry", () => {
		test("formats log entry as JSON string", () => {
			const entry = createLogEntry("test.event", "start", { foo: "bar" })
			const formatted = formatLogEntry(entry)

			expect(typeof formatted).toBe("string")

			const parsed = JSON.parse(formatted)
			expect(parsed.event).toBe("test.event")
			expect(parsed.phase).toBe("start")
			expect(parsed.data.foo).toBe("bar")
		})
	})
})
