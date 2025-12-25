/**
 * TraceStorage - Persistence layer for Darwin evolution trace events
 *
 * Handles storing and loading trace events from disk using JSONL format.
 * Supports file rotation (daily or by size) and retention policies.
 *
 * Storage location: .kilocode/evolution/traces/
 */

import * as fs from "fs"
import * as path from "path"
import type { TraceEvent } from "@roo-code/types"

/** Storage configuration options */
export interface TraceStorageConfig {
	/** Base directory for trace storage (workspace root) */
	workspacePath: string
	/** Maximum file size in bytes before rotation (default: 10MB) */
	maxFileSizeBytes?: number
	/** Number of days to retain trace files (default: 30) */
	retentionDays?: number
}

/** Default configuration values */
const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const DEFAULT_RETENTION_DAYS = 30
const TRACES_DIR = ".kilocode/evolution/traces"

/**
 * TraceStorage manages persistence of trace events to disk
 *
 * Uses JSONL (JSON Lines) format for efficient append operations
 * and easy parsing of individual events.
 */
export class TraceStorage {
	private readonly tracesDir: string
	private readonly maxFileSizeBytes: number
	private readonly retentionDays: number
	private currentFilePath: string | null = null
	private writeBuffer: string[] = []
	private flushTimer: NodeJS.Timeout | null = null
	private isInitialized = false

	constructor(config: TraceStorageConfig) {
		this.tracesDir = path.join(config.workspacePath, TRACES_DIR)
		this.maxFileSizeBytes = config.maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE
		this.retentionDays = config.retentionDays ?? DEFAULT_RETENTION_DAYS
	}

	/**
	 * Initialize the storage by ensuring directories exist
	 */
	async initialize(): Promise<void> {
		if (this.isInitialized) {
			return
		}

		try {
			await fs.promises.mkdir(this.tracesDir, { recursive: true })
			this.isInitialized = true
		} catch (error) {
			console.error("[TraceStorage] Failed to create traces directory:", error)
			throw error
		}
	}

	/**
	 * Get the current trace file path for today
	 */
	private getCurrentFilePath(): string {
		const date = new Date().toISOString().split("T")[0] // YYYY-MM-DD
		return path.join(this.tracesDir, `traces-${date}.jsonl`)
	}

	/**
	 * Check if the current file needs rotation due to size
	 */
	private async needsRotation(filePath: string): Promise<boolean> {
		try {
			const stats = await fs.promises.stat(filePath)
			return stats.size >= this.maxFileSizeBytes
		} catch {
			// File doesn't exist, no rotation needed
			return false
		}
	}

	/**
	 * Get a rotated filename (adds sequence number)
	 */
	private getRotatedFilePath(basePath: string, sequence: number): string {
		const ext = path.extname(basePath)
		const base = basePath.slice(0, -ext.length)
		return `${base}.${sequence}${ext}`
	}

	/**
	 * Find the next available sequence number for rotation
	 */
	private async getNextSequence(basePath: string): Promise<number> {
		let sequence = 1
		let rotatedPath = this.getRotatedFilePath(basePath, sequence)

		while (true) {
			try {
				await fs.promises.access(rotatedPath)
				sequence++
				rotatedPath = this.getRotatedFilePath(basePath, sequence)
			} catch {
				// File doesn't exist, this is our sequence number
				break
			}
		}

		return sequence
	}

	/**
	 * Append a trace event to storage
	 */
	async append(event: TraceEvent): Promise<void> {
		if (!this.isInitialized) {
			await this.initialize()
		}

		const line = JSON.stringify(event) + "\n"
		this.writeBuffer.push(line)

		// Start flush timer if not already running
		if (!this.flushTimer) {
			this.flushTimer = setTimeout(() => this.flush(), 1000)
		}
	}

	/**
	 * Flush buffered writes to disk
	 */
	async flush(): Promise<void> {
		if (this.flushTimer) {
			clearTimeout(this.flushTimer)
			this.flushTimer = null
		}

		if (this.writeBuffer.length === 0) {
			return
		}

		const currentPath = this.getCurrentFilePath()

		// Check if we need to rotate due to size
		if (await this.needsRotation(currentPath)) {
			const sequence = await this.getNextSequence(currentPath)
			const rotatedPath = this.getRotatedFilePath(currentPath, sequence)
			try {
				await fs.promises.rename(currentPath, rotatedPath)
			} catch (error) {
				console.warn("[TraceStorage] Failed to rotate file:", error)
			}
		}

		// Write buffered data
		const data = this.writeBuffer.join("")
		this.writeBuffer = []

		try {
			await fs.promises.appendFile(currentPath, data, "utf-8")
		} catch (error) {
			console.error("[TraceStorage] Failed to write traces:", error)
			// Put data back in buffer for retry
			this.writeBuffer.unshift(data)
		}
	}

