/**
 * RiskAssessor - Calculate proposal risk for autonomous execution
 *
 * Responsibilities:
 * - Assess risk level based on proposal characteristics
 * - Calculate confidence scores
 * - Consider historical success rates
 * - Track user override patterns
 * - Provide recommendations for risk mitigation
 */

import type {
	EvolutionProposal,
	ProposalRisk,
	ProposalType,
	RiskAssessmentResult,
	RiskFactor,
	SkillScope,
} from "@roo-code/types"

/** Configuration for RiskAssessor */
export interface RiskAssessorConfig {
	/** Base risk weights for proposal types */
	typeWeights?: Partial<Record<ProposalType, number>>

	/** Weight multipliers for various factors */
	factorWeights?: {
		type?: number
		scope?: number
		fileCount?: number
		history?: number
		override?: number
	}

	/** Minimum confidence threshold */
	minConfidence?: number

	/** Maximum files before escalating to high risk */
	maxSafeFileCount?: number

	/** Override patterns weight (0-1) */
	overrideWeight?: number
}

/** Historical data for risk calculation */
export interface RiskHistoryData {
	/** Total proposals of this type */
	totalByType: Record<ProposalType, number>

	/** Successful proposals by type */
	successByType: Record<ProposalType, number>

	/** User overrides (approved recommendations that were rejected) */
	userOverrides: Array<{
		proposalType: ProposalType
		assessedRisk: ProposalRisk
		userDecision: "approved" | "rejected"
		timestamp: number
	}>
}

/** Default risk weights by proposal type */
const DEFAULT_TYPE_RISK: Record<ProposalType, number> = {
	rule_update: 0.2, // Low risk - adding rules
	config_change: 0.5, // Medium risk - changing config
	mode_instruction: 0.6, // Medium-high risk - changing behavior
	tool_creation: 0.4, // Medium risk - new tools
	prompt_refinement: 0.5, // Medium risk - changing prompts
}

/** Default risk by scope */
const SCOPE_RISK: Record<SkillScope | "unknown", number> = {
	project: 0.3, // Project-only changes are safer
	global: 0.7, // Global changes affect everything
	unknown: 0.5, // Unknown defaults to medium
}

/**
 * RiskAssessor calculates risk levels for evolution proposals
 */
export class RiskAssessor {
	private config: Required<RiskAssessorConfig>
	private history: RiskHistoryData = {
		totalByType: {
			rule_update: 0,
			config_change: 0,
			mode_instruction: 0,
			tool_creation: 0,
			prompt_refinement: 0,
		},
		successByType: {
			rule_update: 0,
			config_change: 0,
			mode_instruction: 0,
			tool_creation: 0,
			prompt_refinement: 0,
		},
		userOverrides: [],
	}

	constructor(config: RiskAssessorConfig = {}) {
		this.config = {
			typeWeights: { ...DEFAULT_TYPE_RISK, ...config.typeWeights },
			factorWeights: {
				type: 0.3,
				scope: 0.2,
				fileCount: 0.2,
				history: 0.15,
				override: 0.15,
				...config.factorWeights,
			},
			minConfidence: config.minConfidence ?? 0.6,
			maxSafeFileCount: config.maxSafeFileCount ?? 5,
			overrideWeight: config.overrideWeight ?? 0.15,
		}
	}

