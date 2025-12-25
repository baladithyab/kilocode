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

// Export main service
export { DarwinService } from "./DarwinService"
