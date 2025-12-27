import { z } from "zod"

/**
 * Darwin Evolution System Types
 *
 * These types define the foundation for Kilocode's self-improving agent system.
 * The system detects failures, proposes fixes, and evolves through a council of agents.
 */

// =============================================================================
// Autonomy Levels
// =============================================================================

/**
 * Autonomy level for the Darwin system
 * - 0 (Manual): All changes require user approval
 * - 1 (Assisted): Low-risk changes auto-applied, high-risk require approval
 * - 2 (Auto): All changes auto-applied (with rollback capability)
 */
export const autonomyLevelSchema = z.union([z.literal(0), z.literal(1), z.literal(2)])
export type AutonomyLevel = z.infer<typeof autonomyLevelSchema>

export const AUTONOMY_LABELS: Record<AutonomyLevel, string> = {
	0: "Manual",
	1: "Assisted",
	2: "Auto",
}

// =============================================================================
// Darwin Configuration
// =============================================================================

/**
 * Skill execution mode
 * - default: Execute in standard environment (simulated or direct)
 * - docker-isolated: Execute in containerized Docker environment
 */
export const skillExecutionModeSchema = z.enum(["default", "docker-isolated"])
export type SkillExecutionMode = z.infer<typeof skillExecutionModeSchema>

/**
 * Schema for Darwin system configuration
 */
export const darwinConfigSchema = z.object({
	/** Master toggle for the Darwin evolution system */
	enabled: z.boolean().default(false),

	/** Autonomy level: 0=Manual, 1=Assisted, 2=Auto */
	autonomyLevel: autonomyLevelSchema.default(0),

	/** Whether to capture trace events for analysis */
	traceCapture: z.boolean().default(true),

	/** Number of repeated failures before triggering doom loop detection */
	doomLoopThreshold: z.number().min(2).max(10).default(3),

	/** Whether skill synthesis is enabled (creating new tools/patterns) */
	skillSynthesis: z.boolean().default(false),

	/** Whether configuration evolution is enabled (auto-tuning settings) */
	configEvolution: z.boolean().default(false),

	/** Whether the Council review system is enabled */
	councilEnabled: z.boolean().default(true),

	/** Skill execution mode */
	skillExecutionMode: skillExecutionModeSchema.default("default"),

	/** Feature Flag: Enable autonomous execution engine */
	enableAutonomousExecution: z.boolean().default(false),

	/** Feature Flag: Enable skill synthesis capabilities */
	enableSkillSynthesis: z.boolean().default(false),

	/** Feature Flag: Enable multi-agent council */
	enableMultiAgentCouncil: z.boolean().default(false),

	/** Feature Flag: Enable self-healing capabilities */
	enableSelfHealing: z.boolean().default(false),

	/** Feature Flag: Enable performance analytics */
	enablePerformanceAnalytics: z.boolean().default(false),

	/** Storage backend to use */
	storageBackend: z.enum(["jsonl", "sqlite"]).default("jsonl"),

	/** Whether to auto-migrate data from JSONL to SQLite */
	autoMigrate: z.boolean().default(false),
})

export type DarwinConfig = z.infer<typeof darwinConfigSchema>

/**
 * Default Darwin configuration
 */
export const DEFAULT_DARWIN_CONFIG: DarwinConfigWithLLMSynthesis = {
	enabled: false,
	autonomyLevel: 0,
	traceCapture: true,
	doomLoopThreshold: 3,
	skillSynthesis: false,
	configEvolution: false,
	councilEnabled: true,
	skillExecutionMode: "default",
	enableAutonomousExecution: false,
	enableSkillSynthesis: false,
	enableMultiAgentCouncil: false,
	enableSelfHealing: false,
	enablePerformanceAnalytics: false,
	storageBackend: "jsonl",
	autoMigrate: false,
	// Phase 4B defaults
	enableRealMultiAgent: false,
	multiAgentTimeout: 300000,
	maxConcurrentAgents: 4,
	// Phase 4C defaults
	llmSynthesis: {
		enabled: false,
		strategy: "hybrid",
		temperature: 0.3,
		maxTokens: 4000,
		maxRetries: 3,
		maxRefinementAttempts: 3,
		trackCosts: true,
		maxCostPerSynthesis: 0.1,
		enablePromptCaching: true,
		timeoutMs: 30000,
	},
}

// =============================================================================
// Trace Events
// =============================================================================

/**
 * Types of events that can be traced
 */
export const traceEventTypeSchema = z.enum([
	"tool_error", // Tool execution failed
	"tool_success", // Tool execution succeeded
	"user_correction", // User corrected agent behavior
	"user_rejection", // User rejected proposed action
	"task_complete", // Task completed successfully
	"task_abandoned", // Task abandoned by user
	"mode_switch", // Agent switched modes
	"context_overflow", // Context window exceeded
	"api_error", // API call failed
	"doom_loop_detected", // Repetitive failure pattern detected
	"proposal_generated", // Evolution proposal created
	"proposal_applied", // Evolution proposal applied
	"proposal_rejected", // Evolution proposal rejected
])

export type TraceEventType = z.infer<typeof traceEventTypeSchema>

/**
 * Schema for trace event metadata
 */
export const traceEventMetadataSchema = z.record(z.string(), z.unknown())

/**
 * Schema for a single trace event
 */
export const traceEventSchema = z.object({
	/** Unique identifier for this trace event */
	id: z.string(),

	/** Timestamp when the event occurred */
	timestamp: z.number(),

	/** Type of event */
	type: traceEventTypeSchema,

	/** Task ID this event belongs to */
	taskId: z.string(),

	/** Human-readable summary of the event */
	summary: z.string(),

	/** Additional metadata specific to the event type */
	metadata: traceEventMetadataSchema,

	/** Related tool name if applicable */
	toolName: z.string().optional(),

	/** Error message if applicable */
	errorMessage: z.string().optional(),

	/** Mode active when event occurred */
	mode: z.string().optional(),

	/** Model used when event occurred */
	model: z.string().optional(),
})

export type TraceEvent = z.infer<typeof traceEventSchema>

// =============================================================================
// Learning Signals
// =============================================================================

/**
 * Types of patterns that can be detected from traces
 */