	/**
	 * Assess risk for a proposal
	 */
	assessRisk(proposal: EvolutionProposal): RiskAssessmentResult {
		const factors: RiskFactor[] = []
		let totalWeight = 0
		let weightedSum = 0

		// Factor 1: Proposal Type
		const typeFactor = this.assessTypeFactor(proposal)
		factors.push(typeFactor)
		totalWeight += typeFactor.weight
		weightedSum += typeFactor.value * typeFactor.weight

		// Factor 2: Scope
		const scopeFactor = this.assessScopeFactor(proposal)
		factors.push(scopeFactor)
		totalWeight += scopeFactor.weight
		weightedSum += scopeFactor.value * scopeFactor.weight

		// Factor 3: Affected Files Count
		const filesFactor = this.assessFilesFactor(proposal)
		factors.push(filesFactor)
		totalWeight += filesFactor.weight
		weightedSum += filesFactor.value * filesFactor.weight

		// Factor 4: Historical Success Rate
		const historyFactor = this.assessHistoryFactor(proposal)
		factors.push(historyFactor)
		totalWeight += historyFactor.weight
		weightedSum += historyFactor.value * historyFactor.weight

		// Factor 5: User Override Patterns
		const overrideFactor = this.assessOverrideFactor(proposal)
		factors.push(overrideFactor)
		totalWeight += overrideFactor.weight
		weightedSum += overrideFactor.value * overrideFactor.weight

		// Calculate overall risk score
		const riskScore = totalWeight > 0 ? weightedSum / totalWeight : 0.5

		// Determine risk level from score
		const riskLevel = this.scoreToRiskLevel(riskScore)

		// Calculate confidence based on available data
		const confidence = this.calculateConfidence(proposal, factors)

		// Generate recommendations
		const recommendations = this.generateRecommendations(proposal, riskLevel, factors)

		return {
			proposalId: proposal.id,
			riskLevel,
			riskScore,
			confidence,
			factors,
			assessedAt: Date.now(),
			recommendations,
		}
	}

	/**
	 * Assess risk factor based on proposal type
	 */
	private assessTypeFactor(proposal: EvolutionProposal): RiskFactor {
		const typeRisk = this.config.typeWeights[proposal.type] ?? 0.5
		const weight = this.config.factorWeights.type ?? 0.3

		let explanation: string
		switch (proposal.type) {
			case "rule_update":
				explanation =
					"Rule updates are generally low risk - they add guidance without changing existing behavior"
				break
			case "config_change":
				explanation = "Configuration changes have moderate risk - they can affect system behavior"
				break
			case "mode_instruction":
				explanation = "Mode instruction changes have higher risk - they directly affect agent behavior"
				break
			case "tool_creation":
				explanation = "Tool creation has moderate risk - new tools are isolated but could introduce issues"
				break
			case "prompt_refinement":
				explanation = "Prompt refinements have moderate risk - they subtly change agent responses"
				break
			default:
				explanation = `Unknown proposal type: ${proposal.type}`
		}

		return {
			name: "proposal_type",
			weight,
			value: typeRisk,
			explanation,
		}
	}

	/**
	 * Assess risk factor based on scope
	 */
	private assessScopeFactor(proposal: EvolutionProposal): RiskFactor {
		const payload = proposal.payload as { scope?: SkillScope }
		const scope = payload.scope ?? "unknown"
		const scopeRisk = SCOPE_RISK[scope] ?? SCOPE_RISK.unknown
		const weight = this.config.factorWeights.scope ?? 0.2

		let explanation: string
		switch (scope) {
			case "project":
				explanation = "Project-scoped changes only affect the current workspace"
				break
			case "global":
				explanation = "Global changes affect all workspaces - higher risk"
				break
			default:
				explanation = "Scope could not be determined - assuming moderate risk"
		}

		return {
			name: "scope",
			weight,
			value: scopeRisk,
			explanation,
		}
	}

	/**
	 * Assess risk factor based on affected files count
	 */
	private assessFilesFactor(proposal: EvolutionProposal): RiskFactor {
		const payload = proposal.payload as { affectedFiles?: string[]; targetFile?: string; files?: string[] }
		const files = payload.affectedFiles ?? payload.files ?? (payload.targetFile ? [payload.targetFile] : [])
		const fileCount = files.length
		const weight = this.config.factorWeights.fileCount ?? 0.2

		// Calculate risk based on file count
		let value: number
		if (fileCount === 0) {
			value = 0.1 // Very low risk for no files
		} else if (fileCount <= 2) {
			value = 0.2 // Low risk
		} else if (fileCount <= this.config.maxSafeFileCount) {
			value = 0.4 // Medium risk
		} else {
			value = Math.min(0.9, 0.5 + (fileCount - this.config.maxSafeFileCount) * 0.1) // High risk
		}

		return {
			name: "affected_files",
			weight,
			value,
			explanation: `${fileCount} file(s) affected. ${fileCount > this.config.maxSafeFileCount ? "Exceeds safe threshold." : "Within safe limits."}`,
		}
	}

