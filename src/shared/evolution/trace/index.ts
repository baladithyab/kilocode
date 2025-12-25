/**
 * Darwin Evolution Trace Module
 *
 * Exports trace capture and storage functionality for the Darwin evolution system.
 */

// Storage
export { TraceStorage, type TraceStorageConfig } from "./TraceStorage"

// Capture
export {
	TraceCapture,
	type TraceFilter,
	type TraceCaptureOptions,
	getTraceCapture,
	resetTraceCapture,
} from "./TraceCapture"
