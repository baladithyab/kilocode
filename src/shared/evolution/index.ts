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
