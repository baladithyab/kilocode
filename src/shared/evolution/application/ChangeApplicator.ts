/**
 * ChangeApplicator - Apply approved evolution proposals
 *
 * Responsibilities:
 * - Apply approved proposals to the system
 * - Create backups before changes
 * - Modify .kilocodemodes for mode overrides
 * - Modify .kilocoderules for rule changes
 * - Register synthesized skills
 * - Rollback on failure
 */

import * as path from "path"
import type {
	ChangeRecord,
	ChangeApplicatorResult,
	ChangeType,
	EvolutionProposal,
	SkillMetadata,
} from "@roo-code/types"

/** Configuration for ChangeApplicator */
export interface ChangeApplicatorConfig {
	/** Workspace root path */
	workspacePath: string

	/** Create backups before applying changes (default: true) */
	createBackups?: boolean

	/** Backup directory name (default: '.kilocode/backups') */
	backupDir?: string

	/** Maximum number of backups to keep (default: 10) */
	maxBackups?: number

	/** Dry run mode - don't actually apply changes (default: false) */
	dryRun?: boolean
}

/** File system interface for abstraction */
export interface FileSystem {
	readFile(path: string): Promise<string>
	writeFile(path: string, content: string): Promise<void>
	exists(path: string): Promise<boolean>
	mkdir(path: string, options?: { recursive?: boolean }): Promise<void>
	readdir(path: string): Promise<string[]>
	unlink(path: string): Promise<void>
	copyFile(src: string, dest: string): Promise<void>
}

/** Default in-memory file system for testing */
class InMemoryFileSystem implements FileSystem {
	private files: Map<string, string> = new Map()

	async readFile(filePath: string): Promise<string> {
		const content = this.files.get(filePath)
		if (content === undefined) {
			throw new Error(`ENOENT: no such file or directory: ${filePath}`)
		}
		return content
	}

	async writeFile(filePath: string, content: string): Promise<void> {
		this.files.set(filePath, content)
	}

	async exists(filePath: string): Promise<boolean> {
		return this.files.has(filePath)
	}

	async mkdir(_dirPath: string, _options?: { recursive?: boolean }): Promise<void> {
		// No-op for in-memory implementation
	}

	async readdir(dirPath: string): Promise<string[]> {
		const prefix = dirPath.endsWith("/") ? dirPath : dirPath + "/"
		const files: string[] = []
		for (const key of this.files.keys()) {
			if (key.startsWith(prefix)) {
				const relative = key.slice(prefix.length)
				const firstPart = relative.split("/")[0]
				if (firstPart && !files.includes(firstPart)) {
					files.push(firstPart)
				}
			}
		}
		return files
	}

	async unlink(filePath: string): Promise<void> {
		this.files.delete(filePath)
	}

	async copyFile(src: string, dest: string): Promise<void> {
		const content = await this.readFile(src)
		await this.writeFile(dest, content)
	}
}

/** File content for Kilocode config files */
interface ModeEntry {
	slug: string
	name: string
	roleDefinition?: string
	customInstructions?: string
	temperature?: number
	groups?: string[]
	skills?: string[]
}

/**
 * ChangeApplicator handles applying evolution proposals
 */
export class ChangeApplicator {
	private config: Required<ChangeApplicatorConfig>
	private fs: FileSystem
	private changeHistory: ChangeRecord[] = []

	constructor(config: ChangeApplicatorConfig, fs?: FileSystem) {
		this.config = {
			workspacePath: config.workspacePath,
			createBackups: config.createBackups ?? true,
			backupDir: config.backupDir ?? ".kilocode/backups",
			maxBackups: config.maxBackups ?? 10,
			dryRun: config.dryRun ?? false,
		}
		this.fs = fs ?? new InMemoryFileSystem()
	}

	/**
	 * Apply a proposal
	 */
	async applyProposal(proposal: EvolutionProposal): Promise<ChangeApplicatorResult> {
		const changes: ChangeRecord[] = []
		const result: ChangeApplicatorResult = {
			success: true,
			appliedCount: 0,
			failedCount: 0,
			appliedChanges: [],
			failedChanges: [],
		}

		try {
			// Create backup if enabled
			if (this.config.createBackups) {
				await this.createBackup()
			}

			// Generate changes based on proposal type
			switch (proposal.type) {
				case "rule_update":
					changes.push(...(await this.prepareRuleUpdate(proposal)))
					break

				case "mode_instruction":
					changes.push(...(await this.prepareModeUpdate(proposal)))
					break

				case "tool_creation":
					changes.push(...(await this.prepareSkillCreation(proposal)))
					break

				case "config_change":
					changes.push(...(await this.prepareConfigChange(proposal)))
					break

				case "prompt_refinement":
					changes.push(...(await this.preparePromptRefinement(proposal)))
					break

				default:
					throw new Error(`Unknown proposal type: ${proposal.type}`)
			}

			// Apply changes
			for (const change of changes) {
				try {
					if (!this.config.dryRun) {
						await this.applyChange(change)
					}
					change.appliedAt = Date.now()
					result.appliedChanges.push(change)
					result.appliedCount++
				} catch (error) {
					result.failedChanges.push({
						change,
						error: error instanceof Error ? error.message : String(error),
					})
					result.failedCount++
					result.success = false
				}
			}

			// Store rollback data
			if (result.appliedChanges.length > 0) {
				result.rollbackData = result.appliedChanges.map((c) => ({
					...c,
					content: c.previousContent,
					previousContent: c.content,
				}))
			}

			// Record in history
			this.changeHistory.push(...result.appliedChanges)
		} catch (error) {
			result.success = false
			result.failedChanges.push({
				change: {
					id: `error-${Date.now()}`,
					type: "config_update" as ChangeType,
					target: "proposal",
					content: proposal,
				},
				error: error instanceof Error ? error.message : String(error),
			})
			result.failedCount++
		}

		return result
	}