export const learningSignalTypeSchema = z.enum([
	"doom_loop", // Repetitive failure pattern
	"instruction_drift", // Instructions not being followed
	"capability_gap", // Missing tool or capability
	"success_pattern", // Successful workflow pattern
	"inefficiency", // Suboptimal workflow detected
	"user_preference", // User behavior pattern
])

export type LearningSignalType = z.infer<typeof learningSignalTypeSchema>

/**
 * Schema for a learning signal (detected pattern)
 */
export const learningSignalSchema = z.object({
	/** Unique identifier */
	id: z.string(),

	/** Type of learning signal */
	type: learningSignalTypeSchema,

	/** Confidence score (0-1) */
	confidence: z.number().min(0).max(1),

	/** Human-readable description */
	description: z.string(),

	/** Trace event IDs that contributed to this signal */
	sourceEventIds: z.array(z.string()),

	/** Timestamp when signal was detected */
	detectedAt: z.number(),

	/** Suggested action based on this signal */
	suggestedAction: z.string().optional(),

	/** Additional context data */
	context: z.record(z.string(), z.unknown()).optional(),
})

export type LearningSignal = z.infer<typeof learningSignalSchema>

// =============================================================================
// Evolution Proposals
// =============================================================================

/**
 * Types of evolution proposals
 */
export const proposalTypeSchema = z.enum([
	"rule_update", // Update .kilocoderules
	"mode_instruction", // Update mode custom instructions
	"tool_creation", // Create new MCP tool
	"config_change", // Change extension settings
	"prompt_refinement", // Refine system prompts
])

export type ProposalType = z.infer<typeof proposalTypeSchema>

/**
 * Status of an evolution proposal
 */
export const proposalStatusSchema = z.enum([
	"pending", // Awaiting review
	"approved", // Approved by council/user
	"rejected", // Rejected by council/user
	"applied", // Successfully applied
	"failed", // Application failed
	"rolled_back", // Applied but rolled back
])

export type ProposalStatus = z.infer<typeof proposalStatusSchema>

/**
 * Risk level for a proposal
 */
export const proposalRiskSchema = z.enum([
	"low", // Safe to auto-apply
	"medium", // Requires assisted review
	"high", // Always requires manual approval
])

export type ProposalRisk = z.infer<typeof proposalRiskSchema>

/**
 * Schema for an evolution proposal
 */
export const evolutionProposalSchema = z.object({
	/** Unique identifier */
	id: z.string(),

	/** Type of proposal */
	type: proposalTypeSchema,

	/** Current status */
	status: proposalStatusSchema,

	/** Risk level */
	risk: proposalRiskSchema,

	/** Human-readable title */
	title: z.string(),

	/** Detailed description of the change */
	description: z.string(),

	/** The actual change payload */
	payload: z.record(z.string(), z.unknown()),

	/** Learning signal that triggered this proposal */
	sourceSignalId: z.string().optional(),

	/** Timestamp when proposal was created */
	createdAt: z.number(),

	/** Timestamp when proposal was last updated */
	updatedAt: z.number(),

	/** User who approved/rejected (if applicable) */
	reviewedBy: z.string().optional(),

	/** Review notes */
	reviewNotes: z.string().optional(),

	/** Rollback data if proposal was applied */
	rollbackData: z.record(z.string(), z.unknown()).optional(),
})

export type EvolutionProposal = z.infer<typeof evolutionProposalSchema>

// =============================================================================
// Council System
// =============================================================================

/**
 * Council member roles
 */
export const councilRoleSchema = z.enum([
	"analyst", // Analyzes traces and patterns
	"reviewer", // Reviews proposals for quality
	"security", // Reviews proposals for safety
	"user", // Human operator
])

export type CouncilRole = z.infer<typeof councilRoleSchema>

/**
 * Vote values for council decisions
 */
export const councilVoteValueSchema = z.enum([
	"approve", // Approve the proposal
	"reject", // Reject the proposal
	"abstain", // No opinion
	"request_changes", // Approve with modifications
])

export type CouncilVoteValue = z.infer<typeof councilVoteValueSchema>

/**
 * Schema for a council vote
 */
export const councilVoteSchema = z.object({
	/** Proposal this vote is for */
	proposalId: z.string(),

	/** Role of the voter */
	role: councilRoleSchema,

	/** The vote itself */
	vote: councilVoteValueSchema,

	/** Reasoning for the vote */
	reason: z.string(),

	/** Timestamp of the vote */
	timestamp: z.number(),

	/** Suggested modifications if vote is request_changes */
	suggestedChanges: z.string().optional(),
})

export type CouncilVote = z.infer<typeof councilVoteSchema>

// =============================================================================
// Skills (Synthesized Capabilities)
// =============================================================================

/**
 * Types of skills that can be synthesized
 */
export const skillTypeSchema = z.enum([
	"mcp_tool", // MCP server tool
	"workflow", // Multi-step workflow
	"pattern", // Code pattern/template
	"rule", // Rule file content
])

export type SkillType = z.infer<typeof skillTypeSchema>

/**
 * Schema for a synthesized skill
 */
export const skillSchema = z.object({
	/** Unique identifier */
	id: z.string(),

	/** Human-readable name */
	name: z.string(),

	/** Type of skill */
	type: skillTypeSchema,

	/** Description of what the skill does */
	description: z.string(),

	/** The skill implementation/definition */
	implementation: z.record(z.string(), z.unknown()),

	/** Usage count */
	usageCount: z.number().default(0),

	/** Success rate (0-1) */
	successRate: z.number().min(0).max(1).optional(),

	/** Whether the skill is active */
	active: z.boolean().default(true),

	/** Timestamp when skill was created */
	createdAt: z.number(),

	/** Source proposal that created this skill */
	sourceProposalId: z.string().optional(),

	/** Tags for categorization */
	tags: z.array(z.string()).optional(),
})

export type Skill = z.infer<typeof skillSchema>

// =============================================================================
// Skill Runtime & Execution (Phase 3)
// =============================================================================

/**
 * Runtime environment for skill execution
 */
export const skillRuntimeSchema = z.enum([
	"typescript", // TypeScript skills (default for MVP)
	"python", // Python skills (future)
	"shell", // Shell scripts (future)
])

export type SkillRuntime = z.infer<typeof skillRuntimeSchema>

/**
 * Skill execution status
 */
export const skillExecutionStatusSchema = z.enum([
	"pending", // Awaiting execution
	"running", // Currently executing
	"completed", // Execution completed successfully
	"failed", // Execution failed
	"timeout", // Execution timed out
])

