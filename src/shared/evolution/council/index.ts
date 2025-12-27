/**
 * Council module exports
 *
 * Provides both simulated Council and real MultiAgentCouncil implementations.
 * Use createCouncil factory to get the appropriate implementation based on config.
 */

import type { DarwinConfig, MultiAgentCouncilConfig } from "@roo-code/types"
import { Council, type CouncilConfig, type VotingPolicy } from "./Council"
import { MultiAgentCouncil, type TaskDelegator } from "./MultiAgentCouncil"

// Re-export Council and types
export { Council, type CouncilDecision, type CouncilConfig, type VotingPolicy } from "./Council"

// Re-export MultiAgentCouncil and types
export {
	MultiAgentCouncil,
	type TaskDelegator,
	type DelegatedTaskResult,
	type MultiAgentCouncilEvent,
} from "./MultiAgentCouncil"

// Re-export TaskDelegator adapter for ClineProvider integration
export {
	createTaskDelegatorAdapter,
	createMultiAgentCouncilWithProvider,
	isClineProviderLike,
	type ClineProviderLike,
} from "./TaskDelegatorAdapter"

/**
 * Extended Darwin configuration with multi-agent options
 */
export interface DarwinConfigWithMultiAgent extends DarwinConfig {
	/** Enable real multi-agent council (Phase 4B) */
	enableRealMultiAgent?: boolean

	/** Multi-agent timeout in milliseconds */
	multiAgentTimeout?: number

	/** Maximum concurrent agents */
	maxConcurrentAgents?: number
}

/**
 * Options for council creation
 */
export interface CreateCouncilOptions {
	/** Darwin configuration */
	config: DarwinConfigWithMultiAgent

	/** Task delegator for multi-agent mode (usually ClineProvider) */
	delegator?: TaskDelegator

	/** Override council configuration */
	councilConfig?: Partial<CouncilConfig>

	/** Override multi-agent configuration */
	multiAgentConfig?: Partial<MultiAgentCouncilConfig>
}

/**
 * Factory function to create the appropriate council implementation
 *
 * Returns MultiAgentCouncil if:
 * - config.enableRealMultiAgent is true
 * - A delegator is provided
 *
 * Otherwise returns the simulated Council
 *
 * @param options - Council creation options
 * @returns Council or MultiAgentCouncil instance
 *
 * @example
 * ```typescript
 * // Get simulated council (default)
 * const council = createCouncil({ config: darwinConfig })
 *
 * // Get real multi-agent council
 * const realCouncil = createCouncil({
 *   config: { ...darwinConfig, enableRealMultiAgent: true },
 *   delegator: clineProvider
 * })
 * ```
 */
export function createCouncil(options: CreateCouncilOptions): Council | MultiAgentCouncil {
	const { config, delegator, councilConfig, multiAgentConfig } = options

	// Check if multi-agent is requested and available
	if (config.enableRealMultiAgent && delegator) {
		console.log("[createCouncil] Creating MultiAgentCouncil with real delegation")

		return new MultiAgentCouncil(
			delegator,
			{
				enabled: true,
				agentTimeout: config.multiAgentTimeout ?? 300000,
				maxConcurrentAgents: config.maxConcurrentAgents ?? 4,
				...multiAgentConfig,
			},
			config,
		)
	}

	// Fall back to simulated council
	console.log("[createCouncil] Creating simulated Council")

	return new Council({
		darwinConfig: config,
		votingPolicy: councilConfig?.votingPolicy ?? "majority",
		activeRoles: councilConfig?.activeRoles ?? ["analyst", "reviewer", "security"],
		requireHumanReview: councilConfig?.requireHumanReview ?? false,
	})
}

/**
 * Type guard to check if a council is a MultiAgentCouncil
 */
export function isMultiAgentCouncil(
	council: Council | MultiAgentCouncil | null | undefined,
): council is MultiAgentCouncil {
	return council !== null && council !== undefined && council instanceof MultiAgentCouncil
}

/**
 * Get the default council for a given configuration
 */
export function getDefaultCouncil(config?: DarwinConfig): Council {
	return new Council({
		darwinConfig: config,
		votingPolicy: "majority",
		activeRoles: ["analyst", "reviewer", "security"],
	})
}