	/**
	 * Apply multiple proposals
	 */
	async applyProposals(proposals: EvolutionProposal[]): Promise<ChangeApplicatorResult> {
		const combinedResult: ChangeApplicatorResult = {
			success: true,
			appliedCount: 0,
			failedCount: 0,
			appliedChanges: [],
			failedChanges: [],
			rollbackData: [],
		}

		for (const proposal of proposals) {
			const result = await this.applyProposal(proposal)

			combinedResult.appliedCount += result.appliedCount
			combinedResult.failedCount += result.failedCount
			combinedResult.appliedChanges.push(...result.appliedChanges)
			combinedResult.failedChanges.push(...result.failedChanges)

			if (result.rollbackData) {
				combinedResult.rollbackData!.push(...result.rollbackData)
			}

			if (!result.success) {
				combinedResult.success = false
			}
		}

		return combinedResult
	}

	/**
	 * Rollback applied changes
	 */
	async rollback(changes: ChangeRecord[]): Promise<ChangeApplicatorResult> {
		const result: ChangeApplicatorResult = {
			success: true,
			appliedCount: 0,
			failedCount: 0,
			appliedChanges: [],
			failedChanges: [],
		}

		// Apply changes in reverse order
		for (const change of [...changes].reverse()) {
			try {
				if (!this.config.dryRun) {
					await this.applyChange(change)
				}
				result.appliedChanges.push(change)
				result.appliedCount++
			} catch (error) {
				result.failedChanges.push({
					change,
					error: error instanceof Error ? error.message : String(error),
				})
				result.failedCount++
				result.success = false
			}
		}

		return result
	}

	/**
	 * Get change history
	 */
	getChangeHistory(): ChangeRecord[] {
		return [...this.changeHistory]
	}

	/**
	 * Clear change history
	 */
	clearHistory(): void {
		this.changeHistory = []
	}

	// ==========================================================================
	// Prepare Methods
	// ==========================================================================

	private async prepareRuleUpdate(proposal: EvolutionProposal): Promise<ChangeRecord[]> {
		const payload = proposal.payload as {
			targetFile?: string
			ruleType?: string
			ruleContent?: string
		}

		const targetFile = path.join(this.config.workspacePath, payload.targetFile ?? ".kilocoderules")

		// Read current content
		let currentContent = ""
		try {
			currentContent = await this.fs.readFile(targetFile)
		} catch {
			// File doesn't exist, will be created
		}

		// Append new rule
		const newContent = currentContent
			? `${currentContent}\n\n# Darwin Evolution: ${proposal.title}\n${payload.ruleContent ?? ""}`
			: `# Darwin Evolution Rules\n\n# ${proposal.title}\n${payload.ruleContent ?? ""}`

		return [
			{
				id: `change-${Date.now()}-rule`,
				type: "rule_add",
				target: targetFile,
				content: newContent,
				previousContent: currentContent,
			},
		]
	}

	private async prepareModeUpdate(proposal: EvolutionProposal): Promise<ChangeRecord[]> {
		const payload = proposal.payload as {
			targetMode?: string
			instructionType?: string
			content?: string
		}

		const modesFile = path.join(this.config.workspacePath, ".kilocodemodes")

		// Read current content
		let modes: ModeEntry[] = []
		try {
			const content = await this.fs.readFile(modesFile)
			modes = JSON.parse(content) as ModeEntry[]
		} catch {
			// File doesn't exist or is invalid
		}

		const previousContent = JSON.stringify(modes, null, 2)

		// Find or create mode entry
		const targetSlug = payload.targetMode ?? "code"
		let mode = modes.find((m) => m.slug === targetSlug)

		if (!mode) {
			mode = {
				slug: targetSlug,
				name: targetSlug.charAt(0).toUpperCase() + targetSlug.slice(1),
			}
			modes.push(mode)
		}

		// Update instructions
		if (payload.instructionType === "guidance" || payload.instructionType === "role") {
			const existingInstructions = mode.customInstructions ?? ""
			mode.customInstructions = existingInstructions
				? `${existingInstructions}\n\n# Darwin Evolution: ${proposal.title}\n${payload.content ?? ""}`
				: `# Darwin Evolution Instructions\n\n${payload.content ?? ""}`
		}

		return [
			{
				id: `change-${Date.now()}-mode`,
				type: "mode_override",
				target: modesFile,
				content: JSON.stringify(modes, null, 2),
				previousContent,
			},
		]
	}

