/**
 * Evolution Layer Self-Healing
 *
 * This module implements self-healing capabilities for the Evolution Layer.
 * It tracks applied proposal effectiveness, detects performance degradation,
 * automatically reverts changes that cause issues, and maintains audit logs.
 *
 * @module
 */

import { mkdir, readFile, writeFile, readdir, rm, rename } from "node:fs/promises"
import * as path from "node:path"

import YAML from "yaml"

import { fileExists } from "./fs"

/**
 * Metrics tracked for effectiveness evaluation
 */
export interface PerformanceMetrics {
	/** Success rate of tasks (0-1) */
	successRate: number
	/** Average cost per task */
	averageCost: number
	/** Average duration per task (ms) */
	averageDurationMs: number
	/** Number of tasks in sample */
	taskCount: number
	/** Timestamp of measurement */
	timestamp: string
}

/**
 * A proposal application record with before/after metrics
 */
export interface ProposalApplication {
	/** Unique identifier for this application */
	id: string
	/** Reference to the proposal that was applied */
	proposalId: string
	/** Path to the proposal directory */
	proposalPath: string
	/** Files that were changed */
	changedFiles: string[]
	/** Metrics before the proposal was applied */
	beforeMetrics: PerformanceMetrics
	/** Metrics after the proposal was applied (updated over time) */
	afterMetrics?: PerformanceMetrics
	/** When the proposal was applied */
	appliedAt: string
	/** Current status of this application */
	status: ProposalApplicationStatus
	/** Whether this application has been rolled back */
	rolledBack: boolean
	/** Rollback reason if rolled back */
	rollbackReason?: string
	/** When this was rolled back */
	rolledBackAt?: string
	/** Backup paths for rollback */
	backupPaths: Record<string, string>
}

/**
 * Status of a proposal application
 */
export type ProposalApplicationStatus =
	/** Just applied, monitoring for effects */
	| "monitoring"
	/** Confirmed as effective */
	| "effective"
	/** Detected as causing degradation */
	| "degraded"
	/** Has been rolled back */
	| "rolled-back"
	/** Manual review required */
	| "needs-review"

/**
 * Degradation detection result
 */
export interface DegradationDetectionResult {
	/** Whether degradation was detected */
	degraded: boolean
	/** Severity of degradation (0-100) */
	severity: number
	/** Specific metrics that degraded */
	degradedMetrics: DegradedMetric[]
	/** Recommendation */
	recommendation: "rollback" | "monitor" | "ignore"
	/** Explanation */
	explanation: string
}

/**
 * A specific metric that showed degradation
 */
export interface DegradedMetric {
	/** Name of the metric */
	name: string
	/** Value before the change */
	before: number
	/** Value after the change */
	after: number
	/** Percentage change */
	changePercent: number
	/** Whether this is a significant change */
	significant: boolean
}

/**
 * Rollback action record for audit trail
 */
export interface RollbackAction {
	/** Unique identifier for this rollback */
	id: string
	/** The application that was rolled back */
	applicationId: string
	/** When the rollback occurred */
	timestamp: string
	/** Reason for rollback */
	reason: string
	/** Files that were restored */
	restoredFiles: string[]
	/** Whether the rollback was automatic or manual */
	automatic: boolean
	/** Who/what triggered the rollback */
	triggeredBy: string
	/** Result of the rollback */
	result: "success" | "partial" | "failed"
	/** Error message if failed */
	error?: string
}

/**
 * Self-healing configuration
 */
export interface SelfHealingConfig {
	/** Whether self-healing is enabled */
	enabled: boolean
	/** Maximum rollbacks per day to prevent excessive changes */
	maxDailyRollbacks: number
	/** Monitoring period after applying proposals (ms) */
	monitoringPeriodMs: number
	/** Minimum task count before evaluating effectiveness */
	minTasksForEvaluation: number
	/** Thresholds for degradation detection */
	thresholds: DegradationThresholds
	/** Backup retention period (days) */
	backupRetentionDays: number
}

/**
 * Thresholds for determining degradation
 */
export interface DegradationThresholds {
	/** Maximum allowed decrease in success rate (percentage points) */
	successRateDropPercent: number
	/** Maximum allowed increase in average cost (percentage) */
	costIncreasePercent: number
	/** Maximum allowed increase in duration (percentage) */
	durationIncreasePercent: number
}

