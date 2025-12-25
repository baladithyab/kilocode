/**
 * ProposalGenerator - Generate evolution proposals from learning signals
 *
 * Responsibilities:
 * - Generate proposals from detected patterns and learning signals
 * - Assess risk levels (low/medium/high)
 * - Create actionable change specifications
 * - Document rationale and expected outcomes
 */

import type {
	LearningSignal,
	EvolutionProposal,
	ProposalType,
	ProposalRisk,
	ProposalStatus,
	DarwinConfig,
} from "@roo-code/types"
import { DEFAULT_DARWIN_CONFIG } from "@roo-code/types"

/** Options for proposal generation */
export interface ProposalGeneratorOptions {
	/** Darwin configuration */
	config?: DarwinConfig

	/** Maximum proposals to generate per signal */
	maxProposalsPerSignal?: number

	/** Minimum confidence threshold for generating proposals */
	minConfidenceThreshold?: number
}

/** Proposal template for different signal types */
interface ProposalTemplate {
	type: ProposalType
	risk: ProposalRisk
	titleTemplate: string
	descriptionTemplate: string
}

/** Mapping of learning signal types to proposal templates */
const SIGNAL_TO_PROPOSAL_TEMPLATES: Record<string, ProposalTemplate[]> = {
	doom_loop: [
		{
			type: "rule_update",
			risk: "medium",
			titleTemplate: "Add guardrail for {context.toolName} failures",
			descriptionTemplate:
				"Detected {context.errorCount} consecutive failures with {context.toolName}. Propose adding a rule to prevent repeated failures: {context.suggestion}",
		},
		{
			type: "mode_instruction",
			risk: "low",
			titleTemplate: "Update mode instructions for {context.toolName}",
			descriptionTemplate:
				"Add guidance to mode instructions to prevent doom loop pattern with {context.toolName}. Consider alternative approaches when tool fails repeatedly.",
		},
	],
	instruction_drift: [
		{
			type: "prompt_refinement",
			risk: "medium",
			titleTemplate: "Refine instructions for clarity",
			descriptionTemplate:
				"Instructions are not being followed consistently. Propose refining prompts to be more explicit: {description}",
		},
	],
	capability_gap: [
		{
			type: "tool_creation",
			risk: "high",
			titleTemplate: "Create new tool for {context.capability}",
			descriptionTemplate:
				"Detected missing capability: {context.capability}. Propose creating a new MCP tool to address this gap.",
		},
	],
	inefficiency: [
		{
			type: "config_change",
			risk: "low",
			titleTemplate: "Optimize {context.area} configuration",
			descriptionTemplate:
				"Detected inefficiency in {context.area}. Propose configuration changes to improve performance.",
		},
	],
	user_preference: [
		{
			type: "mode_instruction",
			risk: "low",
			titleTemplate: "Incorporate user preference for {context.preference}",
			descriptionTemplate:
				"User consistently prefers {context.preference}. Propose adding this as a default behavior in mode instructions.",
		},
	],
	success_pattern: [
		{
			type: "rule_update",
			risk: "low",
			titleTemplate: "Codify successful pattern: {context.patternName}",
			descriptionTemplate:
				"Detected successful workflow pattern. Propose adding it to rules for consistent application: {description}",
		},
	],
}

/**
 * ProposalGenerator creates evolution proposals from learning signals
 */
export class ProposalGenerator {
	private config: DarwinConfig
	private maxProposalsPerSignal: number
	private minConfidenceThreshold: number

	constructor(options: ProposalGeneratorOptions = {}) {
		this.config = options.config ?? DEFAULT_DARWIN_CONFIG
		this.maxProposalsPerSignal = options.maxProposalsPerSignal ?? 2
		this.minConfidenceThreshold = options.minConfidenceThreshold ?? 0.5
	}

	/**
	 * Update configuration
	 */
	updateConfig(config: DarwinConfig): void {
		this.config = config
	}

	/**
	 * Generate proposals from a learning signal
	 */
	generateFromSignal(signal: LearningSignal): EvolutionProposal[] {
		// Skip if confidence is too low
		if (signal.confidence < this.minConfidenceThreshold) {
			return []
		}

		// Get templates for this signal type
		const templates = SIGNAL_TO_PROPOSAL_TEMPLATES[signal.type]
		if (!templates || templates.length === 0) {
			return []
		}

		const proposals: EvolutionProposal[] = []
		const now = Date.now()

		// Generate proposals from templates (up to max per signal)
		for (let i = 0; i < Math.min(templates.length, this.maxProposalsPerSignal); i++) {
			const template = templates[i]
			const proposal = this.createProposalFromTemplate(signal, template, now)
			proposals.push(proposal)
		}

		return proposals
	}

	/**
	 * Generate proposals from multiple learning signals
	 */
	generateFromSignals(signals: LearningSignal[]): EvolutionProposal[] {
		const allProposals: EvolutionProposal[] = []

		for (const signal of signals) {
			const proposals = this.generateFromSignal(signal)
			allProposals.push(...proposals)
		}

		// Deduplicate similar proposals
		return this.deduplicateProposals(allProposals)
	}