	/**
	 * Assess risk factor based on historical success rate
	 */
	private assessHistoryFactor(proposal: EvolutionProposal): RiskFactor {
		const total = this.history.totalByType[proposal.type] ?? 0
		const success = this.history.successByType[proposal.type] ?? 0
		const weight = this.config.factorWeights.history ?? 0.15

		// Not enough history - neutral risk
		if (total < 3) {
			return {
				name: "historical_success",
				weight,
				value: 0.5,
				explanation: "Insufficient historical data (less than 3 proposals of this type)",
			}
		}

		// Calculate failure rate as risk
		const successRate = success / total
		const failureRate = 1 - successRate

		return {
			name: "historical_success",
			weight,
			value: failureRate,
			explanation: `Historical success rate: ${(successRate * 100).toFixed(1)}% (${success}/${total} successful)`,
		}
	}

	/**
	 * Assess risk factor based on user override patterns
	 */
	private assessOverrideFactor(proposal: EvolutionProposal): RiskFactor {
		const weight = this.config.factorWeights.override ?? 0.15

		// Get recent overrides for this type
		const recentOverrides = this.history.userOverrides.filter(
			(o) => o.proposalType === proposal.type && Date.now() - o.timestamp < 30 * 24 * 60 * 60 * 1000, // Last 30 days
		)

		if (recentOverrides.length === 0) {
			return {
				name: "user_overrides",
				weight,
				value: 0.5,
				explanation: "No recent user overrides for this proposal type",
			}
		}

		// Calculate override tendency
		const rejections = recentOverrides.filter((o) => o.userDecision === "rejected").length
		const rejectionRate = rejections / recentOverrides.length

		return {
			name: "user_overrides",
			weight,
			value: rejectionRate,
			explanation: `User rejected ${rejections}/${recentOverrides.length} (${(rejectionRate * 100).toFixed(1)}%) similar proposals recently`,
		}
	}

	/**
	 * Convert risk score to risk level
	 */
	private scoreToRiskLevel(score: number): ProposalRisk {
		if (score <= 0.33) {
			return "low"
		} else if (score <= 0.66) {
			return "medium"
		} else {
			return "high"
		}
	}

	/**
	 * Calculate confidence in the assessment
	 */
	private calculateConfidence(proposal: EvolutionProposal, factors: RiskFactor[]): number {
		let confidence = 0.7 // Base confidence

		// More history increases confidence
		const total = this.history.totalByType[proposal.type] ?? 0
		if (total >= 10) {
			confidence += 0.15
		} else if (total >= 5) {
			confidence += 0.1
		} else if (total >= 3) {
			confidence += 0.05
		}

		// More factors with low variance increases confidence
		const values = factors.map((f) => f.value)
		const variance = this.calculateVariance(values)
		if (variance < 0.1) {
			confidence += 0.1
		} else if (variance < 0.2) {
			confidence += 0.05
		}

		// Cap at 0.95
		return Math.min(0.95, Math.max(this.config.minConfidence, confidence))
	}

	/**
	 * Calculate variance of an array
	 */
	private calculateVariance(values: number[]): number {
		if (values.length === 0) return 0
		const mean = values.reduce((a, b) => a + b, 0) / values.length
		return values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length
	}

	/**
	 * Generate recommendations based on risk assessment
	 */
	private generateRecommendations(
		proposal: EvolutionProposal,
		riskLevel: ProposalRisk,
		factors: RiskFactor[],
	): string[] {
		const recommendations: string[] = []

		if (riskLevel === "high") {
			recommendations.push("Recommend manual review before application")
			recommendations.push("Consider creating a backup before applying")
		}

		if (riskLevel === "medium") {
			recommendations.push("Consider testing in a staging environment first")
		}

		// Check specific factors
		const filesFactor = factors.find((f) => f.name === "affected_files")
		if (filesFactor && filesFactor.value > 0.6) {
			recommendations.push(
				`Consider breaking this into smaller changes (${this.config.maxSafeFileCount} or fewer files)`,
			)
		}

		const historyFactor = factors.find((f) => f.name === "historical_success")
		if (historyFactor && historyFactor.value > 0.5) {
			recommendations.push("Historical data suggests similar proposals have had issues - review carefully")
		}

		const overrideFactor = factors.find((f) => f.name === "user_overrides")
		if (overrideFactor && overrideFactor.value > 0.5) {
			recommendations.push("Users have frequently rejected similar proposals - consider alternative approaches")
		}

		// Type-specific recommendations
		if (proposal.type === "mode_instruction") {
			recommendations.push("Mode instruction changes can significantly alter agent behavior - test thoroughly")
		}

		if (proposal.type === "tool_creation") {
			recommendations.push("New tools should be validated before deployment")
		}

		return recommendations
	}

