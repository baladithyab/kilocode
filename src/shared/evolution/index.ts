/**
 * Darwin Evolution System
 *
 * Public exports for the evolution system that enables Kilocode to detect
 * failures, propose fixes, and evolve through a council of agents.
 */

// Re-export types from packages/types
export * from "./types"

// Export config utilities
export { DarwinConfig, getDarwinConfig, validateDarwinConfig } from "./config/DarwinConfig"

// Export trace capture and storage
export {
	TraceCapture,
	TraceStorage,
	getTraceCapture,
	resetTraceCapture,
	type TraceFilter,
	type TraceCaptureOptions,
	type TraceStorageConfig,
} from "./trace"

// Export pattern detection and analysis
export { PatternDetector, type PatternDetectorConfig } from "./analysis"

// Export proposal generation
export { ProposalGenerator, type ProposalGeneratorOptions } from "./proposals"

// Export state management
export { StateManager, type StateManagerConfig } from "./state"

// Export evolution engine
export {
	EvolutionEngine,
	type EvolutionEngineConfig,
	type EvolutionEvent,
	type EvolutionEventType,
	type EvolutionEventListener,
} from "./core"

// Export council system
export { Council, type CouncilDecision, type CouncilConfig, type VotingPolicy } from "./council"

// Export skills library (Phase 3)
export {
	SkillLibrary,
	SkillValidator,
	SkillExecutor,
	SkillSynthesizer,
	type SkillLibraryConfig,
	type SkillValidatorConfig,
	type SkillExecutorConfig,
	type SkillSynthesizerConfig,
	type DangerousPattern,
} from "./skills"

// Export change application (Phase 3)
export { ChangeApplicator, type ChangeApplicatorConfig } from "./application"

// Export main service
export { DarwinService } from "./DarwinService"