/**
 * Default self-healing configuration
 */
export const DEFAULT_SELF_HEALING_CONFIG: SelfHealingConfig = {
	enabled: true,
	maxDailyRollbacks: 3,
	monitoringPeriodMs: 24 * 60 * 60 * 1000, // 24 hours
	minTasksForEvaluation: 5,
	thresholds: {
		successRateDropPercent: 10, // 10 percentage points drop
		costIncreasePercent: 30, // 30% increase
		durationIncreasePercent: 50, // 50% increase
	},
	backupRetentionDays: 30,
}

/**
 * State for rate limiting rollbacks
 */
export interface RollbackRateLimitState {
	/** Count of rollbacks today */
	dailyRollbackCount: number
	/** Date of count (YYYY-MM-DD) */
	dailyRollbackDate: string | null
	/** Timestamp of last rollback */
	lastRollbackTimestamp: number | null
}

/**
 * Default rate limit state
 */
export const DEFAULT_ROLLBACK_RATE_LIMIT_STATE: RollbackRateLimitState = {
	dailyRollbackCount: 0,
	dailyRollbackDate: null,
	lastRollbackTimestamp: null,
}

/**
 * Get current date as YYYY-MM-DD
 */
function getCurrentDateString(now: Date = new Date()): string {
	return now.toISOString().split("T")[0]
}

/**
 * Generate a unique ID
 */
