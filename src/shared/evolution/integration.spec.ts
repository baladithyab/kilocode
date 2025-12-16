/**
 * Integration Tests for Evolution Layer Features
 *
 * Tests the full cycle of:
 * - Mode detection triggering automation
 * - Policy Engine routing decisions
 * - Self-healing rollback mechanism
 */

import { mkdir, writeFile, rm, readFile } from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "node:os"
import { mkdtemp } from "node:fs/promises"

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import YAML from "yaml"

import type { CouncilConfig } from "@roo-code/types"

import { detectModes, createModeDetectionNudge, evaluateModeDetectionTrigger } from "./modeDetection"
import {
	PolicyEngine,
	createPolicyEngineFromCouncil,
	loadPolicyConfig,
	DEFAULT_POLICY_ENGINE_CONFIG,
} from "./policyEngine"
import { SelfHealingManager, createSelfHealingManager, type PerformanceMetrics } from "./selfHealing"

async function makeTempDir(): Promise<string> {
	return mkdtemp(path.join(tmpdir(), "kilocode-evolution-integration-"))
}

describe("Evolution Layer Integration", () => {
	let tempDir: string

	beforeEach(async () => {
		tempDir = await makeTempDir()
	})

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true })
	})

	describe("Mode Detection → Automation Trigger", () => {
		it("detects untracked modes and triggers sync automation", async () => {
			// Setup: Create .kilocodemodes with modes
			await writeFile(
				path.join(tempDir, ".kilocodemodes"),
				JSON.stringify({
					customModes: [
						{ slug: "code", name: "Code", roleDefinition: "Default coding mode", groups: ["read", "edit"] },
						{ slug: "test", name: "Test", roleDefinition: "Test writing mode", groups: ["read", "edit"] },
						{
							slug: "new-custom-mode",
							name: "New Custom Mode",
							roleDefinition: "A new mode",
							groups: ["read"],
						},
					],
				}),
			)

			// Setup: Create council.yaml with only some modes tracked
			const configPath = path.join(tempDir, ".kilocode", "evolution")
			await mkdir(configPath, { recursive: true })
			await writeFile(
				path.join(configPath, "council.yaml"),
				YAML.stringify({
					version: 1,
					roles: {
						code: { profile: "default", promptPath: "code.md" },
						test: { profile: "test-profile", promptPath: "test.md" },
					},
				}),
			)

			// Step 1: Detect modes
			const detectionResult = await detectModes(tempDir)

			expect(detectionResult.hasDrift).toBe(true)
			expect(detectionResult.untrackedModes).toHaveLength(1)
			expect(detectionResult.untrackedModes[0].slug).toBe("new-custom-mode")

			// Step 2: Generate nudge message
			const nudge = createModeDetectionNudge(detectionResult)

			expect(nudge).not.toBeNull()
			expect(nudge).toContain("1 mode(s) not tracked")
			expect(nudge).toContain("New Custom Mode")
			expect(nudge).toContain("Sync Evolution Mode Map")

			// Step 3: Evaluate automation trigger
			const trigger = evaluateModeDetectionTrigger(detectionResult, { minUntrackedModes: 1 })

			expect(trigger.shouldTrigger).toBe(true)
			expect(trigger.suggestedAction).toBe("sync-mode-map")
			expect(trigger.triggeringModes).toHaveLength(1)
		})

		it("does not trigger when all modes are tracked", async () => {
			// Setup: Matching modes in both files
			await writeFile(
				path.join(tempDir, ".kilocodemodes"),
				JSON.stringify({
					customModes: [
						{ slug: "code", name: "Code", roleDefinition: "Default coding mode", groups: ["read", "edit"] },
					],
				}),
			)

			const configPath = path.join(tempDir, ".kilocode", "evolution")
			await mkdir(configPath, { recursive: true })
			await writeFile(
				path.join(configPath, "council.yaml"),
				YAML.stringify({
					version: 1,
					roles: {
						code: { profile: "default", promptPath: "code.md" },
					},
				}),
			)

			const detectionResult = await detectModes(tempDir)

			expect(detectionResult.hasDrift).toBe(false)

			const nudge = createModeDetectionNudge(detectionResult)
			expect(nudge).toBeNull()

			const trigger = evaluateModeDetectionTrigger(detectionResult)
			expect(trigger.shouldTrigger).toBe(false)
		})
	})

	describe("Policy Engine → Task Routing", () => {
		it("routes tasks to appropriate modes based on patterns", async () => {
			// Setup: Create council config
			const councilConfig: CouncilConfig = {
				version: 1,
				roles: {
					architect: { profile: "architect-profile", promptPath: "arch.md" },
					test: { profile: "test-profile", promptPath: "test.md" },
					debug: { profile: "debug-profile", promptPath: "debug.md" },
				},
			}

			// Create Policy Engine from council config
			const engine = createPolicyEngineFromCouncil(councilConfig)

			// Test architecture task routing
			const archResult = engine.evaluate({
				taskDescription: "Design a new microservices architecture for the payment system",
			})
			expect(archResult.recommendedMode).toBe("architect")

			// Test debugging task routing
			const debugResult = engine.evaluate({
				taskDescription: "Fix the error in the login function - users are getting 500 errors",
			})
			expect(debugResult.recommendedMode).toBe("debug")

			// Test test writing task routing
			const testResult = engine.evaluate({
				taskDescription: "Write unit tests for the UserService class",
			})
			expect(testResult.recommendedMode).toBe("test")
		})

		it("considers cost constraints in routing", async () => {
			const engine = new PolicyEngine({
				...DEFAULT_POLICY_ENGINE_CONFIG,
				rules: [
					{
						id: "expensive-architect",
						name: "Route expensive tasks to architect",
						priority: 100,
						conditions: [{ type: "cost-estimate", operator: "greater-than", value: 50 }],
						targetMode: "architect",
						enabled: true,
					},
					{
						id: "default-code",
						name: "Default to code mode",
						priority: 10,
						conditions: [],
						targetMode: "code",
						enabled: true,
					},
				],
			})

			// Expensive task should go to architect
			const expensiveResult = engine.evaluate({
				taskDescription: "Implement new feature",
				estimatedCost: 75,
			})
			expect(expensiveResult.recommendedMode).toBe("architect")

			// Cheap task should use default
			const cheapResult = engine.evaluate({
				taskDescription: "Implement new feature",
				estimatedCost: 25,
			})
			expect(cheapResult.recommendedMode).toBe("code")
		})

		it("evolves policy rules based on feedback", () => {
			const engine = new PolicyEngine({
				...DEFAULT_POLICY_ENGINE_CONFIG,
				rules: [
					{
						id: "evolving-rule",
						name: "Evolving Rule",
						priority: 100,
						conditions: [{ type: "task-pattern", operator: "contains", value: "test" }],
						targetMode: "test",
						enabled: true,
						metadata: {},
					},
				],
			})

			// Simulate successful task completions
			engine.recordTrigger("evolving-rule", true, 20)
			engine.recordTrigger("evolving-rule", true, 25)
			engine.recordTrigger("evolving-rule", false, 50)

			const rule = engine.getRules().find((r) => r.id === "evolving-rule")

			expect(rule?.metadata?.triggerCount).toBe(3)
			expect(rule?.metadata?.successRate).toBeCloseTo(0.67, 1)
			expect(rule?.metadata?.averageCost).toBeCloseTo(31.67, 1)
		})
	})

	describe("Self-Healing → Rollback Mechanism", () => {
		it("tracks proposal application and detects degradation", async () => {
			const manager = await createSelfHealingManager(tempDir)

			// Create files that would be affected by a proposal
			await writeFile(path.join(tempDir, "config.yaml"), "original: true")

			const beforeMetrics: PerformanceMetrics = {
				successRate: 0.9,
				averageCost: 20,
				averageDurationMs: 5000,
				taskCount: 100,
				timestamp: new Date().toISOString(),
			}

			// Record application
			const application = await manager.recordApplication(
				"proposal-001",
				".kilocode/evolution/proposals/001.yaml",
				["config.yaml"],
				beforeMetrics,
			)

			expect(application.status).toBe("monitoring")

			// Simulate modification
			await writeFile(path.join(tempDir, "config.yaml"), "original: false\nnew_setting: true")

			// Update with degraded metrics
			const afterMetrics: PerformanceMetrics = {
				successRate: 0.6, // 30 percentage point drop
				averageCost: 40, // 100% increase
				averageDurationMs: 12000, // 140% increase
				taskCount: 20,
				timestamp: new Date().toISOString(),
			}

			await manager.updateMetrics(application.id, afterMetrics)

			// Evaluate for degradation
			const evaluation = await manager.evaluateApplication(application.id)

			expect(evaluation).not.toBeNull()
			expect(evaluation?.degraded).toBe(true)
			expect(evaluation?.recommendation).toBe("rollback")
			expect(evaluation?.severity).toBeGreaterThan(50)
		})

		it("performs automatic rollback and restores files", async () => {
			const manager = await createSelfHealingManager(tempDir)

			// Create original file
			const originalContent = "# Original Configuration\nsetting: value"
			await writeFile(path.join(tempDir, "test-config.yaml"), originalContent)

			const beforeMetrics: PerformanceMetrics = {
				successRate: 0.95,
				averageCost: 15,
				averageDurationMs: 3000,
				taskCount: 50,
				timestamp: new Date().toISOString(),
			}

			const application = await manager.recordApplication(
				"proposal-rollback-test",
				"path/to/proposal",
				["test-config.yaml"],
				beforeMetrics,
			)

			// Simulate modification to the file
			await writeFile(path.join(tempDir, "test-config.yaml"), "# Modified by bad proposal\nbroken: true")

			// Verify file was modified
			let currentContent = await readFile(path.join(tempDir, "test-config.yaml"), "utf8")
			expect(currentContent).toContain("broken: true")

			// Perform rollback
			const rollbackAction = await manager.rollback(
				application.id,
				"Performance degradation detected",
				false,
				"integration-test",
			)

			expect(rollbackAction.result).toBe("success")
			expect(rollbackAction.restoredFiles).toContain("test-config.yaml")

			// Verify file was restored
			currentContent = await readFile(path.join(tempDir, "test-config.yaml"), "utf8")
			expect(currentContent).toBe(originalContent)

			// Verify audit log
			const rollbackLog = manager.getRollbackLog()
			expect(rollbackLog).toHaveLength(1)
			expect(rollbackLog[0].applicationId).toBe(application.id)
			expect(rollbackLog[0].reason).toBe("Performance degradation detected")
		})

		it("respects rate limits for automatic rollbacks", async () => {
			const manager = await createSelfHealingManager(tempDir, {
				enabled: true,
				maxDailyRollbacks: 2, // Low limit for testing
				monitoringPeriodMs: 24 * 60 * 60 * 1000,
				minTasksForEvaluation: 5,
				thresholds: {
					successRateDropPercent: 10,
					costIncreasePercent: 30,
					durationIncreasePercent: 50,
				},
				backupRetentionDays: 30,
			})

			const baseMetrics: PerformanceMetrics = {
				successRate: 0.9,
				averageCost: 20,
				averageDurationMs: 5000,
				taskCount: 50,
				timestamp: new Date().toISOString(),
			}

			// Create multiple applications with files to backup
			const applications = []
			for (let i = 0; i < 4; i++) {
				// Create a file for each application
				const filename = `rate-limit-${i}.txt`
				await writeFile(path.join(tempDir, filename), `content ${i}`)
				const app = await manager.recordApplication(`proposal-rate-limit-${i}`, "path", [filename], baseMetrics)
				applications.push(app)
			}

			// First two automatic rollbacks should succeed
			await manager.rollback(applications[0].id, "test-1", true, "auto-heal")
			await manager.rollback(applications[1].id, "test-2", true, "auto-heal")

			// Third automatic rollback should be rate limited
			await expect(manager.rollback(applications[2].id, "test-3", true, "auto-heal")).rejects.toThrow(
				"rate limited",
			)

			// Manual rollback should still work
			const manualRollback = await manager.rollback(applications[2].id, "manual-override", false, "manual")
			expect(manualRollback.result).toBe("success")
		})
	})

	describe("Full Evolution Cycle", () => {
		it("complete flow: mode detection → policy evaluation → task execution → self-healing", async () => {
			// === Phase 1: Mode Detection ===
			await writeFile(
				path.join(tempDir, ".kilocodemodes"),
				JSON.stringify({
					customModes: [
						{ slug: "code", name: "Code", roleDefinition: "Default coding mode", groups: ["read", "edit"] },
						{ slug: "architect", name: "Architect", roleDefinition: "Architecture mode", groups: ["read"] },
						{
							slug: "evolution",
							name: "Evolution",
							roleDefinition: "Evolution mode",
							groups: ["read", "edit"],
						},
					],
				}),
			)

			const councilPath = path.join(tempDir, ".kilocode", "evolution")
			await mkdir(councilPath, { recursive: true })
			await writeFile(
				path.join(councilPath, "council.yaml"),
				YAML.stringify({
					version: 1,
					roles: {
						code: { profile: "default", promptPath: "code.md" },
						architect: { profile: "architect", promptPath: "architect.md" },
						// 'evolution' role is missing - simulating drift
					},
				}),
			)

			const modeDetection = await detectModes(tempDir)
			expect(modeDetection.hasDrift).toBe(true)
			expect(modeDetection.untrackedModes.map((m) => m.slug)).toContain("evolution")

			// === Phase 2: Policy Engine Evaluation ===
			const councilConfig: CouncilConfig = {
				version: 1,
				roles: {
					code: { profile: "default", promptPath: "code.md" },
					architect: { profile: "architect", promptPath: "architect.md" },
				},
			}

			const policyEngine = createPolicyEngineFromCouncil(councilConfig)

			// Simulate task that should be routed to architect mode
			const routingResult = policyEngine.evaluate({
				taskDescription: "Design the database schema for the new user management system",
				estimatedCost: 80,
			})

			expect(routingResult.recommendedMode).toBe("architect")

			// === Phase 3: Self-Healing Setup ===
			const selfHealing = await createSelfHealingManager(tempDir)

			// Create a proposal file that would be applied
			const proposalPath = path.join(councilPath, "proposals")
			await mkdir(proposalPath, { recursive: true })
			await writeFile(
				path.join(proposalPath, "add-evolution-role.yaml"),
				YAML.stringify({
					id: "add-evolution-role",
					type: "mode-map-sync",
					changes: [
						{
							action: "add",
							role: "evolution",
							mode: "evolution",
						},
					],
				}),
			)

			// Create the council.yaml that would be modified
			const originalCouncil = await readFile(path.join(councilPath, "council.yaml"), "utf8")

			const beforeMetrics: PerformanceMetrics = {
				successRate: 0.92,
				averageCost: 25,
				averageDurationMs: 4500,
				taskCount: 100,
				timestamp: new Date().toISOString(),
			}

			// Record the proposal application
			const application = await selfHealing.recordApplication(
				"add-evolution-role",
				"proposals/add-evolution-role.yaml",
				[path.join(councilPath, "council.yaml")],
				beforeMetrics,
			)

			// Simulate applying the proposal
			const updatedCouncil = YAML.stringify({
				version: 1,
				roles: {
					code: { profile: "default", promptPath: "code.md" },
					architect: { profile: "architect", promptPath: "architect.md" },
					evolution: { profile: "evolution", promptPath: "evolution.md" },
				},
			})
			await writeFile(path.join(councilPath, "council.yaml"), updatedCouncil)

			// === Phase 4: Simulate Good Outcome ===
			// After some time, metrics show improvement (not degradation)
			const afterMetrics: PerformanceMetrics = {
				successRate: 0.94, // Slight improvement
				averageCost: 23, // Lower cost
				averageDurationMs: 4200, // Faster
				taskCount: 25,
				timestamp: new Date().toISOString(),
			}

			await selfHealing.updateMetrics(application.id, afterMetrics)
			const evaluation = await selfHealing.evaluateApplication(application.id)

			expect(evaluation).not.toBeNull()
			expect(evaluation?.degraded).toBe(false)
			expect(evaluation?.recommendation).toBe("ignore")

			// === Phase 5: Verify Post-Application State ===
			// Re-run mode detection to confirm drift is resolved
			const postDetection = await detectModes(tempDir)
			expect(postDetection.hasDrift).toBe(false)
			expect(postDetection.trackedModes).toContain("evolution")
		})
	})
})