	// ==========================================================================
	// History Management
	// ==========================================================================

	/**
	 * Record a proposal result
	 */
	recordResult(proposal: EvolutionProposal, success: boolean): void {
		this.history.totalByType[proposal.type] = (this.history.totalByType[proposal.type] ?? 0) + 1
		if (success) {
			this.history.successByType[proposal.type] = (this.history.successByType[proposal.type] ?? 0) + 1
		}
	}

	/**
	 * Record a user override
	 */
	recordOverride(
		proposalType: ProposalType,
		assessedRisk: ProposalRisk,
		userDecision: "approved" | "rejected",
	): void {
		this.history.userOverrides.push({
			proposalType,
			assessedRisk,
			userDecision,
			timestamp: Date.now(),
		})

		// Keep only last 100 overrides
		if (this.history.userOverrides.length > 100) {
			this.history.userOverrides = this.history.userOverrides.slice(-100)
		}
	}

	/**
	 * Get history data
	 */
	getHistory(): Readonly<RiskHistoryData> {
		return this.history
	}

	/**
	 * Set history data (for restoring from persistence)
	 */
	setHistory(history: RiskHistoryData): void {
		this.history = history
	}

	/**
	 * Reset history
	 */
	resetHistory(): void {
		this.history = {
			totalByType: {
				rule_update: 0,
				config_change: 0,
				mode_instruction: 0,
				tool_creation: 0,
				prompt_refinement: 0,
			},
			successByType: {
				rule_update: 0,
				config_change: 0,
				mode_instruction: 0,
				tool_creation: 0,
				prompt_refinement: 0,
			},
			userOverrides: [],
		}
	}

	// ==========================================================================
	// Utility Methods
	// ==========================================================================

	/**
	 * Get success rate for a proposal type
	 */
	getSuccessRate(type: ProposalType): number | null {
		const total = this.history.totalByType[type] ?? 0
		if (total === 0) return null
		return (this.history.successByType[type] ?? 0) / total
	}

	/**
	 * Check if a proposal is safe for auto-approval at given autonomy level
	 */
	isSafeForAutoApproval(assessment: RiskAssessmentResult, autonomyLevel: 0 | 1 | 2): boolean {
		// Manual mode - never auto-approve
		if (autonomyLevel === 0) {
			return false
		}

		// Assisted mode - only low risk with high confidence
		if (autonomyLevel === 1) {
			return assessment.riskLevel === "low" && assessment.confidence >= this.config.minConfidence
		}

		// Auto mode - low and medium risk
		if (autonomyLevel === 2) {
			return (
				(assessment.riskLevel === "low" || assessment.riskLevel === "medium") &&
				assessment.confidence >= this.config.minConfidence
			)
		}

		return false
	}

	/**
	 * Update configuration
	 */
	updateConfig(config: Partial<RiskAssessorConfig>): void {
		if (config.typeWeights) {
			this.config.typeWeights = { ...this.config.typeWeights, ...config.typeWeights }
		}
		if (config.factorWeights) {
			this.config.factorWeights = { ...this.config.factorWeights, ...config.factorWeights }
		}
		if (config.minConfidence !== undefined) {
			this.config.minConfidence = config.minConfidence
		}
		if (config.maxSafeFileCount !== undefined) {
			this.config.maxSafeFileCount = config.maxSafeFileCount
		}
		if (config.overrideWeight !== undefined) {
			this.config.overrideWeight = config.overrideWeight
		}
	}
}
