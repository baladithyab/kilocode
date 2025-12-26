/**
 * Darwin Evolution System - Autonomy Module (Phase 4A)
 *
 * This module provides autonomous execution capabilities for the Darwin
 * evolution system, including risk assessment, auto-approval, and
 * background scheduling.
 */

// Export RiskAssessor
export { RiskAssessor, type RiskAssessorConfig, type RiskHistoryData } from "./RiskAssessor"

// Export AutonomousExecutor
export {
	AutonomousExecutor,
	type ExecutionResult,
	type BatchExecutionResult,
	type ExecutionEventListener,
} from "./AutonomousExecutor"

// Export ExecutionScheduler
export {
	ExecutionScheduler,
	type SchedulerStatus,
	type SchedulerEventListener,
	type SchedulerStats,
} from "./ExecutionScheduler"