	/**
	 * Load all traces from a specific date
	 */
	async loadFromDate(date: Date): Promise<TraceEvent[]> {
		if (!this.isInitialized) {
			await this.initialize()
		}

		const dateStr = date.toISOString().split("T")[0]
		const traces: TraceEvent[] = []

		try {
			const files = await fs.promises.readdir(this.tracesDir)
			const matchingFiles = files.filter((f) => f.startsWith(`traces-${dateStr}`) && f.endsWith(".jsonl"))

			for (const file of matchingFiles) {
				const filePath = path.join(this.tracesDir, file)
				const content = await fs.promises.readFile(filePath, "utf-8")
				const lines = content.split("\n").filter((line) => line.trim())

				for (const line of lines) {
					try {
						const event = JSON.parse(line) as TraceEvent
						traces.push(event)
					} catch {
						console.warn("[TraceStorage] Failed to parse trace line:", line.substring(0, 100))
					}
				}
			}
		} catch (error) {
			// Directory might not exist yet
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
				console.error("[TraceStorage] Failed to load traces:", error)
			}
		}

		return traces
	}

	/**
	 * Load all traces since a given timestamp
	 */
	async loadSince(timestamp: number): Promise<TraceEvent[]> {
		if (!this.isInitialized) {
			await this.initialize()
		}

		const startDate = new Date(timestamp)
		const today = new Date()
		const traces: TraceEvent[] = []

		// Load traces from each day since the timestamp
		const currentDate = new Date(startDate)
		currentDate.setHours(0, 0, 0, 0)

		while (currentDate <= today) {
			const dayTraces = await this.loadFromDate(currentDate)
			const filteredTraces = dayTraces.filter((t) => t.timestamp >= timestamp)
			traces.push(...filteredTraces)
			currentDate.setDate(currentDate.getDate() + 1)
		}

		return traces.sort((a, b) => a.timestamp - b.timestamp)
	}

	/**
	 * Load traces for a specific task
	 */
	async loadForTask(taskId: string, maxDays: number = 7): Promise<TraceEvent[]> {
		if (!this.isInitialized) {
			await this.initialize()
		}

		const today = new Date()
		const startDate = new Date()
		startDate.setDate(today.getDate() - maxDays)

		const allTraces = await this.loadSince(startDate.getTime())
		return allTraces.filter((t) => t.taskId === taskId)
	}

	/**
	 * Prune old trace files based on retention policy
	 */
	async pruneOldTraces(): Promise<number> {
		if (!this.isInitialized) {
			await this.initialize()
		}

		const cutoffDate = new Date()
		cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays)
		const cutoffStr = cutoffDate.toISOString().split("T")[0]

		let prunedCount = 0

		try {
			const files = await fs.promises.readdir(this.tracesDir)

			for (const file of files) {
				if (!file.startsWith("traces-") || !file.endsWith(".jsonl")) {
					continue
				}

				// Extract date from filename (traces-YYYY-MM-DD.jsonl)
				const dateMatch = file.match(/traces-(\d{4}-\d{2}-\d{2})/)
				if (!dateMatch) {
					continue
				}

				const fileDate = dateMatch[1]
				if (fileDate < cutoffStr) {
					const filePath = path.join(this.tracesDir, file)
					try {
						await fs.promises.unlink(filePath)
						prunedCount++
					} catch (error) {
						console.warn("[TraceStorage] Failed to prune file:", file, error)
					}
				}
			}
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
				console.error("[TraceStorage] Failed to prune traces:", error)
			}
		}

		return prunedCount
	}

	/**
	 * Get storage statistics
	 */
	async getStats(): Promise<{
		totalFiles: number
		totalSizeBytes: number
		oldestTraceDate: string | null
		newestTraceDate: string | null
	}> {
		if (!this.isInitialized) {
			await this.initialize()
		}

		let totalFiles = 0
		let totalSizeBytes = 0
		let oldestDate: string | null = null
		let newestDate: string | null = null

		try {
			const files = await fs.promises.readdir(this.tracesDir)
			const traceFiles = files.filter((f) => f.startsWith("traces-") && f.endsWith(".jsonl"))

			for (const file of traceFiles) {
				totalFiles++
				const filePath = path.join(this.tracesDir, file)
				const stats = await fs.promises.stat(filePath)
				totalSizeBytes += stats.size

				const dateMatch = file.match(/traces-(\d{4}-\d{2}-\d{2})/)
				if (dateMatch) {
					const fileDate = dateMatch[1]
					if (!oldestDate || fileDate < oldestDate) {
						oldestDate = fileDate
					}
					if (!newestDate || fileDate > newestDate) {
						newestDate = fileDate
					}
				}
			}
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
				console.error("[TraceStorage] Failed to get stats:", error)
			}
		}

		return { totalFiles, totalSizeBytes, oldestTraceDate: oldestDate, newestTraceDate: newestDate }
	}

	/**
	 * Ensure all buffered data is written before shutdown
	 */
	async close(): Promise<void> {
		await this.flush()
	}
}
