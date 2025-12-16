/**
 * Evolution Layer Mode Detection
 *
 * This module provides automatic detection of new modes in .kilocodemodes
 * and compares them with modes configured in the Evolution Layer council.yaml.
 * It identifies new modes that aren't tracked and suggests additions.
 *
 * @module
 */

import { readFile } from "node:fs/promises"
import * as path from "node:path"

import YAML from "yaml"

import type { CouncilConfig } from "@roo-code/types"

import { fileExists } from "./fs"

/**
 * Represents a mode definition from .kilocodemodes file
 */
export interface ModeDefinition {
	/** Unique slug identifier for the mode */
	slug: string
	/** Human-readable name */
	name: string
	/** Role definition describing the mode's purpose */
	roleDefinition: string
	/** Tool groups available to this mode */
	groups: unknown[]
	/** Custom instructions for the mode */
	customInstructions?: string
}

/**
 * Structure of the .kilocodemodes file
 */
export interface KilocodemodesFile {
	customModes: ModeDefinition[]
}

/**
 * Result of mode detection analysis
 */
export interface ModeDetectionResult {
	/** All modes found in .kilocodemodes */
	allModes: ModeDefinition[]
	/** Modes that exist in council.yaml */
	trackedModes: string[]
	/** Modes that are NOT in council.yaml */
	untrackedModes: ModeDefinition[]
	/** Modes in council.yaml that don't exist in .kilocodemodes */
	orphanedRoles: string[]
	/** Whether there are any differences to address */
	hasDrift: boolean
	/** Summary of the detection */
	summary: string
}

/**
 * Suggestion for adding a new mode to council configuration
 */
export interface ModeSuggestion {
	/** The mode slug */
	slug: string
	/** The mode name */
	name: string
	/** Suggested council role name (derived from slug) */
	suggestedRole: string
	/** Suggested profile name */
	suggestedProfile: string
	/** The original mode definition */
	mode: ModeDefinition
}

/**
 * Default paths for mode detection
 */
export const DEFAULT_KILOCODEMODES_PATH = ".kilocodemodes"
export const DEFAULT_COUNCIL_CONFIG_PATH = path.join(".kilocode", "evolution", "council.yaml")

/**
 * Parse the .kilocodemodes JSON file
 *
 * @param content - Raw JSON content
 * @returns Parsed kilocodemodes structure
 */
export function parseKilocodemodes(content: string): KilocodemodesFile {
	const parsed = JSON.parse(content)

	if (!parsed || typeof parsed !== "object") {
		throw new Error("Invalid .kilocodemodes format: expected object")
	}

	if (!Array.isArray(parsed.customModes)) {
		throw new Error("Invalid .kilocodemodes format: missing customModes array")
	}

	// Validate each mode has required fields
	for (const mode of parsed.customModes) {
		if (typeof mode.slug !== "string" || !mode.slug) {
			throw new Error("Invalid .kilocodemodes format: mode missing slug")
		}
		if (typeof mode.name !== "string" || !mode.name) {
			throw new Error("Invalid .kilocodemodes format: mode missing name")
		}
	}

	return parsed as KilocodemodesFile
}

/**
 * Parse council.yaml configuration
 *
 * @param content - Raw YAML content
 * @returns Parsed council configuration
 */
export function parseCouncilConfig(content: string): CouncilConfig {
	const doc = YAML.parse(content)

	if (!doc || typeof doc !== "object") {
		throw new Error("Invalid council.yaml format: expected object")
	}

	return doc as CouncilConfig
}

/**
 * Extract role names from council configuration
 *
 * @param config - Council configuration
 * @returns Array of role names
 */
export function extractCouncilRoles(config: CouncilConfig): string[] {
	if (!config.roles || typeof config.roles !== "object") {
		return []
	}

	return Object.keys(config.roles).sort((a, b) => a.localeCompare(b))
}

/**
 * Normalize a mode slug into a council role name
 *
 * Council roles use lowercase with hyphens, similar to mode slugs
 *
 * @param slug - Mode slug
 * @returns Normalized role name
 */
export function normalizeSlugToRole(slug: string): string {
	return slug
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9-]/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
}

