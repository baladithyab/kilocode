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