export type SkillExecutionStatus = z.infer<typeof skillExecutionStatusSchema>

/**
 * Schema for skill execution context
 */
export const skillExecutionContextSchema = z.object({
	/** The skill being executed */
	skillId: z.string(),

	/** Arguments passed to the skill */
	args: z.record(z.string(), z.unknown()).optional(),

	/** Working directory for execution */
	workingDirectory: z.string().optional(),

	/** Environment variables */
	env: z.record(z.string(), z.string()).optional(),

	/** Timeout in milliseconds (default: 30000) */
	timeout: z.number().default(30000),
})

export type SkillExecutionContext = z.infer<typeof skillExecutionContextSchema>

/**
 * Schema for skill execution result
 */
export const skillExecutionResultSchema = z.object({
	/** Execution ID */
	id: z.string(),

	/** Skill ID that was executed */
	skillId: z.string(),

	/** Execution status */
	status: skillExecutionStatusSchema,

	/** Standard output */
	stdout: z.string().optional(),

	/** Standard error */
	stderr: z.string().optional(),

	/** Return value (if any) */
	returnValue: z.unknown().optional(),

	/** Error message (if failed) */
	error: z.string().optional(),

	/** Execution duration in milliseconds */
	durationMs: z.number(),

	/** Timestamp when execution started */
	startedAt: z.number(),

	/** Timestamp when execution completed */
	completedAt: z.number(),
})

export type SkillExecutionResult = z.infer<typeof skillExecutionResultSchema>

// =============================================================================
// Skill Metadata & Storage (Phase 3)
// =============================================================================

/**
 * Skill storage scope
 */
export const skillScopeSchema = z.enum([
	"global", // Available across all projects
	"project", // Project-specific skill
])

export type SkillScope = z.infer<typeof skillScopeSchema>

/**
 * Schema for extended skill metadata
 */
export const skillMetadataSchema = z.object({
	/** Unique identifier */
	id: z.string(),

	/** Human-readable name */
	name: z.string(),

	/** Description of what the skill does */
	description: z.string(),

	/** Type of skill */
	type: skillTypeSchema,

	/** Runtime environment */
	runtime: skillRuntimeSchema.default("typescript"),

	/** Scope (global or project) */
	scope: skillScopeSchema.default("project"),

	/** Path to implementation file relative to skills directory */
	implementationPath: z.string(),

	/** Parameter schema (JSON Schema format) */
	parameters: z.record(z.string(), z.unknown()).optional(),

	/** Tags for categorization and search */
	tags: z.array(z.string()).default([]),

	/** Usage count */
	usageCount: z.number().default(0),

	/** Success count */
	successCount: z.number().default(0),

	/** Failure count */
	failureCount: z.number().default(0),

	/** Success rate (calculated) */
	successRate: z.number().min(0).max(1).optional(),

	/** Whether the skill is active */
	active: z.boolean().default(true),

	/** Version string (semver) */
	version: z.string().default("1.0.0"),

	/** Timestamp when skill was created */
	createdAt: z.number(),

	/** Timestamp when skill was last updated */
	updatedAt: z.number(),

	/** Timestamp when skill was last used */
	lastUsedAt: z.number().optional(),

	/** Source proposal that created this skill */
	sourceProposalId: z.string().optional(),

	/** Author information */
	author: z.string().optional(),

	/** Required permissions (read_file, write_file, network, etc.) */
	permissions: z.array(z.string()).default([]),
})

export type SkillMetadata = z.infer<typeof skillMetadataSchema>

/**
 * Skills index file structure
 */
export const skillsIndexSchema = z.object({
	/** Index file version */
	version: z.string().default("1.0.0"),

	/** Last update timestamp */
	lastUpdated: z.number(),

	/** Array of skill metadata */
	skills: z.array(skillMetadataSchema),
})

export type SkillsIndex = z.infer<typeof skillsIndexSchema>

// =============================================================================
// Skill Templates & Synthesis (Phase 3)
// =============================================================================

/**
 * Template types for skill synthesis
 */
export const skillTemplateTypeSchema = z.enum([
	"file_processor", // Process files/text
	"api_client", // Make API calls
	"data_transformer", // Transform data formats
	"command_runner", // Execute shell commands
	"custom", // Custom template
])

export type SkillTemplateType = z.infer<typeof skillTemplateTypeSchema>

/**
 * Schema for skill templates
 */
export const skillTemplateSchema = z.object({
	/** Template identifier */
	id: z.string(),

	/** Template name */
	name: z.string(),

	/** Template type */
	templateType: skillTemplateTypeSchema,

	/** Runtime the template targets */
	runtime: skillRuntimeSchema,

	/** Description of the template */
	description: z.string(),

	/** Template code with placeholders */
	codeTemplate: z.string(),

	/** Required placeholders in the template */
	placeholders: z.array(
		z.object({
			name: z.string(),
			description: z.string(),
			defaultValue: z.string().optional(),
			required: z.boolean().default(true),
		}),
	),

	/** Default parameters schema */
	defaultParameters: z.record(z.string(), z.unknown()).optional(),

	/** Default permissions required */
	defaultPermissions: z.array(z.string()).default([]),
})

export type SkillTemplate = z.infer<typeof skillTemplateSchema>

/**
 * Skill synthesis request
 */
export const skillSynthesisRequestSchema = z.object({
	/** Name for the new skill */
	name: z.string(),

	/** Description of what the skill should do */
	description: z.string(),

	/** Template to use (or custom) */
	templateId: z.string().optional(),

	/** Placeholder values for template */
	placeholderValues: z.record(z.string(), z.string()).optional(),

	/** Custom code (if not using template) */
	customCode: z.string().optional(),

	/** Target runtime */
	runtime: skillRuntimeSchema.default("typescript"),

	/** Target scope */
	scope: skillScopeSchema.default("project"),

	/** Tags for the skill */
	tags: z.array(z.string()).optional(),

	/** Source learning signal (if synthesized from signal) */
	sourceSignalId: z.string().optional(),
})

export type SkillSynthesisRequest = z.infer<typeof skillSynthesisRequestSchema>

// =============================================================================
// Skill Validation (Phase 3)
// =============================================================================

/**
 * Validation issue severity
 */
