/**
 * Application Module - Darwin Evolution System Phase 3
 *
 * This module handles the application of approved evolution proposals.
 * It creates backups, applies changes, and provides rollback capability.
 *
 * Components:
 * - ChangeApplicator: Apply approved proposals to the system
 */

export { ChangeApplicator } from "./ChangeApplicator"
export type { ChangeApplicatorConfig } from "./ChangeApplicator"

// Re-export change application types
export type { ChangeType, ChangeRecord, ChangeApplicatorResult } from "../types"