/**
 * Load modes from .kilocodemodes file
 *
 * @param projectRoot - Project root directory
 * @param kilocodeModesPath - Path to .kilocodemodes file (relative to project root)
 * @returns Array of mode definitions, or empty array if file doesn't exist
 */
export async function loadModes(
	projectRoot: string,
	kilocodeModesPath: string = DEFAULT_KILOCODEMODES_PATH,
): Promise<ModeDefinition[]> {
	const absPath = path.resolve(projectRoot, kilocodeModesPath)

	if (!(await fileExists(absPath))) {
		return []
	}

	const content = await readFile(absPath, "utf8")
	const parsed = parseKilocodemodes(content)

	return parsed.customModes
}

/**
 * Load council configuration from council.yaml
 *
 * @param projectRoot - Project root directory
 * @param councilConfigPath - Path to council.yaml (relative to project root)
 * @returns Council configuration, or null if file doesn't exist
 */
export async function loadCouncilConfig(
	projectRoot: string,
	councilConfigPath: string = DEFAULT_COUNCIL_CONFIG_PATH,
): Promise<CouncilConfig | null> {
	const absPath = path.resolve(projectRoot, councilConfigPath)

	if (!(await fileExists(absPath))) {
		return null
	}

	const content = await readFile(absPath, "utf8")
	return parseCouncilConfig(content)
}

/**
 * Detect modes in .kilocodemodes that aren't tracked in council.yaml
 *
 * @param projectRoot - Project root directory
 * @param options - Detection options
 * @returns Mode detection result
 */
export async function detectModes(
	projectRoot: string,
	options: {
		kilocodeModesPath?: string
		councilConfigPath?: string
	} = {},
): Promise<ModeDetectionResult> {
	const { kilocodeModesPath = DEFAULT_KILOCODEMODES_PATH, councilConfigPath = DEFAULT_COUNCIL_CONFIG_PATH } = options

	const modes = await loadModes(projectRoot, kilocodeModesPath)
	const councilConfig = await loadCouncilConfig(projectRoot, councilConfigPath)

	const councilRoles = councilConfig ? extractCouncilRoles(councilConfig) : []
	const modeRoleMap = new Map<string, ModeDefinition>()

	// Build a map of normalized role names to modes
	for (const mode of modes) {
		const role = normalizeSlugToRole(mode.slug)
		modeRoleMap.set(role, mode)
	}

	// Find modes not tracked in council
	const untrackedModes: ModeDefinition[] = []
	const trackedModes: string[] = []

	for (const mode of modes) {
		const role = normalizeSlugToRole(mode.slug)
		if (councilRoles.includes(role)) {
			trackedModes.push(mode.slug)
		} else {
			untrackedModes.push(mode)
		}
	}

	// Find roles in council that don't correspond to any mode
	const orphanedRoles: string[] = []
	for (const role of councilRoles) {
		if (!modeRoleMap.has(role)) {
			orphanedRoles.push(role)
		}
	}

	const hasDrift = untrackedModes.length > 0 || orphanedRoles.length > 0

	// Build summary
	const summaryParts: string[] = []

	if (untrackedModes.length > 0) {
		summaryParts.push(`${untrackedModes.length} untracked mode(s): ${untrackedModes.map((m) => m.slug).join(", ")}`)
	}

	if (orphanedRoles.length > 0) {
		summaryParts.push(`${orphanedRoles.length} orphaned council role(s): ${orphanedRoles.join(", ")}`)
	}

	const summary =
		summaryParts.length > 0
			? summaryParts.join("; ")
			: `All ${modes.length} mode(s) are tracked in council configuration`

	return {
		allModes: modes,
		trackedModes,
		untrackedModes,
		orphanedRoles,
		hasDrift,
		summary,
	}
}

/**
 * Generate suggestions for adding untracked modes to council configuration
 *
 * @param untrackedModes - Modes not in council configuration
 * @param defaultProfile - Default profile name to suggest
 * @returns Array of suggestions
 */
export function generateModeSuggestions(
	untrackedModes: ModeDefinition[],
	defaultProfile: string = "default",
): ModeSuggestion[] {
	return untrackedModes.map((mode) => ({
		slug: mode.slug,
		name: mode.name,
		suggestedRole: normalizeSlugToRole(mode.slug),
		suggestedProfile: defaultProfile,
		mode,
	}))
}