export const validationSeveritySchema = z.enum([
	"error", // Must be fixed
	"warning", // Should be fixed
	"info", // Informational
])

export type ValidationSeverity = z.infer<typeof validationSeveritySchema>

/**
 * Schema for a single validation issue
 */
export const validationIssueSchema = z.object({
	/** Issue severity */
	severity: validationSeveritySchema,

	/** Issue code/category */
	code: z.string(),

	/** Human-readable message */
	message: z.string(),

	/** Line number (if applicable) */
	line: z.number().optional(),

	/** Column number (if applicable) */
	column: z.number().optional(),

	/** Suggested fix (if available) */
	suggestion: z.string().optional(),
})

export type ValidationIssue = z.infer<typeof validationIssueSchema>

/**
 * Schema for validation result
 */
export const validationResultSchema = z.object({
	/** Whether validation passed (no errors) */
	valid: z.boolean(),

	/** List of validation issues */
	issues: z.array(validationIssueSchema),

	/** Validation stages completed */
	stagesCompleted: z.array(z.string()),

	/** Stage that failed (if any) */
	failedStage: z.string().optional(),

	/** Total validation time in milliseconds */
	durationMs: z.number(),
})

export type ValidationResult = z.infer<typeof validationResultSchema>

// =============================================================================
// Change Application (Phase 3)
// =============================================================================

/**
 * Types of changes that can be applied
 */
export const changeTypeSchema = z.enum([
	"rule_add", // Add to .kilocoderules
	"rule_update", // Update existing rule
	"mode_override", // Create/update .kilocodemodes entry
	"skill_register", // Register a new skill
	"skill_update", // Update skill metadata
	"config_update", // Update configuration
])

export type ChangeType = z.infer<typeof changeTypeSchema>

/**
 * Schema for a single change to apply
 */
export const changeRecordSchema = z.object({
	/** Unique change ID */
	id: z.string(),

	/** Type of change */
	type: changeTypeSchema,

	/** Target path or identifier */
	target: z.string(),

	/** Content to apply */
	content: z.unknown(),

	/** Previous content (for rollback) */
	previousContent: z.unknown().optional(),

	/** Timestamp when change was applied */
	appliedAt: z.number().optional(),
})

export type ChangeRecord = z.infer<typeof changeRecordSchema>

/**
 * Schema for change applicator result
 */
export const changeApplicatorResultSchema = z.object({
	/** Whether all changes were applied successfully */
	success: z.boolean(),

	/** Number of changes applied */
	appliedCount: z.number(),

	/** Number of changes that failed */
	failedCount: z.number(),

	/** Applied change records */
	appliedChanges: z.array(changeRecordSchema),

	/** Failed change records with error */
	failedChanges: z.array(
		z.object({
			change: changeRecordSchema,
			error: z.string(),
		}),
	),

	/** Rollback data (for reverting all changes) */
	rollbackData: z.array(changeRecordSchema).optional(),
})

export type ChangeApplicatorResult = z.infer<typeof changeApplicatorResultSchema>

// =============================================================================
// Evolution State
// =============================================================================

/**
 * Schema for the overall evolution system state
 */
export const evolutionStateSchema = z.object({
	/** Current configuration */
	config: darwinConfigSchema,

	/** Pending proposals awaiting review */
	pendingProposals: z.array(z.string()), // Proposal IDs

	/** Recently applied proposals */
	appliedProposals: z.array(z.string()), // Proposal IDs

	/** Active skills */
	activeSkills: z.array(z.string()), // Skill IDs

	/** Recent learning signals */
	recentSignals: z.array(z.string()), // Signal IDs

	/** Statistics */
	stats: z.object({
		totalProposals: z.number(),
		approvedProposals: z.number(),
		rejectedProposals: z.number(),
		doomLoopsDetected: z.number(),
		doomLoopsResolved: z.number(),
		skillsCreated: z.number(),
		lastAnalysisTime: z.number().optional(),
	}),

	/** Timestamp of last state update */
	lastUpdated: z.number(),
})

export type EvolutionState = z.infer<typeof evolutionStateSchema>

/**
 * Default evolution state
 */
export const DEFAULT_EVOLUTION_STATE: EvolutionState = {
	config: DEFAULT_DARWIN_CONFIG,
	pendingProposals: [],
	appliedProposals: [],
	activeSkills: [],
	recentSignals: [],
	stats: {
		totalProposals: 0,
		approvedProposals: 0,
		rejectedProposals: 0,
		doomLoopsDetected: 0,
		doomLoopsResolved: 0,
		skillsCreated: 0,
	},
	lastUpdated: Date.now(),
}

// =============================================================================
// Analysis Report
// =============================================================================

/**
 * Schema for an analysis report (output from the Analysis Engine)
 */
export const analysisReportSchema = z.object({
	/** Unique identifier */
	id: z.string(),

	/** Task ID that was analyzed */
	taskId: z.string(),

	/** Detected learning signals */
	signals: z.array(learningSignalSchema),

	/** Generated proposals */
	proposals: z.array(evolutionProposalSchema),

	/** Summary of findings */
	summary: z.string(),

	/** Timestamp of analysis */
	analyzedAt: z.number(),

	/** Analysis method used */
	method: z.enum(["regex", "llm", "hybrid"]),
})

export type AnalysisReport = z.infer<typeof analysisReportSchema>

// =============================================================================
// Phase 4A: Autonomous Execution Engine Types
// =============================================================================

/**
 * Execution decision status for autonomous processing
 */
export const executionDecisionStatusSchema = z.enum([
	"approved", // Proposal can be auto-executed
	"deferred", // Proposal needs further review
	"rejected", // Proposal should not be executed
	"escalated", // Proposal requires human review
])

export type ExecutionDecisionStatus = z.infer<typeof executionDecisionStatusSchema>

/**
 * Schema for an execution decision
 */
export const executionDecisionSchema = z.object({
	/** Proposal ID this decision is for */
	proposalId: z.string(),

	/** Decision status */
	status: executionDecisionStatusSchema,

	/** Risk level assessed for the proposal */
	riskLevel: proposalRiskSchema,

	/** Confidence score for the risk assessment (0-1) */
	confidence: z.number().min(0).max(1),

	/** Reason for the decision */
	reason: z.string(),

	/** Whether the decision was made automatically */
	isAutomatic: z.boolean(),

	/** Timestamp when decision was made */
	decidedAt: z.number(),

	/** Additional context for the decision */
	context: z.record(z.string(), z.unknown()).optional(),
})

