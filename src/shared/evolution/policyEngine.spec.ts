/**
 * Tests for Evolution Layer Policy Engine
 */

import { mkdir, writeFile, rm } from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "node:os"
import { mkdtemp } from "node:fs/promises"

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import YAML from "yaml"

import type { CouncilConfig } from "@roo-code/types"

import {
	BUILTIN_POLICY_RULES,
	calculateModeScore,
	createPolicyEngineFromCouncil,
	DEFAULT_POLICY_ENGINE_CONFIG,
	evaluateCondition,
	evaluatePolicies,
	evaluateRule,
	loadPolicyConfig,
	PolicyEngine,
	type PolicyCondition,
	type PolicyEvaluationContext,
	type PolicyRule,
} from "./policyEngine"

async function makeTempDir(): Promise<string> {
	return mkdtemp(path.join(tmpdir(), "kilocode-policy-engine-"))
}

describe("policyEngine", () => {
	let tempDir: string

	beforeEach(async () => {
		tempDir = await makeTempDir()
	})

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true })
	})

	describe("BUILTIN_POLICY_RULES", () => {
		it("has architecture rule", () => {
			const rule = BUILTIN_POLICY_RULES.find((r) => r.id === "architecture-tasks")
			expect(rule).toBeDefined()
			expect(rule?.targetMode).toBe("architect")
		})

		it("has debugging rule", () => {
			const rule = BUILTIN_POLICY_RULES.find((r) => r.id === "debugging-tasks")
			expect(rule).toBeDefined()
			expect(rule?.targetMode).toBe("debug")
		})

		it("has test writing rule", () => {
			const rule = BUILTIN_POLICY_RULES.find((r) => r.id === "test-writing")
			expect(rule).toBeDefined()
			expect(rule?.targetMode).toBe("test")
		})

		it("has high cost rule", () => {
			const rule = BUILTIN_POLICY_RULES.find((r) => r.id === "high-cost-tasks")
			expect(rule).toBeDefined()
			expect(rule?.targetMode).toBe("architect")
		})
	})

	describe("evaluateCondition", () => {
		describe("task-pattern conditions", () => {
			it("evaluates equals operator", () => {
				const condition: PolicyCondition = {
					type: "task-pattern",
					operator: "equals",
					value: "fix the bug",
				}

				expect(evaluateCondition(condition, { taskDescription: "Fix the bug" })).toBe(true)
				expect(evaluateCondition(condition, { taskDescription: "Fix the bug please" })).toBe(false)
			})

			it("evaluates contains operator", () => {
				const condition: PolicyCondition = {
					type: "task-pattern",
					operator: "contains",
					value: "refactor",
				}

				expect(evaluateCondition(condition, { taskDescription: "Please refactor this code" })).toBe(true)
				expect(evaluateCondition(condition, { taskDescription: "Add new feature" })).toBe(false)
			})

			it("evaluates matches operator (regex)", () => {
				const condition: PolicyCondition = {
					type: "task-pattern",
					operator: "matches",
					value: "(debug|fix|error)",
				}

				expect(evaluateCondition(condition, { taskDescription: "Debug the issue" })).toBe(true)
				expect(evaluateCondition(condition, { taskDescription: "Fix the error" })).toBe(true)
				expect(evaluateCondition(condition, { taskDescription: "Add feature" })).toBe(false)
			})

			it("handles invalid regex gracefully", () => {
				const condition: PolicyCondition = {
					type: "task-pattern",
					operator: "matches",
					value: "[invalid(regex",
				}

				expect(evaluateCondition(condition, { taskDescription: "any task" })).toBe(false)
			})
		})

		describe("cost-estimate conditions", () => {
			it("evaluates greater-than operator", () => {
				const condition: PolicyCondition = {
					type: "cost-estimate",
					operator: "greater-than",
					value: 50,
				}

				expect(evaluateCondition(condition, { taskDescription: "task", estimatedCost: 75 })).toBe(true)
				expect(evaluateCondition(condition, { taskDescription: "task", estimatedCost: 50 })).toBe(false)
				expect(evaluateCondition(condition, { taskDescription: "task", estimatedCost: 25 })).toBe(false)
			})

			it("evaluates less-than operator", () => {
				const condition: PolicyCondition = {
					type: "cost-estimate",
					operator: "less-than",
					value: 20,
				}

				expect(evaluateCondition(condition, { taskDescription: "task", estimatedCost: 10 })).toBe(true)
				expect(evaluateCondition(condition, { taskDescription: "task", estimatedCost: 30 })).toBe(false)
			})

			it("uses default cost of 0 when not provided", () => {
				const condition: PolicyCondition = {
					type: "cost-estimate",
					operator: "less-than",
					value: 10,
				}

				expect(evaluateCondition(condition, { taskDescription: "task" })).toBe(true)
			})
		})

		describe("file-extension conditions", () => {
			it("evaluates in operator", () => {
				const condition: PolicyCondition = {
					type: "file-extension",
					operator: "in",
					value: [".ts", ".tsx"],
				}

				expect(
					evaluateCondition(condition, {
						taskDescription: "task",
						filePaths: ["src/index.ts", "src/app.tsx"],
					}),
				).toBe(true)
				expect(
					evaluateCondition(condition, {
						taskDescription: "task",
						filePaths: ["src/index.js"],
					}),
				).toBe(false)
			})

			it("evaluates not-in operator", () => {
				const condition: PolicyCondition = {
					type: "file-extension",
					operator: "not-in",
					value: [".md"],
				}

				expect(
					evaluateCondition(condition, {
						taskDescription: "task",
						filePaths: ["src/index.ts"],
					}),
				).toBe(true)
				expect(
					evaluateCondition(condition, {
						taskDescription: "task",
						filePaths: ["README.md"],
					}),
				).toBe(false)
			})
		})

		describe("complexity conditions", () => {
			it("evaluates complexity score", () => {
				const condition: PolicyCondition = {
					type: "complexity",
					operator: "greater-than",
					value: 70,
				}

				expect(evaluateCondition(condition, { taskDescription: "task", complexityScore: 80 })).toBe(true)
				expect(evaluateCondition(condition, { taskDescription: "task", complexityScore: 50 })).toBe(false)
			})

			it("uses default complexity of 50", () => {
				const condition: PolicyCondition = {
					type: "complexity",
					operator: "less-than",
					value: 60,
				}

				expect(evaluateCondition(condition, { taskDescription: "task" })).toBe(true)
			})
		})

		describe("keywords conditions", () => {
			it("evaluates contains with array of keywords", () => {
				const condition: PolicyCondition = {
					type: "keywords",
					operator: "contains",
					value: ["test", "coverage"],
				}

				expect(evaluateCondition(condition, { taskDescription: "increase test coverage" })).toBe(true)
				expect(evaluateCondition(condition, { taskDescription: "add new feature" })).toBe(false)
			})

			it("evaluates in (all keywords must match)", () => {
				const condition: PolicyCondition = {
					type: "keywords",
					operator: "in",
					value: ["unit", "test"],
				}

				expect(evaluateCondition(condition, { taskDescription: "write unit test" })).toBe(true)
				expect(evaluateCondition(condition, { taskDescription: "write integration test" })).toBe(false)
			})
		})

		describe("negate option", () => {
			it("negates the condition result", () => {
				const condition: PolicyCondition = {
					type: "task-pattern",
					operator: "contains",
					value: "refactor",
					negate: true,
				}

				expect(evaluateCondition(condition, { taskDescription: "refactor code" })).toBe(false)
				expect(evaluateCondition(condition, { taskDescription: "add feature" })).toBe(true)
			})
		})
	})

	describe("evaluateRule", () => {
		it("returns false for disabled rules", () => {
			const rule: PolicyRule = {
				id: "test",
				name: "Test Rule",
				priority: 100,
				conditions: [{ type: "task-pattern", operator: "contains", value: "test" }],
				targetMode: "test",
				enabled: false,
			}

			expect(evaluateRule(rule, { taskDescription: "this is a test" })).toBe(false)
		})

		it("requires all conditions to match (AND logic)", () => {
			const rule: PolicyRule = {
				id: "test",
				name: "Test Rule",
				priority: 100,
				conditions: [
					{ type: "task-pattern", operator: "contains", value: "test" },
					{ type: "cost-estimate", operator: "greater-than", value: 10 },
				],
				targetMode: "test",
				enabled: true,
			}

			// Both conditions met
			expect(evaluateRule(rule, { taskDescription: "write test", estimatedCost: 20 })).toBe(true)

			// Only first condition met
			expect(evaluateRule(rule, { taskDescription: "write test", estimatedCost: 5 })).toBe(false)

			// Only second condition met
			expect(evaluateRule(rule, { taskDescription: "add feature", estimatedCost: 20 })).toBe(false)
		})
	})

	describe("evaluatePolicies", () => {
		it("returns matched rule with highest priority", () => {
			const config = {
				...DEFAULT_POLICY_ENGINE_CONFIG,
				rules: [
					{
						id: "low-priority",
						name: "Low Priority",
						priority: 50,
						conditions: [{ type: "task-pattern", operator: "contains", value: "code" } as PolicyCondition],
						targetMode: "code",
						enabled: true,
					},
					{
						id: "high-priority",
						name: "High Priority",
						priority: 100,
						conditions: [{ type: "task-pattern", operator: "contains", value: "code" } as PolicyCondition],
						targetMode: "architect",
						enabled: true,
					},
				],
			}

			const result = evaluatePolicies({ taskDescription: "write some code" }, config)

			expect(result.recommendedMode).toBe("architect")
			expect(result.matchedRule?.id).toBe("high-priority")
		})

		it("returns default mode when no rules match", () => {
			const config = {
				...DEFAULT_POLICY_ENGINE_CONFIG,
				defaultMode: "code",
				rules: [
					{
						id: "test",
						name: "Test",
						priority: 100,
						conditions: [
							{ type: "task-pattern", operator: "contains", value: "nonexistent" } as PolicyCondition,
						],
						targetMode: "test",
						enabled: true,
					},
				],
			}

			const result = evaluatePolicies({ taskDescription: "add new feature" }, config)

			expect(result.recommendedMode).toBe("code")
			expect(result.matchedRule).toBeUndefined()
			expect(result.explanation).toContain("No policy rules matched")
		})

		it("includes profile override from rule", () => {
			const config = {
				...DEFAULT_POLICY_ENGINE_CONFIG,
				rules: [
					{
						id: "test",
						name: "Test",
						priority: 100,
						conditions: [{ type: "task-pattern", operator: "contains", value: "test" } as PolicyCondition],
						targetMode: "test",
						profileOverride: "test-profile",
						enabled: true,
					},
				],
			}

			const result = evaluatePolicies({ taskDescription: "write test" }, config)

			expect(result.profileOverride).toBe("test-profile")
		})

		it("provides alternatives", () => {
			const config = {
				...DEFAULT_POLICY_ENGINE_CONFIG,
				rules: [
					{
						id: "matched",
						name: "Matched",
						priority: 100,
						conditions: [{ type: "task-pattern", operator: "contains", value: "test" } as PolicyCondition],
						targetMode: "test",
						enabled: true,
					},
					{
						id: "not-matched",
						name: "Not Matched",
						priority: 50,
						conditions: [
							{ type: "task-pattern", operator: "contains", value: "nonexistent" } as PolicyCondition,
						],
						targetMode: "debug",
						enabled: true,
					},
				],
			}

			const result = evaluatePolicies({ taskDescription: "write test" }, config)

			expect(result.alternatives).toBeDefined()
			expect(result.alternatives?.length).toBeGreaterThan(0)
			expect(result.alternatives?.find((a) => a.mode === "debug")).toBeDefined()
		})
	})

	describe("calculateModeScore", () => {
		it("returns 50 when historical scoring disabled", () => {
			const config = {
				...DEFAULT_POLICY_ENGINE_CONFIG,
				useHistoricalScoring: false,
			}

			const score = calculateModeScore("code", { taskDescription: "task" }, config)

			expect(score).toBe(50)
		})

		it("returns 50 when no history available", () => {
			const config = DEFAULT_POLICY_ENGINE_CONFIG

			const score = calculateModeScore("code", { taskDescription: "task" }, config)

			expect(score).toBe(50)
		})

		it("calculates score based on success rate and cost", () => {
			const config = {
				...DEFAULT_POLICY_ENGINE_CONFIG,
				useHistoricalScoring: true,
				historyWeight: 0.5,
				costWeight: 0.3,
			}

			const context: PolicyEvaluationContext = {
				taskDescription: "task",
				history: {
					modeStats: {
						code: {
							totalTasks: 100,
							successRate: 0.9, // 90% success
							averageCost: 20, // $20 average
							averageDurationMs: 5000,
						},
					},
				},
			}

			const score = calculateModeScore("code", context, config)

			// 0.9 * 100 * 0.5 (success) + (1 - 0.2) * 100 * 0.3 (cost) + 50 * 0.2 (base)
			// = 45 + 24 + 10 = 79
			expect(score).toBe(79)
		})
	})

	describe("loadPolicyConfig", () => {
		it("returns defaults with built-in rules when file missing", async () => {
			const config = await loadPolicyConfig(tempDir)

			expect(config.defaultMode).toBe("code")
			expect(config.rules.length).toBeGreaterThan(0)
			expect(config.rules.some((r) => r.id === "architecture-tasks")).toBe(true)
		})

		it("loads custom config from file", async () => {
			const configPath = path.join(tempDir, ".kilocode", "evolution")
			await mkdir(configPath, { recursive: true })
			await writeFile(
				path.join(configPath, "policy.yaml"),
				YAML.stringify({
					defaultMode: "architect",
					rules: [
						{
							id: "custom",
							name: "Custom Rule",
							priority: 100,
							conditions: [{ type: "task-pattern", operator: "contains", value: "custom" }],
							targetMode: "custom-mode",
							enabled: true,
						},
					],
				}),
			)

			const config = await loadPolicyConfig(tempDir)

			expect(config.defaultMode).toBe("architect")
			expect(config.rules).toHaveLength(1)
			expect(config.rules[0].id).toBe("custom")
		})

		it("returns defaults on invalid YAML", async () => {
			const configPath = path.join(tempDir, ".kilocode", "evolution")
			await mkdir(configPath, { recursive: true })
			await writeFile(path.join(configPath, "policy.yaml"), "invalid: yaml: content:")

			const config = await loadPolicyConfig(tempDir)

			expect(config.defaultMode).toBe("code")
		})
	})

	describe("PolicyEngine class", () => {
		it("evaluates policies", () => {
			const engine = new PolicyEngine({
				...DEFAULT_POLICY_ENGINE_CONFIG,
				rules: [
					{
						id: "test",
						name: "Test",
						priority: 100,
						conditions: [{ type: "task-pattern", operator: "contains", value: "debug" }],
						targetMode: "debug",
						enabled: true,
					},
				],
			})

			const result = engine.evaluate({ taskDescription: "debug this issue" })

			expect(result.recommendedMode).toBe("debug")
		})

		it("adds rules", () => {
			const engine = new PolicyEngine()
			const initialCount = engine.getRules().length

			engine.addRule({
				id: "new-rule",
				name: "New Rule",
				priority: 50,
				conditions: [],
				targetMode: "code",
				enabled: true,
			})

			expect(engine.getRules().length).toBe(initialCount + 1)
		})

		it("removes rules", () => {
			const engine = new PolicyEngine({
				...DEFAULT_POLICY_ENGINE_CONFIG,
				rules: [
					{
						id: "to-remove",
						name: "Remove Me",
						priority: 100,
						conditions: [],
						targetMode: "code",
						enabled: true,
					},
				],
			})

			const removed = engine.removeRule("to-remove")

			expect(removed).toBe(true)
			expect(engine.getRules().find((r) => r.id === "to-remove")).toBeUndefined()
		})

		it("updates rules", () => {
			const engine = new PolicyEngine({
				...DEFAULT_POLICY_ENGINE_CONFIG,
				rules: [
					{
						id: "to-update",
						name: "Update Me",
						priority: 100,
						conditions: [],
						targetMode: "code",
						enabled: true,
					},
				],
			})

			const updated = engine.updateRule("to-update", { enabled: false, priority: 50 })

			expect(updated).toBe(true)
			const rule = engine.getRules().find((r) => r.id === "to-update")
			expect(rule?.enabled).toBe(false)
			expect(rule?.priority).toBe(50)
		})

		it("records trigger metrics", () => {
			const engine = new PolicyEngine({
				...DEFAULT_POLICY_ENGINE_CONFIG,
				rules: [
					{
						id: "tracked",
						name: "Tracked Rule",
						priority: 100,
						conditions: [],
						targetMode: "code",
						enabled: true,
						metadata: {},
					},
				],
			})

			engine.recordTrigger("tracked", true, 25)
			engine.recordTrigger("tracked", false, 35)

			const rule = engine.getRules().find((r) => r.id === "tracked")
			expect(rule?.metadata?.triggerCount).toBe(2)
			expect(rule?.metadata?.successRate).toBe(0.5) // 1 success, 1 failure
			expect(rule?.metadata?.averageCost).toBe(30) // (25 + 35) / 2
		})
	})

	describe("createPolicyEngineFromCouncil", () => {
		it("creates engine with council-derived rules", () => {
			const councilConfig: CouncilConfig = {
				version: 1,
				roles: {
					governance: { profile: "governance-profile", promptPath: "gov.md" },
					quality: { profile: "quality-profile", promptPath: "qual.md" },
				},
			}

			const engine = createPolicyEngineFromCouncil(councilConfig)
			const rules = engine.getRules()

			// Should have both built-in rules and council-derived rules
			expect(rules.some((r) => r.id === "architecture-tasks")).toBe(true)
			expect(rules.some((r) => r.id === "council-governance")).toBe(true)
			expect(rules.some((r) => r.id === "council-quality")).toBe(true)

			// Council rules should have profile overrides
			const govRule = rules.find((r) => r.id === "council-governance")
			expect(govRule?.profileOverride).toBe("governance-profile")
		})
	})
})
