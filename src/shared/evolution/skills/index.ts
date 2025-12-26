/**
 * Skills Module - Darwin Evolution System Phase 3 & 4C
 *
 * This module provides the skills library infrastructure for Darwin's
 * self-improvement capabilities. Skills are synthesized scripts that
 * extend Kilocode's capabilities without bloating the context window.
 *
 * Components:
 * - SkillLibrary: Storage and indexing of skills
 * - SkillValidator: Syntax and security validation
 * - SkillExecutor: Runtime execution
 * - SkillSynthesizer: Template-based skill generation
 * - LLMSkillSynthesizer: LLM-powered skill generation (Phase 4C)
 */

export { SkillLibrary } from "./SkillLibrary"
export type { SkillLibraryConfig } from "./SkillLibrary"

export { SkillValidator } from "./SkillValidator"
export type { SkillValidatorConfig, DangerousPattern } from "./SkillValidator"

export { SkillExecutor } from "./SkillExecutor"
export type { SkillExecutorConfig } from "./SkillExecutor"

export { SkillSynthesizer } from "./SkillSynthesizer"
export type { SkillSynthesizerConfig, SynthesisResult } from "./SkillSynthesizer"

export { LLMSkillSynthesizer } from "./LLMSkillSynthesizer"
export type { LLMSkillSynthesizerConfig, LLMApiProvider } from "./LLMSkillSynthesizer"

// Re-export skill-related types
export type {
	SkillType,
	Skill,
	SkillRuntime,
	SkillExecutionStatus,
	SkillExecutionContext,
	SkillExecutionResult,
	SkillScope,
	SkillMetadata,
	SkillsIndex,
	SkillTemplateType,
	SkillTemplate,
	SkillSynthesisRequest,
	ValidationSeverity,
	ValidationIssue,
	ValidationResult,
	// Phase 4C types
	SynthesisStrategy,
	SynthesisContext,
	LLMSynthesisConfig,
	LLMSynthesisResult,
	SynthesisTestCase,
	SynthesisPromptConfig,
	SynthesisMetrics,
} from "../types"
