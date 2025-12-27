/**
 * TaskDelegatorAdapter - Bridges ClineProvider to MultiAgentCouncil
 *
 * This adapter connects the ClineProvider's delegateParentAndOpenChild method
 * to the TaskDelegator interface expected by MultiAgentCouncil, enabling
 * real multi-agent review delegation.
 */

import type { TaskDelegator } from "./MultiAgentCouncil"

/**
 * Minimal interface for the ClineProvider delegation capabilities
 * This avoids direct imports to prevent circular dependencies
 */
export interface ClineProviderLike {
	getCurrentTask(): { taskId: string } | undefined
	delegateParentAndOpenChild(params: {
		parentTaskId: string
		message: string
		initialTodos: Array<{ content: string; status: "pending" | "in_progress" | "completed" }>
		mode: string
	}): Promise<{ taskId: string }>
}

/**
 * Creates a TaskDelegator adapter from a ClineProvider instance
 *
 * @param provider - The ClineProvider instance to adapt
 * @returns A TaskDelegator compatible with MultiAgentCouncil
 */
export function createTaskDelegatorAdapter(provider: ClineProviderLike): TaskDelegator {
	return {
		getCurrentTask() {
			return provider.getCurrentTask()
		},

		async delegateParentAndOpenChild(params) {
			const result = await provider.delegateParentAndOpenChild(params)
			return { taskId: result.taskId }
		},
	}
}

/**
 * Factory function to create MultiAgentCouncil with ClineProvider integration
 *
 * Usage example in DarwinService:
 * ```typescript
 * import { createMultiAgentCouncilWithProvider } from './council/TaskDelegatorAdapter'
 *
 * // In DarwinService.initialize():
 * const council = createMultiAgentCouncilWithProvider(clineProvider, darwinConfig)
 * ```
 */
export function createMultiAgentCouncilWithProvider(
	provider: ClineProviderLike | null | undefined,
	darwinConfig?: import("@roo-code/types").DarwinConfig,
	councilConfig?: Partial<import("@roo-code/types").MultiAgentCouncilConfig>,
): import("./MultiAgentCouncil").MultiAgentCouncil {
	// Lazy import to avoid circular dependency issues
	const { MultiAgentCouncil } = require("./MultiAgentCouncil")

	const delegator = provider ? createTaskDelegatorAdapter(provider) : null
	return new MultiAgentCouncil(delegator, councilConfig, darwinConfig)
}

/**
 * Type guard to check if an object implements ClineProviderLike
 */
export function isClineProviderLike(obj: unknown): obj is ClineProviderLike {
	if (!obj || typeof obj !== "object") {
		return false
	}

	const candidate = obj as Record<string, unknown>
	return typeof candidate.getCurrentTask === "function" && typeof candidate.delegateParentAndOpenChild === "function"
}
