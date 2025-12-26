/**
 * Skills Module - Darwin Evolution System Phase 3
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
 */

export { SkillLibrary } from "./SkillLibrary"
export type { SkillLibraryConfig } from "./SkillLibrary"

export { SkillValidator } from "./SkillValidator"
export type { SkillValidatorConfig, DangerousPattern } from "./SkillValidator"

export { SkillExecutor } from "./SkillExecutor"
export type { SkillExecutorConfig } from "./SkillExecutor"

export { SkillSynthesizer } from "./SkillSynthesizer"
export type { SkillSynthesizerConfig } from "./SkillSynthesizer"

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
} from "../types"
