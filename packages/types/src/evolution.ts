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
})

export type DarwinConfig = z.infer<typeof darwinConfigSchema>

/**
 * Default Darwin configuration
 */
export const DEFAULT_DARWIN_CONFIG: DarwinConfig = {
	enabled: false,
	autonomyLevel: 0,
	traceCapture: true,
	doomLoopThreshold: 3,
	skillSynthesis: false,
	configEvolution: false,
	councilEnabled: true,
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
	metadata: traceEventMetadataSchema.optional(),

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
// Skill Execution & Runtime (Phase 3)
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
