/**
 * Tests for Evolution Layer Mode Detection
 */

import { mkdir, writeFile, rm } from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "node:os"
import { mkdtemp } from "node:fs/promises"

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import YAML from "yaml"

import type { CouncilConfig } from "@roo-code/types"

import {
	createModeDetectionNudge,
	detectModes,
	evaluateModeDetectionTrigger,
	extractCouncilRoles,
	generateModeSuggestions,
	loadCouncilConfig,
	loadModes,
	normalizeSlugToRole,
	parseCouncilConfig,
	parseKilocodemodes,
	type KilocodemodesFile,
	type ModeDefinition,
} from "./modeDetection"

async function makeTempDir(): Promise<string> {
	return mkdtemp(path.join(tmpdir(), "kilocode-mode-detection-"))
}

describe("modeDetection", () => {
	let tempDir: string

	beforeEach(async () => {
		tempDir = await makeTempDir()
	})

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true })
	})

	describe("parseKilocodemodes", () => {
		it("parses valid .kilocodemodes JSON", () => {
			const content = JSON.stringify({
				customModes: [
					{
						slug: "test-mode",
						name: "Test Mode",
						roleDefinition: "A test mode",
						groups: ["read"],
					},
				],
			})

			const result = parseKilocodemodes(content)

			expect(result.customModes).toHaveLength(1)
			expect(result.customModes[0].slug).toBe("test-mode")
			expect(result.customModes[0].name).toBe("Test Mode")
		})

		it("handles multiple modes", () => {
			const content = JSON.stringify({
				customModes: [
					{ slug: "mode-1", name: "Mode 1", roleDefinition: "First", groups: [] },
					{ slug: "mode-2", name: "Mode 2", roleDefinition: "Second", groups: [] },
				],
			})

			const result = parseKilocodemodes(content)

			expect(result.customModes).toHaveLength(2)
		})

		it("throws on invalid JSON", () => {
			expect(() => parseKilocodemodes("not json")).toThrow()
		})

		it("throws on missing customModes array", () => {
			expect(() => parseKilocodemodes(JSON.stringify({ other: "data" }))).toThrow("missing customModes array")
		})

		it("throws on mode missing slug", () => {
			const content = JSON.stringify({
				customModes: [{ name: "No Slug" }],
			})

			expect(() => parseKilocodemodes(content)).toThrow("mode missing slug")
		})

		it("throws on mode missing name", () => {
			const content = JSON.stringify({
				customModes: [{ slug: "no-name" }],
			})

			expect(() => parseKilocodemodes(content)).toThrow("mode missing name")
		})
	})

	describe("parseCouncilConfig", () => {
		it("parses valid council.yaml", () => {
			const content = YAML.stringify({
				version: 1,
				councilId: "test-council",
				roles: {
					governance: { profile: "default", promptPath: "test.md" },
				},
			})

			const result = parseCouncilConfig(content)

			expect(result.version).toBe(1)
			expect(result.roles.governance).toBeDefined()
		})

		it("throws on invalid YAML", () => {
			expect(() => parseCouncilConfig("invalid: yaml: content:")).toThrow()
		})
	})

	describe("extractCouncilRoles", () => {
		it("extracts role names from council config", () => {
			const config: CouncilConfig = {
				version: 1,
				roles: {
					governance: { profile: "default", promptPath: "gov.md" },
					quality: { profile: "default", promptPath: "qual.md" },
				},
			}

			const roles = extractCouncilRoles(config)

			expect(roles).toEqual(["governance", "quality"])
		})

		it("returns empty array for missing roles", () => {
			const config = { version: 1 } as CouncilConfig

			expect(extractCouncilRoles(config)).toEqual([])
		})

		it("returns sorted roles", () => {
			const config: CouncilConfig = {
				version: 1,
				roles: {
					zebra: { profile: "default", promptPath: "z.md" },
					alpha: { profile: "default", promptPath: "a.md" },
					middle: { profile: "default", promptPath: "m.md" },
				},
			}

			const roles = extractCouncilRoles(config)

			expect(roles).toEqual(["alpha", "middle", "zebra"])
		})
	})

	describe("normalizeSlugToRole", () => {
		it("converts to lowercase", () => {
			expect(normalizeSlugToRole("TestMode")).toBe("testmode")
		})

		it("replaces invalid characters with hyphens", () => {
			expect(normalizeSlugToRole("test_mode")).toBe("test-mode")
			expect(normalizeSlugToRole("test mode")).toBe("test-mode")
		})

		it("removes leading and trailing hyphens", () => {
			expect(normalizeSlugToRole("-test-")).toBe("test")
		})

		it("collapses multiple hyphens", () => {
			expect(normalizeSlugToRole("test--mode")).toBe("test-mode")
		})

		it("handles already normalized slugs", () => {
			expect(normalizeSlugToRole("test-mode")).toBe("test-mode")
		})
	})

	describe("loadModes", () => {
		it("loads modes from .kilocodemodes file", async () => {
			const modesContent: KilocodemodesFile = {
				customModes: [{ slug: "test", name: "Test", roleDefinition: "Testing", groups: [] }],
			}
			await writeFile(path.join(tempDir, ".kilocodemodes"), JSON.stringify(modesContent))

			const modes = await loadModes(tempDir)

			expect(modes).toHaveLength(1)
			expect(modes[0].slug).toBe("test")
		})

		it("returns empty array if file doesn't exist", async () => {
			const modes = await loadModes(tempDir)

			expect(modes).toEqual([])
		})

		it("supports custom file path", async () => {
			const customPath = "config/modes.json"
			await mkdir(path.join(tempDir, "config"), { recursive: true })
			await writeFile(
				path.join(tempDir, customPath),
				JSON.stringify({ customModes: [{ slug: "custom", name: "Custom", roleDefinition: "", groups: [] }] }),
			)

			const modes = await loadModes(tempDir, customPath)

			expect(modes).toHaveLength(1)
			expect(modes[0].slug).toBe("custom")
		})
	})

	describe("loadCouncilConfig", () => {
		it("loads council config from council.yaml", async () => {
			const configPath = path.join(tempDir, ".kilocode", "evolution")
			await mkdir(configPath, { recursive: true })
			await writeFile(
				path.join(configPath, "council.yaml"),
				YAML.stringify({
					version: 1,
					roles: { test: { profile: "default", promptPath: "test.md" } },
				}),
			)

			const config = await loadCouncilConfig(tempDir)

			expect(config).not.toBeNull()
			expect(config?.roles.test).toBeDefined()
		})

		it("returns null if file doesn't exist", async () => {
			const config = await loadCouncilConfig(tempDir)

			expect(config).toBeNull()
		})
	})

	describe("detectModes", () => {
		it("detects modes not in council config", async () => {
			// Create .kilocodemodes with 2 modes
			await writeFile(
				path.join(tempDir, ".kilocodemodes"),
				JSON.stringify({
					customModes: [
						{ slug: "tracked", name: "Tracked", roleDefinition: "", groups: [] },
						{ slug: "untracked", name: "Untracked", roleDefinition: "", groups: [] },
					],
				}),
			)

			// Create council.yaml with only 1 role
			const configPath = path.join(tempDir, ".kilocode", "evolution")
			await mkdir(configPath, { recursive: true })
			await writeFile(
				path.join(configPath, "council.yaml"),
				YAML.stringify({
					version: 1,
					roles: { tracked: { profile: "default", promptPath: "tracked.md" } },
				}),
			)

			const result = await detectModes(tempDir)

			expect(result.allModes).toHaveLength(2)
			expect(result.trackedModes).toEqual(["tracked"])
			expect(result.untrackedModes).toHaveLength(1)
			expect(result.untrackedModes[0].slug).toBe("untracked")
			expect(result.hasDrift).toBe(true)
		})

		it("detects orphaned council roles", async () => {
			// Create .kilocodemodes with 1 mode
			await writeFile(
				path.join(tempDir, ".kilocodemodes"),
				JSON.stringify({
					customModes: [{ slug: "active", name: "Active", roleDefinition: "", groups: [] }],
				}),
			)

			// Create council.yaml with 2 roles (one orphaned)
			const configPath = path.join(tempDir, ".kilocode", "evolution")
			await mkdir(configPath, { recursive: true })
			await writeFile(
				path.join(configPath, "council.yaml"),
				YAML.stringify({
					version: 1,
					roles: {
						active: { profile: "default", promptPath: "active.md" },
						orphaned: { profile: "default", promptPath: "orphaned.md" },
					},
				}),
			)

			const result = await detectModes(tempDir)

			expect(result.orphanedRoles).toEqual(["orphaned"])
			expect(result.hasDrift).toBe(true)
		})

		it("reports no drift when all modes are tracked", async () => {
			// Create matching modes and roles
			await writeFile(
				path.join(tempDir, ".kilocodemodes"),
				JSON.stringify({
					customModes: [{ slug: "test", name: "Test", roleDefinition: "", groups: [] }],
				}),
			)

			const configPath = path.join(tempDir, ".kilocode", "evolution")
			await mkdir(configPath, { recursive: true })
			await writeFile(
				path.join(configPath, "council.yaml"),
				YAML.stringify({
					version: 1,
					roles: { test: { profile: "default", promptPath: "test.md" } },
				}),
			)

			const result = await detectModes(tempDir)

			expect(result.hasDrift).toBe(false)
			expect(result.untrackedModes).toHaveLength(0)
			expect(result.orphanedRoles).toHaveLength(0)
		})

		it("handles missing .kilocodemodes file", async () => {
			const configPath = path.join(tempDir, ".kilocode", "evolution")
			await mkdir(configPath, { recursive: true })
			await writeFile(
				path.join(configPath, "council.yaml"),
				YAML.stringify({
					version: 1,
					roles: { test: { profile: "default", promptPath: "test.md" } },
				}),
			)

			const result = await detectModes(tempDir)

			expect(result.allModes).toHaveLength(0)
			expect(result.orphanedRoles).toEqual(["test"])
		})

		it("handles missing council.yaml file", async () => {
			await writeFile(
				path.join(tempDir, ".kilocodemodes"),
				JSON.stringify({
					customModes: [{ slug: "test", name: "Test", roleDefinition: "", groups: [] }],
				}),
			)

			const result = await detectModes(tempDir)

			expect(result.allModes).toHaveLength(1)
			expect(result.untrackedModes).toHaveLength(1)
			expect(result.trackedModes).toHaveLength(0)
		})
	})

	describe("generateModeSuggestions", () => {
		it("generates suggestions for untracked modes", () => {
			const untrackedModes: ModeDefinition[] = [
				{ slug: "new-mode", name: "New Mode", roleDefinition: "A new mode", groups: [] },
			]

			const suggestions = generateModeSuggestions(untrackedModes)

			expect(suggestions).toHaveLength(1)
			expect(suggestions[0].slug).toBe("new-mode")
			expect(suggestions[0].suggestedRole).toBe("new-mode")
			expect(suggestions[0].suggestedProfile).toBe("default")
		})

		it("uses custom default profile", () => {
			const untrackedModes: ModeDefinition[] = [{ slug: "test", name: "Test", roleDefinition: "", groups: [] }]

			const suggestions = generateModeSuggestions(untrackedModes, "custom-profile")

			expect(suggestions[0].suggestedProfile).toBe("custom-profile")
		})

		it("normalizes slugs to valid roles", () => {
			const untrackedModes: ModeDefinition[] = [
				{ slug: "Test_Mode", name: "Test Mode", roleDefinition: "", groups: [] },
			]

			const suggestions = generateModeSuggestions(untrackedModes)

			expect(suggestions[0].suggestedRole).toBe("test-mode")
		})
	})

	describe("createModeDetectionNudge", () => {
		it("returns null when no drift", () => {
			const result = {
				allModes: [],
				trackedModes: [],
				untrackedModes: [],
				orphanedRoles: [],
				hasDrift: false,
				summary: "No drift",
			}

			expect(createModeDetectionNudge(result)).toBeNull()
		})

		it("creates nudge message for untracked modes", () => {
			const result = {
				allModes: [],
				trackedModes: [],
				untrackedModes: [{ slug: "new-mode", name: "New Mode", roleDefinition: "", groups: [] }],
				orphanedRoles: [],
				hasDrift: true,
				summary: "1 untracked",
			}

			const nudge = createModeDetectionNudge(result)

			expect(nudge).toContain("1 mode(s) not tracked")
			expect(nudge).toContain("New Mode")
			expect(nudge).toContain("Sync Evolution Mode Map")
		})

		it("creates nudge message for orphaned roles", () => {
			const result = {
				allModes: [],
				trackedModes: [],
				untrackedModes: [],
				orphanedRoles: ["old-role"],
				hasDrift: true,
				summary: "1 orphaned",
			}

			const nudge = createModeDetectionNudge(result)

			expect(nudge).toContain("1 council role(s) without corresponding modes")
			expect(nudge).toContain("old-role")
		})

		it("limits modes shown based on maxModesToList", () => {
			const untrackedModes = Array.from({ length: 10 }, (_, i) => ({
				slug: `mode-${i}`,
				name: `Mode ${i}`,
				roleDefinition: "",
				groups: [] as unknown[],
			}))

			const result = {
				allModes: untrackedModes,
				trackedModes: [],
				untrackedModes,
				orphanedRoles: [],
				hasDrift: true,
				summary: "10 untracked",
			}

			const nudge = createModeDetectionNudge(result, { maxModesToList: 3 })

			expect(nudge).toContain("Mode 0")
			expect(nudge).toContain("Mode 1")
			expect(nudge).toContain("Mode 2")
			expect(nudge).toContain("... and 7 more")
			expect(nudge).not.toContain("Mode 3")
		})

		it("excludes actions when includeActions is false", () => {
			const result = {
				allModes: [],
				trackedModes: [],
				untrackedModes: [{ slug: "test", name: "Test", roleDefinition: "", groups: [] }],
				orphanedRoles: [],
				hasDrift: true,
				summary: "1 untracked",
			}

			const nudge = createModeDetectionNudge(result, { includeActions: false })

			expect(nudge).not.toContain("Sync Evolution Mode Map")
		})
	})

	describe("evaluateModeDetectionTrigger", () => {
		it("triggers when untracked modes exceed minimum", () => {
			const result = {
				allModes: [],
				trackedModes: [],
				untrackedModes: [
					{ slug: "mode-1", name: "Mode 1", roleDefinition: "", groups: [] },
					{ slug: "mode-2", name: "Mode 2", roleDefinition: "", groups: [] },
				],
				orphanedRoles: [],
				hasDrift: true,
				summary: "2 untracked",
			}

			const trigger = evaluateModeDetectionTrigger(result, { minUntrackedModes: 2 })

			expect(trigger.shouldTrigger).toBe(true)
			expect(trigger.suggestedAction).toBe("sync-mode-map")
			expect(trigger.triggeringModes).toHaveLength(2)
		})

		it("does not trigger when untracked modes below minimum", () => {
			const result = {
				allModes: [],
				trackedModes: [],
				untrackedModes: [{ slug: "mode-1", name: "Mode 1", roleDefinition: "", groups: [] }],
				orphanedRoles: [],
				hasDrift: true,
				summary: "1 untracked",
			}

			const trigger = evaluateModeDetectionTrigger(result, { minUntrackedModes: 2 })

			expect(trigger.shouldTrigger).toBe(false)
		})

		it("triggers on orphaned roles when enabled", () => {
			const result = {
				allModes: [],
				trackedModes: [],
				untrackedModes: [],
				orphanedRoles: ["old-role"],
				hasDrift: true,
				summary: "1 orphaned",
			}

			const trigger = evaluateModeDetectionTrigger(result, { triggerOnOrphanedRoles: true })

			expect(trigger.shouldTrigger).toBe(true)
			expect(trigger.suggestedAction).toBe("review")
		})

		it("does not trigger on orphaned roles when disabled (default)", () => {
			const result = {
				allModes: [],
				trackedModes: [],
				untrackedModes: [],
				orphanedRoles: ["old-role"],
				hasDrift: true,
				summary: "1 orphaned",
			}

			const trigger = evaluateModeDetectionTrigger(result)

			expect(trigger.shouldTrigger).toBe(false)
		})

		it("returns no trigger when no drift", () => {
			const result = {
				allModes: [],
				trackedModes: [],
				untrackedModes: [],
				orphanedRoles: [],
				hasDrift: false,
				summary: "No drift",
			}

			const trigger = evaluateModeDetectionTrigger(result)

			expect(trigger.shouldTrigger).toBe(false)
			expect(trigger.reason).toBe("No mode drift detected")
		})
	})
})