	/**
	 * Assess risk level for a proposal based on its type and context
	 */
	assessRisk(proposalType: ProposalType, context?: Record<string, unknown>): ProposalRisk {
		// High risk: anything that creates new capabilities or changes core behavior
		if (proposalType === "tool_creation") {
			return "high"
		}

		// Medium risk: rule updates and prompt changes
		if (proposalType === "rule_update" || proposalType === "prompt_refinement") {
			return "medium"
		}

		// Low risk: config changes and mode instructions
		return "low"
	}

	/**
	 * Create a proposal from a template and signal
	 */
	private createProposalFromTemplate(
		signal: LearningSignal,
		template: ProposalTemplate,
		timestamp: number,
	): EvolutionProposal {
		const context = signal.context ?? {}

		// Interpolate template strings
		const title = this.interpolateTemplate(template.titleTemplate, {
			...context,
			description: signal.description,
		})
		const description = this.interpolateTemplate(template.descriptionTemplate, {
			...context,
			description: signal.description,
		})

		// Generate unique ID
		const id = `proposal-${timestamp}-${Math.random().toString(36).substring(2, 9)}`

		// Create payload based on proposal type
		const payload = this.createPayload(template.type, signal, context)

		return {
			id,
			type: template.type,
			status: "pending" as ProposalStatus,
			risk: template.risk,
			title,
			description,
			payload,
			sourceSignalId: signal.id,
			createdAt: timestamp,
			updatedAt: timestamp,
		}
	}

	/**
	 * Interpolate template string with context values
	 */
	private interpolateTemplate(template: string, context: Record<string, unknown>): string {
		return template.replace(/\{([^}]+)\}/g, (match, path) => {
			const value = this.getNestedValue(context, path)
			return value?.toString() ?? match
		})
	}

	/**
	 * Get nested value from object using dot notation
	 */
	private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
		const parts = path.split(".")
		let current: unknown = obj

		for (const part of parts) {
			if (current === null || current === undefined || typeof current !== "object") {
				return undefined
			}
			current = (current as Record<string, unknown>)[part]
		}

		return current
	}

	/**
	 * Create payload for a proposal based on its type
	 */
	private createPayload(
		type: ProposalType,
		signal: LearningSignal,
		context: Record<string, unknown>,
	): Record<string, unknown> {
		switch (type) {
			case "rule_update":
				return {
					targetFile: ".kilocoderules",
					ruleType: "guardrail",
					ruleContent: signal.suggestedAction ?? `Handle ${context.toolName} failures gracefully`,
					context: {
						signalType: signal.type,
						confidence: signal.confidence,
					},
				}

			case "mode_instruction":
				return {
					targetMode: context.mode ?? "default",
					instructionType: "guidance",
					content: signal.suggestedAction ?? signal.description,
					priority: signal.confidence > 0.8 ? "high" : "normal",
				}

			case "tool_creation":
				return {
					toolName: context.capability ?? "new_tool",
					toolType: "mcp",
					specification: {
						description: signal.description,
						suggestedAction: signal.suggestedAction,
					},
					requiresReview: true,
				}

			case "config_change":
				return {
					setting: context.setting ?? "unknown",
					currentValue: context.currentValue,
					proposedValue: context.proposedValue,
					reason: signal.description,
				}

			case "prompt_refinement":
				return {
					targetPrompt: context.prompt ?? "system",
					refinementType: "clarification",
					suggestion: signal.suggestedAction ?? signal.description,
				}

			default:
				return {
					signalType: signal.type,
					description: signal.description,
					context,
				}
		}
	}

	/**
	 * Deduplicate proposals that are too similar
	 */
	private deduplicateProposals(proposals: EvolutionProposal[]): EvolutionProposal[] {
		const seen = new Map<string, EvolutionProposal>()

		for (const proposal of proposals) {
			// Create a key based on type and title
			const key = `${proposal.type}:${proposal.title.toLowerCase()}`

			// Keep the first occurrence
			if (!seen.has(key)) {
				seen.set(key, proposal)
			}
		}

		return Array.from(seen.values())
	}

	/**
	 * Validate a proposal before submission
	 */
	validateProposal(proposal: EvolutionProposal): { valid: boolean; errors: string[] } {
		const errors: string[] = []

		// Check required fields
		if (!proposal.id) {
			errors.push("Proposal must have an ID")
		}
		if (!proposal.title || proposal.title.length < 5) {
			errors.push("Proposal must have a title (at least 5 characters)")
		}
		if (!proposal.description || proposal.description.length < 10) {
			errors.push("Proposal must have a description (at least 10 characters)")
		}
		if (!proposal.type) {
			errors.push("Proposal must have a type")
		}
		if (!proposal.risk) {
			errors.push("Proposal must have a risk level")
		}

		return {
			valid: errors.length === 0,
			errors,
		}
	}
}