	private async prepareSkillCreation(proposal: EvolutionProposal): Promise<ChangeRecord[]> {
		const payload = proposal.payload as {
			skill?: SkillMetadata
			code?: string
		}

		if (!payload.skill || !payload.code) {
			throw new Error("Skill creation requires skill metadata and code")
		}

		const skillDir = path.join(this.config.workspacePath, ".kilocode/skills", payload.skill.scope)
		const metadataPath = path.join(skillDir, `${payload.skill.id}.json`)
		const codePath = path.join(skillDir, payload.skill.implementationPath)

		return [
			{
				id: `change-${Date.now()}-skill-meta`,
				type: "skill_register",
				target: metadataPath,
				content: JSON.stringify(payload.skill, null, 2),
			},
			{
				id: `change-${Date.now()}-skill-code`,
				type: "skill_register",
				target: codePath,
				content: payload.code,
			},
		]
	}

	private async prepareConfigChange(proposal: EvolutionProposal): Promise<ChangeRecord[]> {
		const payload = proposal.payload as {
			setting?: string
			currentValue?: unknown
			proposedValue?: unknown
		}

		// For now, config changes are logged but not directly applied
		// They would need integration with VS Code settings API
		return [
			{
				id: `change-${Date.now()}-config`,
				type: "config_update",
				target: payload.setting ?? "unknown",
				content: payload.proposedValue,
				previousContent: payload.currentValue,
			},
		]
	}

	private async preparePromptRefinement(proposal: EvolutionProposal): Promise<ChangeRecord[]> {
		const payload = proposal.payload as {
			targetPrompt?: string
			suggestion?: string
		}

		// Prompt refinements are stored as mode instructions
		return this.prepareModeUpdate({
			...proposal,
			payload: {
				targetMode: payload.targetPrompt ?? "code",
				instructionType: "guidance",
				content: payload.suggestion,
			},
		})
	}

	// ==========================================================================
	// Apply Methods
	// ==========================================================================

	private async applyChange(change: ChangeRecord): Promise<void> {
		switch (change.type) {
			case "rule_add":
			case "rule_update":
			case "mode_override":
			case "skill_register":
			case "skill_update":
				await this.ensureDirectory(path.dirname(change.target))
				await this.fs.writeFile(change.target, change.content as string)
				break

			case "config_update":
				// Config updates would integrate with VS Code API
				// For now, we just record the change
				console.log(`[ChangeApplicator] Would update config: ${change.target}`)
				break

			default:
				throw new Error(`Unknown change type: ${change.type}`)
		}
	}

	// ==========================================================================
	// Backup Methods
	// ==========================================================================

	private async createBackup(): Promise<void> {
		const backupDir = path.join(this.config.workspacePath, this.config.backupDir)
		await this.ensureDirectory(backupDir)

		const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
		const backupPath = path.join(backupDir, `backup-${timestamp}`)
		await this.ensureDirectory(backupPath)

		// Backup key files
		const filesToBackup = [".kilocoderules", ".kilocodemodes"]

		for (const file of filesToBackup) {
			const srcPath = path.join(this.config.workspacePath, file)
			const destPath = path.join(backupPath, file)

			try {
				await this.fs.copyFile(srcPath, destPath)
			} catch {
				// File might not exist, skip
			}
		}

		// Clean old backups
		await this.cleanOldBackups(backupDir)
	}

	private async cleanOldBackups(backupDir: string): Promise<void> {
		try {
			const backups = await this.fs.readdir(backupDir)
			const sortedBackups = backups
				.filter((b) => b.startsWith("backup-"))
				.sort()
				.reverse()

			// Remove excess backups
			for (let i = this.config.maxBackups; i < sortedBackups.length; i++) {
				const backupPath = path.join(backupDir, sortedBackups[i])
				try {
					await this.fs.unlink(backupPath)
				} catch {
					// Ignore errors during cleanup
				}
			}
		} catch {
			// Ignore errors during cleanup
		}
	}

	// ==========================================================================
	// Utility Methods
	// ==========================================================================

	private async ensureDirectory(dirPath: string): Promise<void> {
		await this.fs.mkdir(dirPath, { recursive: true })
	}

	/**
	 * Set dry run mode
	 */
	setDryRun(enabled: boolean): void {
		this.config.dryRun = enabled
	}

	/**
	 * Check if in dry run mode
	 */
	isDryRun(): boolean {
		return this.config.dryRun
	}
}