export type ExecutionDecision = z.infer<typeof executionDecisionSchema>

/**
 * Risk assessment factors
 */
export const riskFactorSchema = z.object({
	/** Factor name */
	name: z.string(),

	/** Weight of this factor (0-1) */
	weight: z.number().min(0).max(1),

	/** Assessed value for this factor (0-1, 0=low risk, 1=high risk) */
	value: z.number().min(0).max(1),

	/** Explanation for the assessment */
	explanation: z.string(),
})

export type RiskFactor = z.infer<typeof riskFactorSchema>

/**
 * Schema for risk assessment result
 */
export const riskAssessmentResultSchema = z.object({
	/** Proposal ID that was assessed */
	proposalId: z.string(),

	/** Calculated risk level */
	riskLevel: proposalRiskSchema,

	/** Overall risk score (0-1) */
	riskScore: z.number().min(0).max(1),

	/** Confidence in the assessment (0-1) */
	confidence: z.number().min(0).max(1),

	/** Individual risk factors */
	factors: z.array(riskFactorSchema),

	/** Timestamp when assessment was made */
	assessedAt: z.number(),

	/** Recommendations based on assessment */
	recommendations: z.array(z.string()).optional(),
})

export type RiskAssessmentResult = z.infer<typeof riskAssessmentResultSchema>

/**
 * Auto-approval rule for routing proposals
 */
export const autoApprovalRuleSchema = z.object({
	/** Rule ID */
	id: z.string(),

	/** Rule name */
	name: z.string(),

	/** Rule description */
	description: z.string(),

	/** Priority of this rule (lower = higher priority) */
	priority: z.number().default(0),

	/** Whether the rule is active */
	active: z.boolean().default(true),

	/** Conditions for the rule to apply */
	conditions: z.object({
		/** Proposal types this rule applies to */
		proposalTypes: z.array(proposalTypeSchema).optional(),

		/** Maximum risk level for auto-approval */
		maxRiskLevel: proposalRiskSchema.optional(),

		/** Minimum confidence required */
		minConfidence: z.number().min(0).max(1).optional(),

		/** Maximum number of affected files */
		maxAffectedFiles: z.number().optional(),

		/** Required scope (global vs project) */
		scope: skillScopeSchema.optional(),
	}),

	/** Action to take when conditions match */
	action: z.enum(["approve", "defer", "reject", "escalate"]),

	/** Timestamp when rule was created */
	createdAt: z.number(),

	/** Timestamp when rule was last updated */
	updatedAt: z.number(),
})

export type AutoApprovalRule = z.infer<typeof autoApprovalRuleSchema>

/**
 * Execution health metrics for monitoring
 */
export const executionHealthMetricsSchema = z.object({
	/** Total executions today */
	executionsToday: z.number().default(0),

	/** Successful executions today */
	successesToday: z.number().default(0),

	/** Failed executions today */
	failuresToday: z.number().default(0),

	/** Rollbacks today */
	rollbacksToday: z.number().default(0),

	/** Average execution time in milliseconds */
	avgExecutionTimeMs: z.number().default(0),

	/** Current queue size */
	queueSize: z.number().default(0),

	/** Last execution timestamp */
	lastExecutionAt: z.number().optional(),

	/** Last successful execution timestamp */
	lastSuccessAt: z.number().optional(),

	/** Last failure timestamp */
	lastFailureAt: z.number().optional(),

	/** Success rate (0-1) */
	successRate: z.number().min(0).max(1).default(1),

	/** Health status */
	status: z.enum(["healthy", "degraded", "unhealthy"]).default("healthy"),

	/** Last health check timestamp */
	lastHealthCheckAt: z.number(),

	/** Daily execution limit */
	dailyLimit: z.number().default(50),

	/** Remaining executions today */
	remainingToday: z.number().default(50),
})

export type ExecutionHealthMetrics = z.infer<typeof executionHealthMetricsSchema>

/**
 * Configuration for the autonomous executor
 */
export const autonomousExecutorConfigSchema = z.object({
	/** Whether autonomous execution is enabled */
	enabled: z.boolean().default(false),

	/** Autonomy level (0=manual, 1=assisted, 2=auto) */
	autonomyLevel: autonomyLevelSchema.default(0),

	/** Maximum proposals to process per cycle */
	maxPerCycle: z.number().min(1).max(10).default(5),

	/** Daily execution limit */
	dailyLimit: z.number().min(0).max(100).default(50),

	/** Minimum confidence required for auto-approval */
	minConfidence: z.number().min(0).max(1).default(0.8),

	/** Enable dry run mode (no actual changes) */
	dryRun: z.boolean().default(false),

	/** Enable rollback on failure */
	rollbackOnFailure: z.boolean().default(true),

	/** Require council approval for medium+ risk */
	requireCouncilForMediumRisk: z.boolean().default(true),

	/** Custom auto-approval rules */
	customRules: z.array(autoApprovalRuleSchema).default([]),
})

export type AutonomousExecutorConfig = z.infer<typeof autonomousExecutorConfigSchema>

/**
 * Default autonomous executor configuration
 */
export const DEFAULT_AUTONOMOUS_EXECUTOR_CONFIG: AutonomousExecutorConfig = {
	enabled: false,
	autonomyLevel: 0,
	maxPerCycle: 5,
	dailyLimit: 50,
	minConfidence: 0.8,
	dryRun: false,
	rollbackOnFailure: true,
	requireCouncilForMediumRisk: true,
	customRules: [],
}

/**
 * Configuration for the execution scheduler
 */
export const executionSchedulerConfigSchema = z.object({
	/** Whether the scheduler is enabled */
	enabled: z.boolean().default(true),

	/** Interval between scheduler runs in milliseconds */
	intervalMs: z.number().min(10000).max(300000).default(60000), // 60 seconds default

	/** Maximum batch size per run */
	batchSize: z.number().min(1).max(20).default(10),

	/** Priority order for processing */
	priorityOrder: z.enum(["age", "impact", "risk"]).default("age"),

	/** Maximum age in milliseconds before forcing escalation */
	maxAgeMs: z.number().min(60000).default(86400000), // 24 hours default

	/** Quiet hours (no auto-execution) */
	quietHours: z
		.object({
			enabled: z.boolean().default(false),
			startHour: z.number().min(0).max(23).default(22),
			endHour: z.number().min(0).max(23).default(6),
		})
		.optional(),

	/** Enable health monitoring */
	healthMonitoring: z.boolean().default(true),
})