/**
 * Options for creating a nudge message
 */
export interface NudgeOptions {
	/** Maximum number of modes to list in the message */
	maxModesToList?: number
	/** Whether to include action suggestions */
	includeActions?: boolean
}

/**
 * Create a nudge message for untracked modes
 *
 * @param result - Mode detection result
 * @param options - Nudge options
 * @returns Nudge message or null if no drift
 */
export function createModeDetectionNudge(result: ModeDetectionResult, options: NudgeOptions = {}): string | null {
	const { maxModesToList = 5, includeActions = true } = options

	if (!result.hasDrift) {
		return null
	}

	const lines: string[] = []

	if (result.untrackedModes.length > 0) {
		lines.push(`Found ${result.untrackedModes.length} mode(s) not tracked in Evolution Council:`)

		const modesToShow = result.untrackedModes.slice(0, maxModesToList)
		for (const mode of modesToShow) {
			lines.push(`  • ${mode.name} (${mode.slug})`)
		}

		if (result.untrackedModes.length > maxModesToList) {
			lines.push(`  ... and ${result.untrackedModes.length - maxModesToList} more`)
		}

		if (includeActions) {
			lines.push("")
			lines.push("Consider adding these modes to council.yaml for Evolution tracking.")
			lines.push('Run "Kilo Code: Sync Evolution Mode Map" to update council configuration.')
		}
	}

	if (result.orphanedRoles.length > 0) {
		if (lines.length > 0) {
			lines.push("")
		}

		lines.push(`Found ${result.orphanedRoles.length} council role(s) without corresponding modes:`)

		const rolesToShow = result.orphanedRoles.slice(0, maxModesToList)
		for (const role of rolesToShow) {
			lines.push(`  • ${role}`)
		}

		if (result.orphanedRoles.length > maxModesToList) {
			lines.push(`  ... and ${result.orphanedRoles.length - maxModesToList} more`)
		}

		if (includeActions) {
			lines.push("")
			lines.push("These roles may be obsolete or the corresponding modes were removed.")
		}
	}

	return lines.join("\n")
}

/**
 * Automation trigger result from mode detection
 */
export interface ModeDetectionTrigger {
	/** Whether automation should be triggered */
	shouldTrigger: boolean
	/** Reason for the trigger decision */
	reason: string
	/** The modes that triggered this (if any) */
	triggeringModes: ModeDefinition[]
	/** Suggested automation action */
	suggestedAction?: "sync-mode-map" | "create-council-roles" | "review"
}

/**
 * Evaluate whether mode detection should trigger automation
 *
 * @param result - Mode detection result
 * @param options - Evaluation options
 * @returns Trigger evaluation result
 */
export function evaluateModeDetectionTrigger(
	result: ModeDetectionResult,
	options: {
		/** Minimum number of untracked modes to trigger automation */
		minUntrackedModes?: number
		/** Whether orphaned roles should trigger automation */
		triggerOnOrphanedRoles?: boolean
	} = {},
): ModeDetectionTrigger {
	const { minUntrackedModes = 1, triggerOnOrphanedRoles = false } = options

	if (result.untrackedModes.length >= minUntrackedModes) {
		return {
			shouldTrigger: true,
			reason: `${result.untrackedModes.length} untracked mode(s) found`,
			triggeringModes: result.untrackedModes,
			suggestedAction: "sync-mode-map",
		}
	}

	if (triggerOnOrphanedRoles && result.orphanedRoles.length > 0) {
		return {
			shouldTrigger: true,
			reason: `${result.orphanedRoles.length} orphaned council role(s) found`,
			triggeringModes: [],
			suggestedAction: "review",
		}
	}

	return {
		shouldTrigger: false,
		reason: "No mode drift detected",
		triggeringModes: [],
	}
}

/**
 * Watch for mode changes and trigger detection
 *
 * This is a utility type for integrating with file watchers.
 * The actual watcher implementation should be in the VS Code layer.
 */
export type ModeChangeHandler = (result: ModeDetectionResult) => void | Promise<void>
