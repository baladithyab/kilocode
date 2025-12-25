/**
 * Darwin Configuration Loader and Validator
 *
 * Provides utilities for loading, validating, and accessing Darwin evolution
 * system configuration from the global state.
 */

import { type DarwinConfig as DarwinConfigType, darwinConfigSchema, DEFAULT_DARWIN_CONFIG } from "@roo-code/types"

/**
 * Result of configuration validation
 */
export interface ValidationResult {
	valid: boolean
	errors: string[]
	config: DarwinConfigType
}

/**
 * DarwinConfig class for managing evolution system configuration
 *
 * Provides a typed interface for accessing and validating Darwin configuration,
 * with fallback to defaults for missing or invalid values.
 */
export class DarwinConfig {
	private config: DarwinConfigType

	constructor(rawConfig?: Partial<DarwinConfigType> | null) {
		this.config = this.normalizeConfig(rawConfig)
	}

	/**
	 * Normalize and validate config, applying defaults for missing values
	 */
	private normalizeConfig(rawConfig?: Partial<DarwinConfigType> | null): DarwinConfigType {
		if (!rawConfig) {
			return { ...DEFAULT_DARWIN_CONFIG }
		}

		// Merge with defaults and validate
		const merged = {
			...DEFAULT_DARWIN_CONFIG,
			...rawConfig,
		}

		// Validate and coerce values
		const result = darwinConfigSchema.safeParse(merged)
		if (result.success) {
			return result.data
		}

		// If validation fails, log warning and return defaults
		console.warn("[DarwinConfig] Invalid configuration, using defaults:", result.error.issues)
		return { ...DEFAULT_DARWIN_CONFIG }
	}

	/**
	 * Check if Darwin evolution system is enabled
	 */
	get enabled(): boolean {
		return this.config.enabled
	}

	/**
	 * Get the autonomy level (0=Manual, 1=Assisted, 2=Auto)
	 */
	get autonomyLevel(): 0 | 1 | 2 {
		return this.config.autonomyLevel
	}

	/**
	 * Check if trace capture is enabled
	 */
	get traceCaptureEnabled(): boolean {
		return this.config.traceCapture
	}

	/**
	 * Get the doom loop detection threshold
	 */
	get doomLoopThreshold(): number {
		return this.config.doomLoopThreshold
	}

	/**
	 * Check if skill synthesis is enabled
	 */
	get skillSynthesisEnabled(): boolean {
		return this.config.skillSynthesis
	}

	/**
	 * Check if configuration evolution is enabled
	 */
	get configEvolutionEnabled(): boolean {
		return this.config.configEvolution
	}

	/**
	 * Check if council review system is enabled
	 */
	get councilEnabled(): boolean {
		return this.config.councilEnabled
	}

	/**
	 * Get the raw configuration object
	 */
	get raw(): DarwinConfigType {
		return { ...this.config }
	}

	/**
	 * Check if a specific feature is enabled based on current config
	 */
	isFeatureEnabled(feature: "trace" | "skills" | "config" | "council"): boolean {
		if (!this.enabled) {
			return false
		}

		switch (feature) {
			case "trace":
				return this.traceCaptureEnabled
			case "skills":
				return this.skillSynthesisEnabled
			case "config":
				return this.configEvolutionEnabled
			case "council":
				return this.councilEnabled
			default:
				return false
		}
	}

	/**
	 * Check if auto-apply is allowed for a given risk level
	 */
	canAutoApply(riskLevel: "low" | "medium" | "high"): boolean {
		if (!this.enabled) {
			return false
		}

		switch (this.autonomyLevel) {
			case 0: // Manual - never auto-apply
				return false
			case 1: // Assisted - only low risk
				return riskLevel === "low"
			case 2: // Auto - all risks
				return true
			default:
				return false
		}
	}

	/**
	 * Update configuration with new values
	 * Returns a new DarwinConfig instance
	 */
	update(updates: Partial<DarwinConfigType>): DarwinConfig {
		return new DarwinConfig({
			...this.config,
			...updates,
		})
	}
}

/**
 * Factory function to create a DarwinConfig from raw settings
 */
export function getDarwinConfig(settings?: { darwin?: Partial<DarwinConfigType> | null }): DarwinConfig {
	return new DarwinConfig(settings?.darwin)
}

/**
 * Validate a Darwin configuration object
 * Returns validation result with errors and normalized config
 */
export function validateDarwinConfig(config: unknown): ValidationResult {
	const result = darwinConfigSchema.safeParse(config)

	if (result.success) {
		return {
			valid: true,
			errors: [],
			config: result.data,
		}
	}

	return {
		valid: false,
		errors: result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
		config: DEFAULT_DARWIN_CONFIG,
	}
}