export type ExecutionSchedulerConfig = z.infer<typeof executionSchedulerConfigSchema>

/**
 * Default execution scheduler configuration
 */
export const DEFAULT_EXECUTION_SCHEDULER_CONFIG: ExecutionSchedulerConfig = {
	enabled: true,
	intervalMs: 60000,
	batchSize: 10,
	priorityOrder: "age",
	maxAgeMs: 86400000,
	quietHours: { enabled: false, startHour: 22, endHour: 6 },
	healthMonitoring: true,
}

/**
 * Schema for an execution batch
 */
export const executionBatchSchema = z.object({
	/** Batch ID */
	id: z.string(),

	/** Proposal IDs in this batch */
	proposalIds: z.array(z.string()),

	/** Batch status */
	status: z.enum(["pending", "processing", "completed", "failed"]),

	/** Timestamp when batch was created */
	createdAt: z.number(),

	/** Timestamp when batch started processing */
	startedAt: z.number().optional(),

	/** Timestamp when batch completed */
	completedAt: z.number().optional(),

	/** Results for each proposal */
	results: z
		.array(
			z.object({
				proposalId: z.string(),
				success: z.boolean(),
				error: z.string().optional(),
				executionTimeMs: z.number().optional(),
			}),
		)
		.default([]),

	/** Total execution time in milliseconds */
	totalTimeMs: z.number().optional(),
})

export type ExecutionBatch = z.infer<typeof executionBatchSchema>

/**
 * Extended evolution state with Phase 4A fields
 */
export const evolutionStateWithAutonomySchema = evolutionStateSchema.extend({
	/** Autonomous executor configuration */
	autonomousExecutorConfig: autonomousExecutorConfigSchema.optional(),

	/** Execution scheduler configuration */
	schedulerConfig: executionSchedulerConfigSchema.optional(),

	/** Current execution health metrics */
	healthMetrics: executionHealthMetricsSchema.optional(),

	/** Pending execution batches */
	pendingBatches: z.array(z.string()).default([]),

	/** Completed execution batches (limited history) */
	completedBatches: z.array(z.string()).default([]),

	/** Extended stats for Phase 4A */
	autonomyStats: z
		.object({
			totalAutoApproved: z.number().default(0),
			totalAutoRejected: z.number().default(0),
			totalEscalated: z.number().default(0),
			totalRolledBack: z.number().default(0),
			lastSchedulerRunAt: z.number().optional(),
		})
		.optional(),
})

export type EvolutionStateWithAutonomy = z.infer<typeof evolutionStateWithAutonomySchema>

/**
 * Execution event types for Phase 4A
 */
export const executionEventTypeSchema = z.enum([
	"execution_started",
	"execution_completed",
	"execution_failed",
	"approval_required",
	"proposal_escalated",
	"rollback_started",
	"rollback_completed",
	"scheduler_tick",
	"health_check",
])

export type ExecutionEventType = z.infer<typeof executionEventTypeSchema>

/**
 * Schema for execution events
 */
export const executionEventSchema = z.object({
	/** Event type */
	type: executionEventTypeSchema,

	/** Event timestamp */
	timestamp: z.number(),

	/** Proposal ID (if applicable) */
	proposalId: z.string().optional(),

	/** Batch ID (if applicable) */
	batchId: z.string().optional(),

	/** Event data */
	data: z.record(z.string(), z.unknown()).optional(),
})

export type ExecutionEvent = z.infer<typeof executionEventSchema>

// =============================================================================
// Phase 4B: Multi-Agent Council Types
// =============================================================================

/**
 * Agent roles for multi-agent council
 * Each role represents a specialized reviewer with specific expertise
 */
export const agentRoleSchema = z.enum([
	"analyst", // Technical feasibility and impact analysis
	"reviewer", // Code quality and maintainability review
	"security", // Security implications review
	"performance", // Performance impact assessment
])

export type AgentRole = z.infer<typeof agentRoleSchema>

/**
 * Agent review result from a delegated task
 */
export const agentReviewResultSchema = z.object({
	/** Agent role that performed the review */
	role: agentRoleSchema,

	/** Vote decision */
	vote: councilVoteValueSchema,

	/** Confidence score (0-1) */
	confidence: z.number().min(0).max(1),

	/** Detailed reasoning for the vote */
	reasoning: z.string(),

	/** Suggested improvements (if vote is request_changes) */
	suggestions: z.array(z.string()).optional(),

	/** Issues identified during review */
	issues: z
		.array(
			z.object({
				severity: z.enum(["low", "medium", "high", "critical"]),
				description: z.string(),
			}),
		)
		.optional(),

	/** Duration of review in milliseconds */
	durationMs: z.number(),

	/** Timestamp when review completed */
	completedAt: z.number(),

	/** Error message if review failed */
	error: z.string().optional(),

	/** Task ID of the delegated review task */
	taskId: z.string().optional(),
})

export type AgentReviewResult = z.infer<typeof agentReviewResultSchema>

/**
 * Configuration for the multi-agent council
 */
export const multiAgentCouncilConfigSchema = z.object({
	/** Whether to enable real multi-agent execution */
	enabled: z.boolean().default(false),

	/** Timeout for each agent review in milliseconds */
	agentTimeout: z.number().min(5000).max(600000).default(300000), // 5 min default

	/** Maximum concurrent agents (for future parallel execution) */
	maxConcurrentAgents: z.number().min(1).max(8).default(4),

	/** Agent roles to include in council reviews */
	activeRoles: z.array(agentRoleSchema).default(["analyst", "reviewer", "security", "performance"]),

	/** Mode to use for agent reviews (e.g., 'ask') */
	reviewMode: z.string().default("ask"),

	/** Minimum confidence threshold for valid votes */
	minConfidenceThreshold: z.number().min(0).max(1).default(0.5),

	/** Voting policy: unanimity, majority, or weighted */
	votingPolicy: z.enum(["unanimity", "majority", "weighted"]).default("majority"),

	/** Whether to continue on agent failure */
	continueOnAgentFailure: z.boolean().default(true),

	/** Fallback to simulated council on delegation failure */
	fallbackToSimulated: z.boolean().default(true),
})

