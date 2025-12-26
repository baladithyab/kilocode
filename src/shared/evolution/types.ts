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

	// Council - Base
	CouncilRole,
	CouncilVoteValue,
	CouncilVote,

	// Council - Phase 4B: Multi-Agent
	AgentRole,
	AgentReviewResult,
	MultiAgentCouncilConfig,
	CouncilExecutionStatus,
	CouncilExecution,
	AgentPromptConfig,
	DarwinConfigWithMultiAgent,

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

	// Skills - Phase 4C: LLM Synthesis
	SynthesisStrategy,
	LLMSynthesisConfig,
	SynthesisContext,
	SynthesisTestCase,
	LLMSynthesisResult,
	SynthesisPromptConfig,
	SynthesisMetrics,
	DarwinConfigWithLLMSynthesis,
	EvolutionStateWithLLMSynthesis,

	// Change Application (Phase 3)
	ChangeType,
	ChangeRecord,
	ChangeApplicatorResult,

	// State
	EvolutionState,

	// Analysis
	AnalysisReport,

	// Phase 4A: Autonomous Execution
	ExecutionDecisionStatus,
	ExecutionDecision,
	RiskFactor,
	RiskAssessmentResult,
	AutoApprovalRule,
	ExecutionHealthMetrics,
	AutonomousExecutorConfig,
	ExecutionSchedulerConfig,
	ExecutionBatch,
	EvolutionStateWithAutonomy,
	ExecutionEventType,
	ExecutionEvent,
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

	// Schemas - Council Base
	councilRoleSchema,
	councilVoteValueSchema,
	councilVoteSchema,

	// Schemas - Council Phase 4B: Multi-Agent
	agentRoleSchema,
	agentReviewResultSchema,
	multiAgentCouncilConfigSchema,
	councilExecutionStatusSchema,
	councilExecutionSchema,
	agentPromptConfigSchema,
	darwinConfigWithMultiAgentSchema,

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

	// Schemas - Phase 4C: LLM Synthesis
	synthesisStrategySchema,
	llmSynthesisConfigSchema,
	synthesisContextSchema,
	synthesisTestCaseSchema,
	llmSynthesisResultSchema,
	synthesisPromptConfigSchema,
	synthesisMetricsSchema,
	darwinConfigWithLLMSynthesisSchema,
	evolutionStateWithLLMSynthesisSchema,

	// Schemas - Change Application (Phase 3)
	changeTypeSchema,
	changeRecordSchema,
	changeApplicatorResultSchema,

	// Schemas - State & Analysis
	evolutionStateSchema,
	analysisReportSchema,

	// Schemas - Phase 4A: Autonomous Execution
	executionDecisionStatusSchema,
	executionDecisionSchema,
	riskFactorSchema,
	riskAssessmentResultSchema,
	autoApprovalRuleSchema,
	executionHealthMetricsSchema,
	autonomousExecutorConfigSchema,
	executionSchedulerConfigSchema,
	executionBatchSchema,
	evolutionStateWithAutonomySchema,
	executionEventTypeSchema,
	executionEventSchema,

	// Constants
	AUTONOMY_LABELS,
	DEFAULT_DARWIN_CONFIG,
	DEFAULT_EVOLUTION_STATE,
	DEFAULT_AUTONOMOUS_EXECUTOR_CONFIG,
	DEFAULT_EXECUTION_SCHEDULER_CONFIG,
	DEFAULT_MULTI_AGENT_COUNCIL_CONFIG,
	DEFAULT_LLM_SYNTHESIS_CONFIG,
} from "@roo-code/types"