function generateId(): string {
	return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Calculate percentage change between two values
 *
 * @param before - Value before
 * @param after - Value after
 * @returns Percentage change (positive = increase)
 */
export function calculatePercentChange(before: number, after: number): number {
	if (before === 0) {
		return after === 0 ? 0 : 100
	}
	return ((after - before) / before) * 100
}

/**
 * Detect performance degradation by comparing before/after metrics
 *
 * @param before - Metrics before the change
 * @param after - Metrics after the change
 * @param thresholds - Thresholds for determining degradation
 * @returns Degradation detection result
 */
export function detectDegradation(
	before: PerformanceMetrics,
	after: PerformanceMetrics,
	thresholds: DegradationThresholds = DEFAULT_SELF_HEALING_CONFIG.thresholds,
): DegradationDetectionResult {
	const degradedMetrics: DegradedMetric[] = []

	// Check success rate (lower is worse)
	const successRateChange = (after.successRate - before.successRate) * 100 // Convert to percentage points
	if (successRateChange < -thresholds.successRateDropPercent) {
		degradedMetrics.push({
			name: "successRate",
			before: before.successRate,
			after: after.successRate,
			changePercent: successRateChange,
			significant: true,
		})
	}

	// Check cost (higher is worse)
	const costChange = calculatePercentChange(before.averageCost, after.averageCost)
	if (costChange > thresholds.costIncreasePercent) {
		degradedMetrics.push({
			name: "averageCost",
			before: before.averageCost,
			after: after.averageCost,
			changePercent: costChange,
			significant: true,
		})
	}

	// Check duration (higher is worse)
	const durationChange = calculatePercentChange(before.averageDurationMs, after.averageDurationMs)
	if (durationChange > thresholds.durationIncreasePercent) {
		degradedMetrics.push({
			name: "averageDurationMs",
			before: before.averageDurationMs,
			after: after.averageDurationMs,
			changePercent: durationChange,
			significant: true,
		})
	}

	const significantDegradations = degradedMetrics.filter((m) => m.significant)
	const degraded = significantDegradations.length > 0

	// Calculate severity (0-100 based on how many thresholds exceeded and by how much)
	let severity = 0
	if (degraded) {
		for (const metric of significantDegradations) {
			if (metric.name === "successRate") {
				severity += Math.min(50, Math.abs(metric.changePercent) * 5) // Max 50 from success rate
			} else {
				severity += Math.min(25, Math.abs(metric.changePercent) / 2) // Max 25 each from cost/duration
			}
		}
		severity = Math.min(100, severity)
	}

	// Determine recommendation
	let recommendation: "rollback" | "monitor" | "ignore"
	let explanation: string

	if (severity >= 50) {
		recommendation = "rollback"
		explanation = `Significant degradation detected (severity: ${severity}/100). Immediate rollback recommended.`
	} else if (severity > 0) {
		recommendation = "monitor"
		explanation = `Minor degradation detected (severity: ${severity}/100). Continue monitoring.`
	} else {
		recommendation = "ignore"
		explanation = "No significant degradation detected."
	}

	return {
		degraded,
		severity,
		degradedMetrics,
		recommendation,
		explanation,
	}
}

/**
 * Check if rollback is allowed based on rate limits
 *
 * @param state - Current rate limit state
 * @param config - Self-healing configuration
 * @param now - Current time
 * @returns Whether rollback is allowed and reason if not
 */
export function checkRollbackRateLimit(
	state: RollbackRateLimitState,
	config: SelfHealingConfig,
	now: Date = new Date(),
): { allowed: boolean; reason?: string } {
	const currentDate = getCurrentDateString(now)

	// Reset count if it's a new day
	const dailyCount = state.dailyRollbackDate === currentDate ? state.dailyRollbackCount : 0

	if (dailyCount >= config.maxDailyRollbacks) {
		return {
			allowed: false,
			reason: `Daily rollback limit reached (${config.maxDailyRollbacks} per day)`,
		}
	}

	return { allowed: true }
}

/**
 * Update rate limit state after a rollback
 *
 * @param state - Current state
 * @param now - Current time
 * @returns Updated state
 */
export function updateRollbackRateLimitState(
	state: RollbackRateLimitState,
	now: Date = new Date(),
): RollbackRateLimitState {
	const currentDate = getCurrentDateString(now)
	const dailyCount = state.dailyRollbackDate === currentDate ? state.dailyRollbackCount + 1 : 1

	return {
		dailyRollbackCount: dailyCount,
		dailyRollbackDate: currentDate,
		lastRollbackTimestamp: now.getTime(),
	}
}

/**
 * Paths for self-healing data
 */
export const SELF_HEALING_DATA_PATH = path.join(".kilocode", "evolution", "self-healing")
export const APPLICATIONS_FILE = "applications.json"
export const ROLLBACK_LOG_FILE = "rollback-log.json"
export const BACKUPS_DIR = "backups"
export const CONFIG_FILE = "config.yaml"

/**
 * Self-healing manager for tracking and rolling back proposal applications
 */
export class SelfHealingManager {
	private projectRoot: string
	private config: SelfHealingConfig
	private applications: ProposalApplication[] = []
	private rollbackLog: RollbackAction[] = []
	private rateLimitState: RollbackRateLimitState = DEFAULT_ROLLBACK_RATE_LIMIT_STATE
	private dataPath: string

	constructor(projectRoot: string, config: SelfHealingConfig = DEFAULT_SELF_HEALING_CONFIG) {
		this.projectRoot = projectRoot
		this.config = config
		this.dataPath = path.join(projectRoot, SELF_HEALING_DATA_PATH)
	}

	/**
	 * Initialize manager and load existing state
	 */
	async initialize(): Promise<void> {
		await mkdir(this.dataPath, { recursive: true })
		await mkdir(path.join(this.dataPath, BACKUPS_DIR), { recursive: true })

		// Load existing applications
		const applicationsPath = path.join(this.dataPath, APPLICATIONS_FILE)
		if (await fileExists(applicationsPath)) {
			try {
				const content = await readFile(applicationsPath, "utf8")
				this.applications = JSON.parse(content)
			} catch {
				this.applications = []
			}
		}

		// Load rollback log
		const rollbackLogPath = path.join(this.dataPath, ROLLBACK_LOG_FILE)
		if (await fileExists(rollbackLogPath)) {
			try {
				const content = await readFile(rollbackLogPath, "utf8")
				this.rollbackLog = JSON.parse(content)
			} catch {
				this.rollbackLog = []
			}
		}

		// Load config if exists
		const configPath = path.join(this.dataPath, CONFIG_FILE)
		if (await fileExists(configPath)) {
			try {
				const content = await readFile(configPath, "utf8")
				const loaded = YAML.parse(content)
				this.config = { ...this.config, ...loaded }
			} catch {
				// Use defaults
			}
		}
	}

	/**
	 * Save state to disk
	 */
	private async saveState(): Promise<void> {
		await writeFile(path.join(this.dataPath, APPLICATIONS_FILE), JSON.stringify(this.applications, null, 2))
		await writeFile(path.join(this.dataPath, ROLLBACK_LOG_FILE), JSON.stringify(this.rollbackLog, null, 2))
	}

	/**
	 * Create a backup of files before applying a proposal
	 *
	 * @param files - File paths relative to project root
	 * @param applicationId - ID of the application
	 * @returns Map of original path to backup path
	 */
	async createBackup(files: string[], applicationId: string): Promise<Record<string, string>> {
		const backupDir = path.join(this.dataPath, BACKUPS_DIR, applicationId)
		await mkdir(backupDir, { recursive: true })

		const backupPaths: Record<string, string> = {}

		for (const filePath of files) {
			const absPath = path.join(this.projectRoot, filePath)
			if (await fileExists(absPath)) {
				// Create backup with safe filename
				const safeName = filePath.replace(/[/\\]/g, "_")
				const backupPath = path.join(backupDir, safeName)

				const content = await readFile(absPath, "utf8")
				await writeFile(backupPath, content)

				backupPaths[filePath] = backupPath
			}
		}

		return backupPaths
	}

	/**
	 * Record a proposal application
	 *
	 * @param proposalId - ID of the proposal
	 * @param proposalPath - Path to proposal directory
	 * @param changedFiles - Files that were changed
	 * @param beforeMetrics - Metrics before application
	 * @returns The created application record
	 */
	async recordApplication(
		proposalId: string,
		proposalPath: string,
		changedFiles: string[],
		beforeMetrics: PerformanceMetrics,
	): Promise<ProposalApplication> {
		const applicationId = generateId()

		// Create backup of files
		const backupPaths = await this.createBackup(changedFiles, applicationId)

		const application: ProposalApplication = {
			id: applicationId,
			proposalId,
			proposalPath,
			changedFiles,
			beforeMetrics,
			appliedAt: new Date().toISOString(),
			status: "monitoring",
			rolledBack: false,
			backupPaths,
		}

		this.applications.push(application)
		await this.saveState()

		return application
	}

	/**
	 * Update post-application metrics
	 *
	 * @param applicationId - ID of the application
	 * @param afterMetrics - Current metrics
	 */
	async updateMetrics(applicationId: string, afterMetrics: PerformanceMetrics): Promise<void> {
		const application = this.applications.find((a) => a.id === applicationId)
		if (!application) {
			return
		}

		application.afterMetrics = afterMetrics
		await this.saveState()
	}

	/**
	 * Evaluate an application for degradation
	 *
	 * @param applicationId - ID of the application
	 * @returns Degradation detection result or null if not enough data
	 */
	async evaluateApplication(applicationId: string): Promise<DegradationDetectionResult | null> {
		const application = this.applications.find((a) => a.id === applicationId)
		if (!application || !application.afterMetrics) {
			return null
		}

		// Check if we have enough tasks for evaluation
		if (application.afterMetrics.taskCount < this.config.minTasksForEvaluation) {
			return null
		}

		return detectDegradation(application.beforeMetrics, application.afterMetrics, this.config.thresholds)
	}

	/**
	 * Perform rollback of an application
	 *
	 * @param applicationId - ID of the application to roll back
	 * @param reason - Reason for rollback
	 * @param automatic - Whether this is an automatic rollback
	 * @param triggeredBy - Who/what triggered the rollback
	 * @returns Rollback action record
	 */
	async rollback(
		applicationId: string,
		reason: string,
		automatic: boolean = false,
		triggeredBy: string = "self-healing",
	): Promise<RollbackAction> {
		const application = this.applications.find((a) => a.id === applicationId)
		if (!application) {
			throw new Error(`Application not found: ${applicationId}`)
		}

		if (application.rolledBack) {
			throw new Error(`Application already rolled back: ${applicationId}`)
		}

		// Check rate limits for automatic rollbacks
		if (automatic) {
			const rateCheck = checkRollbackRateLimit(this.rateLimitState, this.config)
			if (!rateCheck.allowed) {
				throw new Error(`Rollback rate limited: ${rateCheck.reason}`)
			}
		}

		const rollbackId = generateId()
		const restoredFiles: string[] = []
		let result: "success" | "partial" | "failed" = "success"
		let error: string | undefined

		// Restore files from backup
		for (const [filePath, backupPath] of Object.entries(application.backupPaths)) {
			try {
				const absPath = path.join(this.projectRoot, filePath)
				const backupContent = await readFile(backupPath, "utf8")
				await writeFile(absPath, backupContent)
				restoredFiles.push(filePath)
			} catch (e) {
				result = "partial"
				error = `Failed to restore ${filePath}: ${e instanceof Error ? e.message : String(e)}`
			}
		}

		if (restoredFiles.length === 0) {
			result = "failed"
			error = "No files were restored"
		}

		// Update application status
		application.rolledBack = true
		application.rollbackReason = reason
		application.rolledBackAt = new Date().toISOString()
		application.status = "rolled-back"

		// Create rollback action record
		const rollbackAction: RollbackAction = {
			id: rollbackId,
			applicationId,
			timestamp: new Date().toISOString(),
			reason,
			restoredFiles,
			automatic,
			triggeredBy,
			result,
			error,
		}

		this.rollbackLog.push(rollbackAction)

		// Update rate limit state
		if (automatic) {
			this.rateLimitState = updateRollbackRateLimitState(this.rateLimitState)
		}

		await this.saveState()

		return rollbackAction
	}

	/**
	 * Run automatic evaluation and rollback for monitoring applications
	 *
	 * @returns Array of rollback actions performed
	 */
	async runAutoHeal(): Promise<RollbackAction[]> {
		if (!this.config.enabled) {
			return []
		}

		const rollbackActions: RollbackAction[] = []

		// Find applications in monitoring status
		const monitoringApps = this.applications.filter((a) => a.status === "monitoring" && !a.rolledBack)

		for (const app of monitoringApps) {
			// Check if monitoring period has elapsed
			const appliedAt = new Date(app.appliedAt).getTime()
			const elapsed = Date.now() - appliedAt

			// Skip if still within initial monitoring period (grace period)
			if (elapsed < this.config.monitoringPeriodMs / 4) {
				continue
			}

			const degradation = await this.evaluateApplication(app.id)
			if (!degradation) {
				continue
			}

			if (degradation.recommendation === "rollback") {
				try {
					const action = await this.rollback(app.id, degradation.explanation, true, "auto-heal")
					rollbackActions.push(action)
				} catch (e) {
					// Rate limited or other error - skip
				}
			} else if (elapsed >= this.config.monitoringPeriodMs && degradation.recommendation === "ignore") {
				// Monitoring period complete with no issues
				app.status = "effective"
				await this.saveState()
			}
		}

		return rollbackActions
	}

	/**
	 * Get all applications
	 */
	getApplications(): ProposalApplication[] {
		return [...this.applications]
	}

	/**
	 * Get rollback log
	 */
	getRollbackLog(): RollbackAction[] {
		return [...this.rollbackLog]
	}

	/**
	 * Get configuration
	 */
	getConfig(): SelfHealingConfig {
		return { ...this.config }
	}

	/**
	 * Update configuration
	 */
	async updateConfig(updates: Partial<SelfHealingConfig>): Promise<void> {
		this.config = { ...this.config, ...updates }
		await writeFile(path.join(this.dataPath, CONFIG_FILE), YAML.stringify(this.config))
	}

	/**
	 * Clean up old backups
	 */
	async cleanupOldBackups(): Promise<number> {
		const backupsDir = path.join(this.dataPath, BACKUPS_DIR)
		const cutoffDate = Date.now() - this.config.backupRetentionDays * 24 * 60 * 60 * 1000

		let cleanedCount = 0

		try {
			const entries = await readdir(backupsDir, { withFileTypes: true })

			for (const entry of entries) {
				if (!entry.isDirectory()) {
					continue
				}

				const app = this.applications.find((a) => a.id === entry.name)
				if (app && app.rolledBack) {
					// Check if rollback is old enough to clean up
					const rolledBackAt = app.rolledBackAt ? new Date(app.rolledBackAt).getTime() : 0
					if (rolledBackAt < cutoffDate) {
						await rm(path.join(backupsDir, entry.name), { recursive: true, force: true })
						cleanedCount++
					}
				}
			}
		} catch {
			// Ignore errors
		}

		return cleanedCount
	}
}

/**
 * Create a self-healing manager for a project
 *
 * @param projectRoot - Project root directory
 * @param config - Optional configuration
 * @returns Initialized manager
 */
export async function createSelfHealingManager(
	projectRoot: string,
	config?: SelfHealingConfig,
): Promise<SelfHealingManager> {
	const manager = new SelfHealingManager(projectRoot, config)
	await manager.initialize()
	return manager
}