export type MultiAgentCouncilConfig = z.infer<typeof multiAgentCouncilConfigSchema>

/**
 * Default multi-agent council configuration
 */
export const DEFAULT_MULTI_AGENT_COUNCIL_CONFIG: MultiAgentCouncilConfig = {
	enabled: false,
	agentTimeout: 300000, // 5 minutes
	maxConcurrentAgents: 4,
	activeRoles: ["analyst", "reviewer", "security", "performance"],
	reviewMode: "ask",
	minConfidenceThreshold: 0.5,
	votingPolicy: "majority",
	continueOnAgentFailure: true,
	fallbackToSimulated: true,
}

/**
 * Status of council execution
 */
export const councilExecutionStatusSchema = z.enum([
	"pending", // Awaiting execution
	"in_progress", // Currently executing agent reviews
	"completed", // All reviews completed
	"failed", // Execution failed
	"timeout", // Execution timed out
	"cancelled", // Execution cancelled
])

export type CouncilExecutionStatus = z.infer<typeof councilExecutionStatusSchema>

/**
 * Schema for tracking council execution
 */
export const councilExecutionSchema = z.object({
	/** Unique execution ID */
	id: z.string(),

	/** Proposal being reviewed */
	proposalId: z.string(),

	/** Execution status */
	status: councilExecutionStatusSchema,

	/** Agent roles being executed */
	roles: z.array(agentRoleSchema),

	/** Individual agent results */
	results: z.array(agentReviewResultSchema),

	/** Which agents are currently executing */
	inProgress: z.array(agentRoleSchema).default([]),

	/** Which agents have completed */
	completed: z.array(agentRoleSchema).default([]),

	/** Which agents failed */
	failed: z.array(agentRoleSchema).default([]),

	/** Timestamp when execution started */
	startedAt: z.number(),

	/** Timestamp when execution completed */
	completedAt: z.number().optional(),

	/** Total duration in milliseconds */
	durationMs: z.number().optional(),

	/** Final aggregated decision */
	decision: z
		.object({
			approved: z.boolean(),
			reason: z.string(),
			totalConfidence: z.number().min(0).max(1),
			voteBreakdown: z.object({
				approve: z.number(),
				reject: z.number(),
				abstain: z.number(),
				requestChanges: z.number(),
			}),
		})
		.optional(),

	/** Error message if execution failed */
	error: z.string().optional(),

	/** Whether execution used fallback to simulated council */
	usedFallback: z.boolean().default(false),
})

export type CouncilExecution = z.infer<typeof councilExecutionSchema>

/**
 * Agent prompt configuration for specialized reviews
 */
export const agentPromptConfigSchema = z.object({
	/** Agent role */
	role: agentRoleSchema,

	/** System prompt for the agent */
	systemPrompt: z.string(),

	/** User prompt template with placeholders */
	userPromptTemplate: z.string(),

	/** Mode to run the agent in */
	mode: z.string().default("ask"),
})

export type AgentPromptConfig = z.infer<typeof agentPromptConfigSchema>

/**
 * Extended Darwin configuration with Phase 4B fields
 */
export const darwinConfigWithMultiAgentSchema = darwinConfigSchema.extend({
	/** Enable real multi-agent council (Phase 4B) */
	enableRealMultiAgent: z.boolean().default(false),

	/** Multi-agent timeout in milliseconds */
	multiAgentTimeout: z.number().min(5000).max(600000).default(300000),

	/** Maximum concurrent agents */
	maxConcurrentAgents: z.number().min(1).max(8).default(4),
})

export type DarwinConfigWithMultiAgent = z.infer<typeof darwinConfigWithMultiAgentSchema>

// =============================================================================
// Phase 4C: LLM-Powered Skill Synthesis Types
// =============================================================================

/**
 * Synthesis strategy for skill generation
 * - template: Use only template-based synthesis (Phase 3)
 * - llm: Use only LLM-powered synthesis
 * - hybrid: Try LLM first, fallback to templates
 */
export const synthesisStrategySchema = z.enum(["template", "llm", "hybrid"])

export type SynthesisStrategy = z.infer<typeof synthesisStrategySchema>

/**
 * Configuration for LLM-powered skill synthesis
 */
export const llmSynthesisConfigSchema = z.object({
	/** Whether LLM synthesis is enabled */
	enabled: z.boolean().default(false),

	/** Synthesis strategy: template, llm, or hybrid */
	strategy: synthesisStrategySchema.default("hybrid"),

	/** Model to use for synthesis (defaults to configured API provider) */
	model: z.string().optional(),

	/** Temperature for LLM generation (0-1, lower = more deterministic) */
	temperature: z.number().min(0).max(1).default(0.3),

	/** Maximum tokens for LLM response */
	maxTokens: z.number().min(100).max(16000).default(4000),

	/** Maximum retries for LLM API calls */
	maxRetries: z.number().min(0).max(5).default(3),

	/** Maximum refinement attempts if validation fails */
	maxRefinementAttempts: z.number().min(0).max(5).default(3),

	/** API config ID to use for synthesis (uses default if not set) */
	apiConfigId: z.string().optional(),

	/** Enable cost tracking for synthesis operations */
	trackCosts: z.boolean().default(true),

	/** Maximum cost per synthesis in USD (safety limit) */
	maxCostPerSynthesis: z.number().min(0).default(0.1),

	/** Cache successful prompts for similar problems */
	enablePromptCaching: z.boolean().default(true),

	/** Timeout for each LLM call in milliseconds */
	timeoutMs: z.number().min(5000).max(120000).default(30000),
})

export type LLMSynthesisConfig = z.infer<typeof llmSynthesisConfigSchema>

/**
 * Default LLM synthesis configuration
 */
export const DEFAULT_LLM_SYNTHESIS_CONFIG: LLMSynthesisConfig = {
	enabled: false,
	strategy: "hybrid",
	temperature: 0.3,
	maxTokens: 4000,
	maxRetries: 3,
	maxRefinementAttempts: 3,
	apiConfigId: undefined,
	trackCosts: true,
	maxCostPerSynthesis: 0.1,
	enablePromptCaching: true,
	timeoutMs: 30000,
}

/**
 * Context for LLM synthesis from doom loop or capability gap
 */
