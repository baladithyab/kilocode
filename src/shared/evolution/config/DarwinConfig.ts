/**
 * Darwin Configuration Loader and Validator
 *
 * Provides utilities for loading, validating, and accessing Darwin evolution
 * system configuration from the global state.
 */

import {
	type DarwinConfig as DarwinConfigType,
	type DarwinConfigWithMultiAgent as DarwinConfigWithMultiAgentType,
	type DarwinConfigWithLLMSynthesis as DarwinConfigWithLLMSynthesisType,
	type LLMSynthesisConfig,
	darwinConfigSchema,
	darwinConfigWithMultiAgentSchema,
	darwinConfigWithLLMSynthesisSchema,
	DEFAULT_DARWIN_CONFIG,
	DEFAULT_MULTI_AGENT_COUNCIL_CONFIG,
	DEFAULT_LLM_SYNTHESIS_CONFIG,
} from "@roo-code/types"

/**
 * Result of configuration validation
 */
export interface ValidationResult {
	valid: boolean
	errors: string[]
	config: DarwinConfigType
}

/**
 * Extended Darwin config type with Phase 4B and 4C fields
 */
export type ExtendedDarwinConfig = DarwinConfigType & {
	enableRealMultiAgent?: boolean
	multiAgentTimeout?: number
	maxConcurrentAgents?: number
	llmSynthesis?: LLMSynthesisConfig
}

/**
 * DarwinConfig class for managing evolution system configuration
 *
 * Provides a typed interface for accessing and validating Darwin configuration,
 * with fallback to defaults for missing or invalid values.
 */
export class DarwinConfig {
	private config: ExtendedDarwinConfig

	constructor(rawConfig?: Partial<ExtendedDarwinConfig> | null) {
		this.config = this.normalizeConfig(rawConfig)
	}

