/**
 * Re-export evolution types from @roo-code/types
 *
 * This file provides a convenient re-export of all evolution-related types
 * for use within the src/ directory.
 */

export type {
	// Autonomy
	AutonomyLevel,

	// Configuration
	DarwinConfig,

	// Trace Events
	TraceEventType,
	TraceEvent,

	// Learning Signals
	LearningSignalType,
	LearningSignal,

	// Proposals
	ProposalType,
	ProposalStatus,
	ProposalRisk,
	EvolutionProposal,

	// Council
	CouncilRole,
	CouncilVoteValue,
	CouncilVote,

	// Skills - Base
	SkillType,
	Skill,

	// Skills - Execution (Phase 3)
	SkillRuntime,
	SkillExecutionStatus,
	SkillExecutionContext,
	SkillExecutionResult,

	// Skills - Metadata & Storage (Phase 3)
	SkillScope,
	SkillMetadata,
	SkillsIndex,

	// Skills - Templates & Synthesis (Phase 3)
	SkillTemplateType,
	SkillTemplate,
	SkillSynthesisRequest,

	// Skills - Validation (Phase 3)
	ValidationSeverity,
	ValidationIssue,
	ValidationResult,

	// Change Application (Phase 3)
	ChangeType,
	ChangeRecord,
	ChangeApplicatorResult,

	// State
	EvolutionState,

	// Analysis
	AnalysisReport,
} from "@roo-code/types"

// Re-export schemas and constants
export {
	// Schemas - Autonomy & Config
	autonomyLevelSchema,
	darwinConfigSchema,

	// Schemas - Trace Events
	traceEventTypeSchema,
	traceEventMetadataSchema,
	traceEventSchema,

	// Schemas - Learning Signals
	learningSignalTypeSchema,
	learningSignalSchema,

	// Schemas - Proposals
	proposalTypeSchema,
	proposalStatusSchema,
	proposalRiskSchema,
	evolutionProposalSchema,

	// Schemas - Council
	councilRoleSchema,
	councilVoteValueSchema,
	councilVoteSchema,

	// Schemas - Skills Base
	skillTypeSchema,
	skillSchema,

	// Schemas - Skills Execution (Phase 3)
	skillRuntimeSchema,
	skillExecutionStatusSchema,
	skillExecutionContextSchema,
	skillExecutionResultSchema,

	// Schemas - Skills Metadata (Phase 3)
	skillScopeSchema,
	skillMetadataSchema,
	skillsIndexSchema,

	// Schemas - Skills Templates (Phase 3)
	skillTemplateTypeSchema,
	skillTemplateSchema,
	skillSynthesisRequestSchema,

	// Schemas - Validation (Phase 3)
	validationSeveritySchema,
	validationIssueSchema,
	validationResultSchema,

	// Schemas - Change Application (Phase 3)
	changeTypeSchema,
	changeRecordSchema,
	changeApplicatorResultSchema,

	// Schemas - State & Analysis
	evolutionStateSchema,
	analysisReportSchema,

	// Constants
	AUTONOMY_LABELS,
	DEFAULT_DARWIN_CONFIG,
	DEFAULT_EVOLUTION_STATE,
} from "@roo-code/types"
