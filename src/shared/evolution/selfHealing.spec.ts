/**
 * Tests for Evolution Layer Self-Healing
 */

import { mkdir, writeFile, rm, readFile } from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "node:os"
import { mkdtemp } from "node:fs/promises"

import { describe, it, expect, beforeEach, afterEach } from "vitest"

import {
	calculatePercentChange,
	checkRollbackRateLimit,
	createSelfHealingManager,
	DEFAULT_ROLLBACK_RATE_LIMIT_STATE,
	DEFAULT_SELF_HEALING_CONFIG,
	detectDegradation,
	SelfHealingManager,
	updateRollbackRateLimitState,
	type PerformanceMetrics,
	type RollbackRateLimitState,
} from "./selfHealing"

async function makeTempDir(): Promise<string> {
	return mkdtemp(path.join(tmpdir(), "kilocode-self-healing-"))
}

describe("selfHealing", () => {
	let tempDir: string

	beforeEach(async () => {
		tempDir = await makeTempDir()
	})

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true })
	})

	describe("calculatePercentChange", () => {
		it("calculates positive change", () => {
			expect(calculatePercentChange(100, 150)).toBe(50)
		})

		it("calculates negative change", () => {
			expect(calculatePercentChange(100, 80)).toBe(-20)
		})

		it("handles zero before value", () => {
			expect(calculatePercentChange(0, 100)).toBe(100)
			expect(calculatePercentChange(0, 0)).toBe(0)
		})

		it("calculates no change", () => {
			expect(calculatePercentChange(100, 100)).toBe(0)
		})
	})

	describe("detectDegradation", () => {
		const baseMetrics: PerformanceMetrics = {
			successRate: 0.9,
			averageCost: 20,
			averageDurationMs: 5000,
			taskCount: 100,
			timestamp: new Date().toISOString(),
		}

		it("detects success rate degradation", () => {
			const afterMetrics: PerformanceMetrics = {
				...baseMetrics,
				successRate: 0.7, // 20 percentage point drop
			}

			const result = detectDegradation(baseMetrics, afterMetrics)

			expect(result.degraded).toBe(true)
			expect(result.degradedMetrics).toHaveLength(1)
			expect(result.degradedMetrics[0].name).toBe("successRate")
			expect(result.recommendation).toBe("rollback")
		})

		it("detects cost increase", () => {
			const afterMetrics: PerformanceMetrics = {
				...baseMetrics,
				averageCost: 30, // 50% increase
			}

			const result = detectDegradation(baseMetrics, afterMetrics)

			expect(result.degraded).toBe(true)
			expect(result.degradedMetrics.some((m) => m.name === "averageCost")).toBe(true)
		})

		it("detects duration increase", () => {
			const afterMetrics: PerformanceMetrics = {
				...baseMetrics,
				averageDurationMs: 10000, // 100% increase
			}

			const result = detectDegradation(baseMetrics, afterMetrics)

			expect(result.degraded).toBe(true)
			expect(result.degradedMetrics.some((m) => m.name === "averageDurationMs")).toBe(true)
		})

		it("reports no degradation for small changes", () => {
			const afterMetrics: PerformanceMetrics = {
				...baseMetrics,
				successRate: 0.88, // Only 2 percentage point drop
				averageCost: 21, // Only 5% increase
				averageDurationMs: 5500, // Only 10% increase
			}

			const result = detectDegradation(baseMetrics, afterMetrics)

			expect(result.degraded).toBe(false)
			expect(result.recommendation).toBe("ignore")
		})

		it("calculates severity correctly", () => {
			const afterMetrics: PerformanceMetrics = {
				...baseMetrics,
				successRate: 0.5, // 40 percentage point drop - very severe
				averageCost: 40, // 100% increase
			}

			const result = detectDegradation(baseMetrics, afterMetrics)

			expect(result.severity).toBeGreaterThan(50)
			expect(result.recommendation).toBe("rollback")
		})

		it("recommends monitor for minor degradation", () => {
			const afterMetrics: PerformanceMetrics = {
				...baseMetrics,
				successRate: 0.82, // 8 percentage point drop - just over 10% threshold, severity = 8*5 = 40
			}

			const result = detectDegradation(baseMetrics, afterMetrics, {
				successRateDropPercent: 5, // Lower threshold to trigger degradation
				costIncreasePercent: 30,
				durationIncreasePercent: 50,
			})

			expect(result.degraded).toBe(true)
			expect(result.severity).toBeLessThan(50)
			expect(result.recommendation).toBe("monitor")
		})

		it("uses custom thresholds", () => {
			const afterMetrics: PerformanceMetrics = {
				...baseMetrics,
				successRate: 0.82, // 8 percentage point drop
			}

			// With strict threshold (5%), this should be degradation
			const resultStrict = detectDegradation(baseMetrics, afterMetrics, {
				successRateDropPercent: 5,
				costIncreasePercent: 30,
				durationIncreasePercent: 50,
			})

			expect(resultStrict.degraded).toBe(true)

			// With lenient threshold (15%), this should not be degradation
			const resultLenient = detectDegradation(baseMetrics, afterMetrics, {
				successRateDropPercent: 15,
				costIncreasePercent: 30,
				durationIncreasePercent: 50,
			})

			expect(resultLenient.degraded).toBe(false)
		})
	})

	describe("checkRollbackRateLimit", () => {
		it("allows first rollback", () => {
			const result = checkRollbackRateLimit(DEFAULT_ROLLBACK_RATE_LIMIT_STATE, DEFAULT_SELF_HEALING_CONFIG)

			expect(result.allowed).toBe(true)
		})

		it("blocks when daily limit reached", () => {
			const now = new Date("2024-01-15T12:00:00Z")
			const state: RollbackRateLimitState = {
				dailyRollbackCount: 3,
				dailyRollbackDate: "2024-01-15",
				lastRollbackTimestamp: now.getTime() - 1000,
			}

			const result = checkRollbackRateLimit(state, DEFAULT_SELF_HEALING_CONFIG, now)

			expect(result.allowed).toBe(false)
			expect(result.reason).toContain("Daily rollback limit")
		})

		it("resets count on new day", () => {
			const now = new Date("2024-01-16T12:00:00Z")
			const state: RollbackRateLimitState = {
				dailyRollbackCount: 3,
				dailyRollbackDate: "2024-01-15", // Yesterday
				lastRollbackTimestamp: new Date("2024-01-15T12:00:00Z").getTime(),
			}

			const result = checkRollbackRateLimit(state, DEFAULT_SELF_HEALING_CONFIG, now)

			expect(result.allowed).toBe(true)
		})
	})

	describe("updateRollbackRateLimitState", () => {
		it("increments count on same day", () => {
			const now = new Date("2024-01-15T12:00:00Z")
			const state: RollbackRateLimitState = {
				dailyRollbackCount: 1,
				dailyRollbackDate: "2024-01-15",
				lastRollbackTimestamp: now.getTime() - 3600000,
			}

			const newState = updateRollbackRateLimitState(state, now)

			expect(newState.dailyRollbackCount).toBe(2)
			expect(newState.dailyRollbackDate).toBe("2024-01-15")
		})

		it("resets count on new day", () => {
			const now = new Date("2024-01-16T12:00:00Z")
			const state: RollbackRateLimitState = {
				dailyRollbackCount: 3,
				dailyRollbackDate: "2024-01-15",
				lastRollbackTimestamp: new Date("2024-01-15T23:00:00Z").getTime(),
			}

			const newState = updateRollbackRateLimitState(state, now)

			expect(newState.dailyRollbackCount).toBe(1)
			expect(newState.dailyRollbackDate).toBe("2024-01-16")
		})
	})

	describe("SelfHealingManager", () => {
		let manager: SelfHealingManager

		beforeEach(async () => {
			manager = new SelfHealingManager(tempDir)
			await manager.initialize()
		})

		it("initializes with empty state", () => {
			expect(manager.getApplications()).toHaveLength(0)
			expect(manager.getRollbackLog()).toHaveLength(0)
		})

		it("records application with backup", async () => {
			// Create a file to backup
			await writeFile(path.join(tempDir, "test-file.txt"), "original content")

			const beforeMetrics: PerformanceMetrics = {
				successRate: 0.9,
				averageCost: 20,
				averageDurationMs: 5000,
				taskCount: 50,
				timestamp: new Date().toISOString(),
			}

			const application = await manager.recordApplication(
				"proposal-123",
				"path/to/proposal",
				["test-file.txt"],
				beforeMetrics,
			)

			expect(application.id).toBeDefined()
			expect(application.proposalId).toBe("proposal-123")
			expect(application.status).toBe("monitoring")
			expect(application.backupPaths["test-file.txt"]).toBeDefined()

			// Verify backup was created
			const backupContent = await readFile(application.backupPaths["test-file.txt"], "utf8")
			expect(backupContent).toBe("original content")

			// Verify application is stored
			expect(manager.getApplications()).toHaveLength(1)
		})

		it("updates metrics", async () => {
			const beforeMetrics: PerformanceMetrics = {
				successRate: 0.9,
				averageCost: 20,
				averageDurationMs: 5000,
				taskCount: 50,
				timestamp: new Date().toISOString(),
			}

			const application = await manager.recordApplication("proposal-1", "path", [], beforeMetrics)

			const afterMetrics: PerformanceMetrics = {
				successRate: 0.85,
				averageCost: 22,
				averageDurationMs: 5500,
				taskCount: 60,
				timestamp: new Date().toISOString(),
			}

			await manager.updateMetrics(application.id, afterMetrics)

			const apps = manager.getApplications()
			expect(apps[0].afterMetrics).toEqual(afterMetrics)
		})

		it("evaluates application for degradation", async () => {
			const beforeMetrics: PerformanceMetrics = {
				successRate: 0.9,
				averageCost: 20,
				averageDurationMs: 5000,
				taskCount: 50,
				timestamp: new Date().toISOString(),
			}

			const application = await manager.recordApplication("proposal-1", "path", [], beforeMetrics)

			// Update with degraded metrics
			const afterMetrics: PerformanceMetrics = {
				successRate: 0.6, // Significant drop
				averageCost: 40, // Significant increase
				averageDurationMs: 10000,
				taskCount: 10, // More than minTasksForEvaluation
				timestamp: new Date().toISOString(),
			}

			await manager.updateMetrics(application.id, afterMetrics)

			const result = await manager.evaluateApplication(application.id)

			expect(result).not.toBeNull()
			expect(result?.degraded).toBe(true)
			expect(result?.recommendation).toBe("rollback")
		})

		it("returns null evaluation for insufficient data", async () => {
			const beforeMetrics: PerformanceMetrics = {
				successRate: 0.9,
				averageCost: 20,
				averageDurationMs: 5000,
				taskCount: 50,
				timestamp: new Date().toISOString(),
			}

			const application = await manager.recordApplication("proposal-1", "path", [], beforeMetrics)

			// Update with too few tasks
			const afterMetrics: PerformanceMetrics = {
				successRate: 0.6,
				averageCost: 40,
				averageDurationMs: 10000,
				taskCount: 2, // Less than minTasksForEvaluation
				timestamp: new Date().toISOString(),
			}

			await manager.updateMetrics(application.id, afterMetrics)

			const result = await manager.evaluateApplication(application.id)

			expect(result).toBeNull()
		})

		it("performs rollback and restores files", async () => {
			// Create original file
			await writeFile(path.join(tempDir, "rollback-test.txt"), "original content")

			const beforeMetrics: PerformanceMetrics = {
				successRate: 0.9,
				averageCost: 20,
				averageDurationMs: 5000,
				taskCount: 50,
				timestamp: new Date().toISOString(),
			}

			const application = await manager.recordApplication(
				"proposal-1",
				"path",
				["rollback-test.txt"],
				beforeMetrics,
			)

			// Modify the file
			await writeFile(path.join(tempDir, "rollback-test.txt"), "modified content")

			// Perform rollback
			const rollbackAction = await manager.rollback(application.id, "Testing rollback", false, "test")

			expect(rollbackAction.result).toBe("success")
			expect(rollbackAction.restoredFiles).toContain("rollback-test.txt")

			// Verify file was restored
			const restoredContent = await readFile(path.join(tempDir, "rollback-test.txt"), "utf8")
			expect(restoredContent).toBe("original content")

			// Verify application status
			const apps = manager.getApplications()
			expect(apps[0].status).toBe("rolled-back")
			expect(apps[0].rolledBack).toBe(true)

			// Verify rollback log
			expect(manager.getRollbackLog()).toHaveLength(1)
		})

		it("throws when rolling back nonexistent application", async () => {
			await expect(manager.rollback("nonexistent", "reason")).rejects.toThrow("Application not found")
		})

		it("throws when rolling back already rolled back application", async () => {
			const beforeMetrics: PerformanceMetrics = {
				successRate: 0.9,
				averageCost: 20,
				averageDurationMs: 5000,
				taskCount: 50,
				timestamp: new Date().toISOString(),
			}

			const application = await manager.recordApplication("proposal-1", "path", [], beforeMetrics)
			await manager.rollback(application.id, "first rollback", false, "test")

			await expect(manager.rollback(application.id, "second rollback")).rejects.toThrow(
				"Application already rolled back",
			)
		})

		it("respects rate limits for automatic rollbacks", async () => {
			// Create multiple applications with files to backup
			const beforeMetrics: PerformanceMetrics = {
				successRate: 0.9,
				averageCost: 20,
				averageDurationMs: 5000,
				taskCount: 50,
				timestamp: new Date().toISOString(),
			}

			const apps = []
			for (let i = 0; i < 5; i++) {
				// Create a file for each application
				const filename = `rate-limit-test-${i}.txt`
				await writeFile(path.join(tempDir, filename), `content ${i}`)
				const app = await manager.recordApplication(`proposal-${i}`, "path", [filename], beforeMetrics)
				apps.push(app)
			}

			// Perform automatic rollbacks up to limit
			for (let i = 0; i < 3; i++) {
				await manager.rollback(apps[i].id, "test", true, "auto-heal")
			}

			// Next automatic rollback should be rate limited
			await expect(manager.rollback(apps[3].id, "test", true, "auto-heal")).rejects.toThrow("rate limited")

			// Manual rollback should still work
			const manualRollback = await manager.rollback(apps[3].id, "test", false, "manual")
			expect(manualRollback.result).toBe("success")
		})

		it("persists state across instances", async () => {
			const beforeMetrics: PerformanceMetrics = {
				successRate: 0.9,
				averageCost: 20,
				averageDurationMs: 5000,
				taskCount: 50,
				timestamp: new Date().toISOString(),
			}

			await manager.recordApplication("proposal-persist", "path", [], beforeMetrics)

			// Create new manager instance
			const newManager = new SelfHealingManager(tempDir)
			await newManager.initialize()

			const apps = newManager.getApplications()
			expect(apps).toHaveLength(1)
			expect(apps[0].proposalId).toBe("proposal-persist")
		})
	})

	describe("createSelfHealingManager", () => {
		it("creates and initializes manager", async () => {
			const manager = await createSelfHealingManager(tempDir)

			expect(manager).toBeInstanceOf(SelfHealingManager)
			expect(manager.getConfig().enabled).toBe(true)
		})

		it("accepts custom config", async () => {
			const customConfig = {
				...DEFAULT_SELF_HEALING_CONFIG,
				maxDailyRollbacks: 10,
			}

			const manager = await createSelfHealingManager(tempDir, customConfig)

			expect(manager.getConfig().maxDailyRollbacks).toBe(10)
		})
	})
})