	/**
	 * Normalize and validate config, applying defaults for missing values
	 */
	private normalizeConfig(rawConfig?: Partial<ExtendedDarwinConfig> | null): ExtendedDarwinConfig {
		if (!rawConfig) {
			return {
				...DEFAULT_DARWIN_CONFIG,
				enableRealMultiAgent: false,
				multiAgentTimeout: DEFAULT_MULTI_AGENT_COUNCIL_CONFIG.agentTimeout,
				maxConcurrentAgents: DEFAULT_MULTI_AGENT_COUNCIL_CONFIG.maxConcurrentAgents,
				llmSynthesis: DEFAULT_LLM_SYNTHESIS_CONFIG,
			}
		}

		// Merge with defaults and validate base config
		const merged = {
			...DEFAULT_DARWIN_CONFIG,
			...rawConfig,
		}

		// Validate base config
		const result = darwinConfigSchema.safeParse(merged)
		if (!result.success) {
			// If validation fails, log warning and return defaults
			console.warn("[DarwinConfig] Invalid configuration, using defaults:", result.error.issues)
			return {
				...DEFAULT_DARWIN_CONFIG,
				enableRealMultiAgent: false,
				multiAgentTimeout: DEFAULT_MULTI_AGENT_COUNCIL_CONFIG.agentTimeout,
				maxConcurrentAgents: DEFAULT_MULTI_AGENT_COUNCIL_CONFIG.maxConcurrentAgents,
				llmSynthesis: DEFAULT_LLM_SYNTHESIS_CONFIG,
			}
		}

		// Return with Phase 4B and 4C fields
		return {
			...result.data,
			enableRealMultiAgent: rawConfig.enableRealMultiAgent ?? false,
			multiAgentTimeout: rawConfig.multiAgentTimeout ?? DEFAULT_MULTI_AGENT_COUNCIL_CONFIG.agentTimeout,
			maxConcurrentAgents:
				rawConfig.maxConcurrentAgents ?? DEFAULT_MULTI_AGENT_COUNCIL_CONFIG.maxConcurrentAgents,
			llmSynthesis: rawConfig.llmSynthesis
				? { ...DEFAULT_LLM_SYNTHESIS_CONFIG, ...rawConfig.llmSynthesis }
				: DEFAULT_LLM_SYNTHESIS_CONFIG,
		}
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
	 * Check if performance analytics is enabled
	 */
	get analyticsEnabled(): boolean {
		return this.config.enablePerformanceAnalytics
	}

	/**
	 * Get the storage backend type
	 */
	get storageBackend(): "jsonl" | "sqlite" {
		return this.config.storageBackend ?? "jsonl"
	}

	/**
	 * Check if auto-migration is enabled
	 */
	get autoMigrate(): boolean {
		return this.config.autoMigrate ?? false
	}

	// ==========================================================================
	// Phase 4B: Multi-Agent Council Configuration
	// ==========================================================================

	/**
	 * Check if real multi-agent council is enabled (Phase 4B)
	 */
	get realMultiAgentEnabled(): boolean {
		return this.config.enableMultiAgentCouncil || (this.config.enableRealMultiAgent ?? false)
	}

	/**
	 * Get the multi-agent timeout in milliseconds
	 */
	get multiAgentTimeout(): number {
		return this.config.multiAgentTimeout ?? DEFAULT_MULTI_AGENT_COUNCIL_CONFIG.agentTimeout
	}

	/**
	 * Get the maximum concurrent agents
	 */
	get maxConcurrentAgents(): number {
		return this.config.maxConcurrentAgents ?? DEFAULT_MULTI_AGENT_COUNCIL_CONFIG.maxConcurrentAgents
	}

	// ==========================================================================
	// Phase 4C: LLM Synthesis Configuration
	// ==========================================================================

	/**
	 * Get LLM synthesis configuration
	 */
	get llmSynthesis(): LLMSynthesisConfig {
		return this.config.llmSynthesis ?? DEFAULT_LLM_SYNTHESIS_CONFIG
	}

	/**
	 * Check if LLM synthesis is enabled
	 */
	get llmSynthesisEnabled(): boolean {
		return this.config.llmSynthesis?.enabled ?? false
	}

	/**
	 * Get the synthesis strategy (template, llm, or hybrid)
	 */
	get synthesisStrategy(): "template" | "llm" | "hybrid" {
		return this.config.llmSynthesis?.strategy ?? "hybrid"
	}

	/**
	 * Get the LLM model for synthesis (or undefined to use default)
	 */
	get synthesisModel(): string | undefined {
		return this.config.llmSynthesis?.model
	}

	/**
	 * Get the temperature for LLM synthesis
	 */
	get synthesisTemperature(): number {
		return this.config.llmSynthesis?.temperature ?? DEFAULT_LLM_SYNTHESIS_CONFIG.temperature
	}

	/**
	 * Get the max tokens for LLM synthesis
	 */
	get synthesisMaxTokens(): number {
		return this.config.llmSynthesis?.maxTokens ?? DEFAULT_LLM_SYNTHESIS_CONFIG.maxTokens
	}

	/**
	 * Get the max refinement attempts for LLM synthesis
	 */
	get synthesisMaxRefinementAttempts(): number {
		return this.config.llmSynthesis?.maxRefinementAttempts ?? DEFAULT_LLM_SYNTHESIS_CONFIG.maxRefinementAttempts
	}

	/**
	 * Get the API config ID for LLM synthesis
	 */
	get synthesisApiConfigId(): string | undefined {
		return this.config.llmSynthesis?.apiConfigId
	}

	/**
	 * Check if cost tracking is enabled for synthesis
	 */
	get synthesisTrackCosts(): boolean {
		return this.config.llmSynthesis?.trackCosts ?? true
	}

	/**
	 * Get the maximum cost per synthesis in USD
	 */
	get synthesisMaxCost(): number {
		return this.config.llmSynthesis?.maxCostPerSynthesis ?? DEFAULT_LLM_SYNTHESIS_CONFIG.maxCostPerSynthesis
	}

	/**
	 * Check if prompt caching is enabled
	 */
	get synthesisPromptCachingEnabled(): boolean {
		return this.config.llmSynthesis?.enablePromptCaching ?? true
	}

	/**
	 * Get the timeout for LLM synthesis calls
	 */
	get synthesisTimeout(): number {
		return this.config.llmSynthesis?.timeoutMs ?? DEFAULT_LLM_SYNTHESIS_CONFIG.timeoutMs
	}

	/**
	 * Get the raw configuration object
	 */
	get raw(): ExtendedDarwinConfig {
		return { ...this.config }
	}

	/**
	 * Get base DarwinConfig (without Phase 4B/4C fields) for compatibility
	 */
	get baseConfig(): DarwinConfigType {
		const { enableRealMultiAgent, multiAgentTimeout, maxConcurrentAgents, llmSynthesis, ...base } = this.config
		return base
	}

	/**
	 * Check if a specific feature is enabled based on current config
	 */
	isFeatureEnabled(
		feature:
			| "trace"
			| "skills"
			| "config"
			| "council"
			| "multiAgent"
			| "llmSynthesis"
			| "autonomous"
			| "selfHealing"
			| "analytics",
	): boolean {
		if (!this.enabled) {
			return false
		}

		switch (feature) {
			case "trace":
				return this.traceCaptureEnabled
			case "skills":
				return this.skillSynthesisEnabled || this.config.enableSkillSynthesis
			case "config":
				return this.configEvolutionEnabled
			case "council":
				return this.councilEnabled
			case "multiAgent":
				return this.realMultiAgentEnabled
			case "llmSynthesis":
				return this.llmSynthesisEnabled
			case "autonomous":
				return this.config.enableAutonomousExecution
			case "selfHealing":
				return this.config.enableSelfHealing
			case "analytics":
				return this.config.enablePerformanceAnalytics
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
	update(updates: Partial<ExtendedDarwinConfig>): DarwinConfig {
		return new DarwinConfig({
			...this.config,
			...updates,
		})
	}

	/**
	 * Check if multi-agent council should be used
	 * Returns true if multi-agent is enabled and council is enabled
	 */
	shouldUseMultiAgentCouncil(): boolean {
		return this.enabled && this.councilEnabled && this.realMultiAgentEnabled
	}

	/**
	 * Check if LLM synthesis should be attempted
	 * Returns true if LLM synthesis is enabled and skill synthesis is enabled
	 */
	shouldUseLLMSynthesis(): boolean {
		return this.enabled && this.skillSynthesisEnabled && this.llmSynthesisEnabled
	}

	/**
	 * Get the effective synthesis strategy
	 * Considers whether LLM synthesis is enabled
	 */
	getEffectiveSynthesisStrategy(): "template" | "llm" | "hybrid" {
		if (!this.llmSynthesisEnabled) {
			return "template"
		}
		return this.synthesisStrategy
	}
}

/**
 * Factory function to create a DarwinConfig from raw settings
 */
export function getDarwinConfig(settings?: { darwin?: Partial<ExtendedDarwinConfig> | null }): DarwinConfig {
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

/**
 * Validate a Darwin configuration with multi-agent fields
 * Returns validation result with errors and normalized config
 */
export function validateDarwinConfigWithMultiAgent(config: unknown): {
	valid: boolean
	errors: string[]
	config: DarwinConfigWithMultiAgentType
} {
	const result = darwinConfigWithMultiAgentSchema.safeParse(config)

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
		config: {
			...DEFAULT_DARWIN_CONFIG,
			enableRealMultiAgent: false,
			multiAgentTimeout: DEFAULT_MULTI_AGENT_COUNCIL_CONFIG.agentTimeout,
			maxConcurrentAgents: DEFAULT_MULTI_AGENT_COUNCIL_CONFIG.maxConcurrentAgents,
		},
	}
}

/**
 * Validate a Darwin configuration with LLM synthesis fields
 * Returns validation result with errors and normalized config
 */
export function validateDarwinConfigWithLLMSynthesis(config: unknown): {
	valid: boolean
	errors: string[]
	config: DarwinConfigWithLLMSynthesisType
} {
	const result = darwinConfigWithLLMSynthesisSchema.safeParse(config)

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
		config: {
			...DEFAULT_DARWIN_CONFIG,
			enableRealMultiAgent: false,
			multiAgentTimeout: DEFAULT_MULTI_AGENT_COUNCIL_CONFIG.agentTimeout,
			maxConcurrentAgents: DEFAULT_MULTI_AGENT_COUNCIL_CONFIG.maxConcurrentAgents,
			llmSynthesis: DEFAULT_LLM_SYNTHESIS_CONFIG,
		},
	}
}