export const synthesisContextSchema = z.object({
	/** The tool that failed or is missing */
	toolName: z.string().optional(),

	/** Error messages from the doom loop */
	errorMessages: z.array(z.string()).default([]),

	/** Stack traces from failures */
	stackTraces: z.array(z.string()).default([]),

	/** Previously attempted fixes that didn't work */
	attemptedFixes: z.array(z.string()).default([]),

	/** Relevant code snippets from the workspace */
	fileContext: z
		.array(
			z.object({
				path: z.string(),
				content: z.string(),
				lineRange: z.tuple([z.number(), z.number()]).optional(),
			}),
		)
		.default([]),

	/** Error patterns detected */
	errorPatterns: z.array(z.string()).default([]),

	/** Number of times the problem has occurred */
	occurrenceCount: z.number().default(1),

	/** Trace event IDs related to this context */
	traceEventIds: z.array(z.string()).default([]),

	/** User's original intent/task description */
	userIntent: z.string().optional(),

	/** Workspace/project type (e.g., 'react', 'node', 'python') */
	projectType: z.string().optional(),

	/** Additional context metadata */
	metadata: z.record(z.string(), z.unknown()).optional(),
})

export type SynthesisContext = z.infer<typeof synthesisContextSchema>

/**
 * Test case generated by LLM for the synthesized skill
 */
export const synthesisTestCaseSchema = z.object({
	/** Test case name/description */
	name: z.string(),

	/** Input for the test */
	input: z.record(z.string(), z.unknown()),

	/** Expected output or behavior */
	expectedOutput: z.record(z.string(), z.unknown()).optional(),

	/** Expected error (if testing error handling) */
	expectsError: z.boolean().default(false),

	/** Assertion description */
	assertion: z.string(),
})

export type SynthesisTestCase = z.infer<typeof synthesisTestCaseSchema>

/**
 * Result from LLM skill synthesis
 */
export const llmSynthesisResultSchema = z.object({
	/** Whether synthesis succeeded */
	success: z.boolean(),

	/** Generated TypeScript code */
	code: z.string().optional(),

	/** LLM's explanation of the solution approach */
	explanation: z.string().optional(),

	/** Generated test cases */
	testCases: z.array(synthesisTestCaseSchema).default([]),

	/** Suggested skill name */
	suggestedName: z.string().optional(),

	/** Suggested skill description */
	suggestedDescription: z.string().optional(),

	/** Required permissions for the skill */
	requiredPermissions: z.array(z.string()).default([]),

	/** Error message if synthesis failed */
	error: z.string().optional(),

	/** Number of refinement attempts made */
	refinementAttempts: z.number().default(0),

	/** Total tokens used */
	tokensUsed: z.number().optional(),

	/** Estimated cost in USD */
	costUsd: z.number().optional(),

	/** Duration of synthesis in milliseconds */
	durationMs: z.number().optional(),

	/** Model used for synthesis */
	modelUsed: z.string().optional(),

	/** Fallback strategy used (if any) */
	fallbackUsed: z.enum(["template", "none"]).optional(),

	/** Validation issues from refinement attempts */
	validationHistory: z
		.array(
			z.object({
				attempt: z.number(),
				issues: z.array(z.string()),
			}),
		)
		.default([]),
})

export type LLMSynthesisResult = z.infer<typeof llmSynthesisResultSchema>

/**
 * Prompt template configuration for LLM synthesis
 */
export const synthesisPromptConfigSchema = z.object({
	/** System prompt for the LLM */
	systemPrompt: z.string().optional(),

	/** Additional constraints to include in prompt */
	constraints: z.array(z.string()).default([]),

	/** Example code patterns to include */
	examplePatterns: z.array(z.string()).default([]),

	/** Whether to include security warnings */
	includeSecurityWarnings: z.boolean().default(true),

	/** Whether to request test cases */
	requestTestCases: z.boolean().default(true),

	/** Maximum context lines to include per file */
	maxContextLines: z.number().default(100),
})

export type SynthesisPromptConfig = z.infer<typeof synthesisPromptConfigSchema>

/**
 * Synthesis metrics for tracking and cost management
 */
export const synthesisMetricsSchema = z.object({
	/** Total synthesis attempts */
	totalAttempts: z.number().default(0),

	/** Successful syntheses */
	successfulSyntheses: z.number().default(0),

	/** Failed syntheses */
	failedSyntheses: z.number().default(0),

	/** Syntheses that fell back to templates */
	templateFallbacks: z.number().default(0),

	/** Total tokens consumed */
	totalTokens: z.number().default(0),

	/** Total cost in USD */
	totalCostUsd: z.number().default(0),

	/** Average synthesis time in milliseconds */
	avgSynthesisTimeMs: z.number().default(0),

	/** Average refinement attempts per synthesis */
	avgRefinementAttempts: z.number().default(0),

	/** Last synthesis timestamp */
	lastSynthesisAt: z.number().optional(),

	/** Syntheses today (for rate limiting) */
	synthesesToday: z.number().default(0),

	/** Last date reset (for daily limits) */
	lastResetDate: z.string().optional(),
})

export type SynthesisMetrics = z.infer<typeof synthesisMetricsSchema>

/**
 * Extended Darwin configuration with Phase 4C LLM synthesis fields
 */
export const darwinConfigWithLLMSynthesisSchema = darwinConfigWithMultiAgentSchema.extend({
	/** LLM synthesis configuration */
	llmSynthesis: llmSynthesisConfigSchema.optional(),
})

export type DarwinConfigWithLLMSynthesis = z.infer<typeof darwinConfigWithLLMSynthesisSchema>

/**
 * Extended evolution state with Phase 4C fields
 */
export const evolutionStateWithLLMSynthesisSchema = evolutionStateSchema.extend({
	/** LLM synthesis configuration */
	llmSynthesisConfig: llmSynthesisConfigSchema.optional(),

	/** Synthesis metrics */
	synthesisMetrics: synthesisMetricsSchema.optional(),

	/** Cached prompt patterns for reuse */
	promptCache: z
		.array(
			z.object({
				problemHash: z.string(),
				prompt: z.string(),
				success: z.boolean(),
				createdAt: z.number(),
			}),
		)
		.default([]),
})

export type EvolutionStateWithLLMSynthesis = z.infer<typeof evolutionStateWithLLMSynthesisSchema>
