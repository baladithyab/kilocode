/**
 * SkillLibrary - Storage and indexing for Darwin skills
 *
 * Responsibilities:
 * - Store skills in `.kilocode/skills/` directory
 * - Index skills for fast search (TF-IDF for MVP)
 * - Track usage and success rates
 * - Version management
 */

import * as path from "path"
import type { SkillMetadata, SkillsIndex, SkillScope, SkillRuntime, SkillType } from "@roo-code/types"
import { skillQueries } from "../db"

/** Configuration for the SkillLibrary */
export interface SkillLibraryConfig {
	/** Workspace root path */
	workspacePath: string

	/** Skills directory name (default: '.kilocode/skills') */
	skillsDir?: string

	/** Enable caching (default: true) */
	enableCache?: boolean

	/** Maximum number of skills to cache (default: 100) */
	maxCacheSize?: number

	/** Storage backend to use (default: "jsonl") */
	storageBackend?: "jsonl" | "sqlite"
}

/** File system interface for abstraction */
export interface FileSystem {
	readFile(path: string): Promise<string>
	writeFile(path: string, content: string): Promise<void>
	exists(path: string): Promise<boolean>
	mkdir(path: string, options?: { recursive?: boolean }): Promise<void>
	readdir(path: string): Promise<string[]>
	unlink(path: string): Promise<void>
	stat(path: string): Promise<{ isDirectory: boolean; isFile: boolean }>
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
		return this.files.has(filePath) || this.hasDirectory(filePath)
	}

	async mkdir(dirPath: string, _options?: { recursive?: boolean }): Promise<void> {
		// No-op for in-memory implementation
		this.files.set(dirPath + "/.dir", "")
	}

	async readdir(dirPath: string): Promise<string[]> {
		const prefix = dirPath.endsWith("/") ? dirPath : dirPath + "/"
		const files: string[] = []
		for (const key of this.files.keys()) {
			if (key.startsWith(prefix) && key !== prefix + ".dir") {
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

	async stat(filePath: string): Promise<{ isDirectory: boolean; isFile: boolean }> {
		const exists = this.files.has(filePath)
		const isDir = this.hasDirectory(filePath)
		return {
			isDirectory: isDir && !exists,
			isFile: exists && !filePath.endsWith("/.dir"),
		}
	}

	private hasDirectory(dirPath: string): boolean {
		const prefix = dirPath.endsWith("/") ? dirPath : dirPath + "/"
		for (const key of this.files.keys()) {
			if (key.startsWith(prefix)) {
				return true
			}
		}
		return false
	}
}

/** TF-IDF search index entry */
interface SearchIndexEntry {
	skillId: string
	terms: Map<string, number> // term -> tf-idf score
}

/**
 * SkillLibrary manages the storage and retrieval of skills
 */
export class SkillLibrary {
	private config: Required<SkillLibraryConfig>
	private fs: FileSystem
	private cache: Map<string, SkillMetadata> = new Map()
	private searchIndex: SearchIndexEntry[] = []
	private documentFrequency: Map<string, number> = new Map()
	private isInitialized: boolean = false

	constructor(config: SkillLibraryConfig, fs?: FileSystem) {
		this.config = {
			workspacePath: config.workspacePath,
			skillsDir: config.skillsDir ?? ".kilocode/skills",
			enableCache: config.enableCache ?? true,
			maxCacheSize: config.maxCacheSize ?? 100,
			storageBackend: config.storageBackend ?? "jsonl",
		}
		this.fs = fs ?? new InMemoryFileSystem()
	}

	/**
	 * Initialize the library
	 */
	async initialize(): Promise<void> {
		if (this.isInitialized) {
			return
		}

		// Create directories if they don't exist
		await this.ensureDirectories()

		// Load existing skills into cache
		await this.loadSkillsIndex()

		// Build search index
		this.buildSearchIndex()

		this.isInitialized = true
	}

	/**
	 * Get the path to skills directory
	 */
	getSkillsPath(scope: SkillScope = "project"): string {
		return path.join(this.config.workspacePath, this.config.skillsDir, scope)
	}

	/**
	 * Get the path to index.json
	 */
	getIndexPath(): string {
		return path.join(this.config.workspacePath, this.config.skillsDir, "index.json")
	}

	/**
	 * Add a new skill
	 */
	async addSkill(metadata: SkillMetadata, implementation: string): Promise<void> {
		// Validate metadata
		this.validateMetadata(metadata)

		if (this.config.storageBackend === "sqlite") {
			try {
				await skillQueries.create({
					id: metadata.id,
					name: metadata.name,
					description: metadata.description,
					code: implementation,
					language:
						metadata.runtime === "python" ? "python" : metadata.runtime === "shell" ? "bash" : "typescript",
					tags: JSON.stringify(metadata.tags),
					usageCount: metadata.usageCount,
					successRate: metadata.successRate,
					lastUsed: metadata.lastUsedAt !== undefined ? new Date(metadata.lastUsedAt) : null,
					createdAt: new Date(metadata.createdAt),
					updatedAt: new Date(metadata.updatedAt),
				})
			} catch (error) {
				console.error("[SkillLibrary] Error adding skill to SQLite:", error)
				throw error
			}
		} else {
			// Write implementation file
			const implPath = path.join(this.getSkillsPath(metadata.scope), metadata.implementationPath)
			await this.fs.writeFile(implPath, implementation)

			// Write metadata file
			const metadataPath = path.join(this.getSkillsPath(metadata.scope), `${metadata.id}.json`)
			await this.fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2))
		}

		// Update cache
		if (this.config.enableCache) {
			this.updateCache(metadata)
		}

		// Update index
		await this.updateIndex()

		// Rebuild search index
		this.buildSearchIndex()
	}

	/**
	 * Search for skills by query
	 */
	async searchSkills(query: string, limit: number = 10): Promise<SkillMetadata[]> {
		if (!this.isInitialized) {
			await this.initialize()
		}

		if (this.config.storageBackend === "sqlite") {
			const results = await skillQueries.search(query)
			return results.slice(0, limit).map(
				(s) =>
					({
						id: s.id,
						name: s.name,
						description: s.description || "",
						implementationPath: "", // Not stored in SQLite metadata
						scope: "project", // Default to project for now
						type: "mcp_tool", // Default
						runtime: s.language === "python" ? "python" : s.language === "bash" ? "shell" : "typescript",
						tags: s.tags ? JSON.parse(s.tags as string) : [],
						usageCount: s.usageCount || 0,
						successCount: 0, // Not stored directly
						failureCount: 0, // Not stored directly
						successRate: s.successRate || 0,
						lastUsedAt: s.lastUsed !== undefined ? s.lastUsed.getTime() : undefined,
						createdAt: s.createdAt.getTime(),
						updatedAt: s.updatedAt.getTime(),
						active: true,
						version: "1.0.0",
						permissions: [],
					}) as SkillMetadata,
			)
		}

		if (!query.trim()) {
			return this.listSkills().then((skills) => skills.slice(0, limit))
		}

		// Tokenize query
		const queryTerms = this.tokenize(query.toLowerCase())

		// Calculate scores for each skill
		const scores: Array<{ skill: SkillMetadata; score: number }> = []

		for (const entry of this.searchIndex) {
			let score = 0
			for (const term of queryTerms) {
				// Exact match
				if (entry.terms.has(term)) {
					score += entry.terms.get(term)!
				}
				// Partial match
				for (const [indexTerm, tfIdf] of entry.terms) {
					if (indexTerm.includes(term) || term.includes(indexTerm)) {
						score += tfIdf * 0.5
					}
				}
			}

			if (score > 0) {
				const skill = this.cache.get(entry.skillId)
				if (skill) {
					scores.push({ skill, score })
				}
			}
		}

		// Sort by score descending
		scores.sort((a, b) => b.score - a.score)

		// Return top results
		return scores.slice(0, limit).map((s) => s.skill)
	}

	/**
	 * Get a skill by ID
	 */
	async getSkill(id: string): Promise<SkillMetadata | null> {
		if (!this.isInitialized) {
			await this.initialize()
		}

		// Check cache first
		if (this.cache.has(id)) {
			return this.cache.get(id)!
		}

		if (this.config.storageBackend === "sqlite") {
			const s = await skillQueries.getById(id)
			if (!s) return null

			const metadata: SkillMetadata = {
				id: s.id,
				name: s.name,
				description: s.description || "",
				implementationPath: "", // Not stored in SQLite metadata
				scope: "project", // Default to project for now
				type: "mcp_tool", // Default
				runtime: s.language === "python" ? "python" : s.language === "bash" ? "shell" : "typescript",
				tags: s.tags ? JSON.parse(s.tags as string) : [],
				usageCount: s.usageCount || 0,
				successCount: 0, // Not stored directly
				failureCount: 0, // Not stored directly
				successRate: s.successRate || 0,
				lastUsedAt: s.lastUsed ? s.lastUsed.getTime() : undefined,
				createdAt: s.createdAt.getTime(),
				updatedAt: s.updatedAt.getTime(),
				active: true,
				version: "1.0.0",
				permissions: [],
			}
			this.updateCache(metadata)
			return metadata
		}

		// Try to load from disk
		for (const scope of ["project", "global"] as SkillScope[]) {
			try {
				const metadataPath = path.join(this.getSkillsPath(scope), `${id}.json`)
				const content = await this.fs.readFile(metadataPath)
				const metadata = JSON.parse(content) as SkillMetadata
				this.updateCache(metadata)
				return metadata
			} catch {
				// Continue searching
			}
		}

		return null
	}

	/**
	 * Get skill implementation
	 */
	async getSkillImplementation(id: string): Promise<string | null> {
		if (this.config.storageBackend === "sqlite") {
			const s = await skillQueries.getById(id)
			return s?.code || null
		}

		const metadata = await this.getSkill(id)
		if (!metadata) {
			return null
		}

		const implPath = path.join(this.getSkillsPath(metadata.scope), metadata.implementationPath)
		try {
			return await this.fs.readFile(implPath)
		} catch {
			return null
		}
	}

	/**
	 * Update skill metrics
	 */
	async updateSkillMetrics(
		id: string,
		metrics: {
			usageCount?: number
			successCount?: number
			failureCount?: number
			lastUsedAt?: number
		},
	): Promise<void> {
		const skill = await this.getSkill(id)
		if (!skill) {
			throw new Error(`Skill not found: ${id}`)
		}

		// Update metrics
		if (metrics.usageCount !== undefined) {
			skill.usageCount = metrics.usageCount
		}
		if (metrics.successCount !== undefined) {
			skill.successCount = metrics.successCount
		}
		if (metrics.failureCount !== undefined) {
			skill.failureCount = metrics.failureCount
		}
		if (metrics.lastUsedAt !== undefined) {
			skill.lastUsedAt = metrics.lastUsedAt
		}

		// Calculate success rate
		const total = skill.successCount + skill.failureCount
		skill.successRate = total > 0 ? skill.successCount / total : undefined

		// Update timestamp
		skill.updatedAt = Date.now()

		if (this.config.storageBackend === "sqlite") {
			await skillQueries.incrementUsage(id, metrics.successCount !== undefined && metrics.successCount > 0)
		} else {
			// Write updated metadata
			const metadataPath = path.join(this.getSkillsPath(skill.scope), `${skill.id}.json`)
			await this.fs.writeFile(metadataPath, JSON.stringify(skill, null, 2))
		}

		// Update cache
		this.updateCache(skill)

		// Update index
		await this.updateIndex()
	}

	/**
	 * Record skill execution result
	 */
	async recordExecution(id: string, success: boolean): Promise<void> {
		const skill = await this.getSkill(id)
		if (!skill) {
			throw new Error(`Skill not found: ${id}`)
		}

		await this.updateSkillMetrics(id, {
			usageCount: skill.usageCount + 1,
			successCount: success ? skill.successCount + 1 : skill.successCount,
			failureCount: success ? skill.failureCount : skill.failureCount + 1,
			lastUsedAt: Date.now(),
		})
	}

	/**
	 * List all skills
	 */
	async listSkills(scope?: SkillScope): Promise<SkillMetadata[]> {
		if (!this.isInitialized) {
			await this.initialize()
		}

		const skills = Array.from(this.cache.values())

		if (scope) {
			return skills.filter((s) => s.scope === scope)
		}

		return skills
	}

	/**
	 * List active skills
	 */
	async listActiveSkills(): Promise<SkillMetadata[]> {
		const skills = await this.listSkills()
		return skills.filter((s) => s.active)
	}

	/**
	 * Delete a skill
	 */
	async deleteSkill(id: string): Promise<void> {
		const skill = await this.getSkill(id)
		if (!skill) {
			throw new Error(`Skill not found: ${id}`)
		}

		// Delete implementation file
		const implPath = path.join(this.getSkillsPath(skill.scope), skill.implementationPath)
		await this.fs.unlink(implPath)

		// Delete metadata file
		const metadataPath = path.join(this.getSkillsPath(skill.scope), `${skill.id}.json`)
		await this.fs.unlink(metadataPath)

		// Remove from cache
		this.cache.delete(id)

		// Update index
		await this.updateIndex()

		// Rebuild search index
		this.buildSearchIndex()
	}

	/**
	 * Deactivate a skill (soft delete)
	 */
	async deactivateSkill(id: string): Promise<void> {
		const skill = await this.getSkill(id)
		if (!skill) {
			throw new Error(`Skill not found: ${id}`)
		}

		skill.active = false
		skill.updatedAt = Date.now()

		const metadataPath = path.join(this.getSkillsPath(skill.scope), `${skill.id}.json`)
		await this.fs.writeFile(metadataPath, JSON.stringify(skill, null, 2))

		this.updateCache(skill)
		await this.updateIndex()
	}

	/**
	 * Activate a skill
	 */
	async activateSkill(id: string): Promise<void> {
		const skill = await this.getSkill(id)
		if (!skill) {
			throw new Error(`Skill not found: ${id}`)
		}

		skill.active = true
		skill.updatedAt = Date.now()

		const metadataPath = path.join(this.getSkillsPath(skill.scope), `${skill.id}.json`)
		await this.fs.writeFile(metadataPath, JSON.stringify(skill, null, 2))

		this.updateCache(skill)
		await this.updateIndex()
	}

	/**
	 * Get statistics about the skill library
	 */
	async getStats(): Promise<{
		totalSkills: number
		activeSkills: number
		skillsByScope: Record<SkillScope, number>
		skillsByType: Record<SkillType, number>
		skillsByRuntime: Record<SkillRuntime, number>
		averageSuccessRate: number
	}> {
		const skills = await this.listSkills()

		const stats = {
			totalSkills: skills.length,
			activeSkills: skills.filter((s) => s.active).length,
			skillsByScope: { global: 0, project: 0 } as Record<SkillScope, number>,
			skillsByType: { mcp_tool: 0, workflow: 0, pattern: 0, rule: 0 } as Record<SkillType, number>,
			skillsByRuntime: { typescript: 0, python: 0, shell: 0 } as Record<SkillRuntime, number>,
			averageSuccessRate: 0,
		}

		let totalSuccessRate = 0
		let skillsWithRate = 0

		for (const skill of skills) {
			stats.skillsByScope[skill.scope]++
			stats.skillsByType[skill.type]++
			stats.skillsByRuntime[skill.runtime]++

			if (skill.successRate !== undefined) {
				totalSuccessRate += skill.successRate
				skillsWithRate++
			}
		}

		stats.averageSuccessRate = skillsWithRate > 0 ? totalSuccessRate / skillsWithRate : 0

		return stats
	}

	// ==========================================================================
	// Private Methods
	// ==========================================================================

	private async ensureDirectories(): Promise<void> {
		const baseDir = path.join(this.config.workspacePath, this.config.skillsDir)
		await this.fs.mkdir(baseDir, { recursive: true })
		await this.fs.mkdir(path.join(baseDir, "global"), { recursive: true })
		await this.fs.mkdir(path.join(baseDir, "project"), { recursive: true })
	}

	private async loadSkillsIndex(): Promise<void> {
		// Load skills from both scopes
		for (const scope of ["project", "global"] as SkillScope[]) {
			try {
				const scopeDir = this.getSkillsPath(scope)
				const files = await this.fs.readdir(scopeDir)

				for (const file of files) {
					if (file.endsWith(".json") && file !== "index.json") {
						try {
							const filePath = path.join(scopeDir, file)
							const content = await this.fs.readFile(filePath)
							const metadata = JSON.parse(content) as SkillMetadata
							this.updateCache(metadata)
						} catch (e) {
							console.error(`Failed to load skill: ${file}`, e)
						}
					}
				}
			} catch {
				// Directory might not exist yet
			}
		}
	}

	private async updateIndex(): Promise<void> {
		const skills = Array.from(this.cache.values())
		const index: SkillsIndex = {
			version: "1.0.0",
			lastUpdated: Date.now(),
			skills,
		}

		const indexPath = this.getIndexPath()
		await this.fs.writeFile(indexPath, JSON.stringify(index, null, 2))
	}

	private validateMetadata(metadata: SkillMetadata): void {
		if (!metadata.id) {
			throw new Error("Skill must have an ID")
		}
		if (!metadata.name) {
			throw new Error("Skill must have a name")
		}
		if (!metadata.implementationPath) {
			throw new Error("Skill must have an implementation path")
		}
	}

	private updateCache(skill: SkillMetadata): void {
		if (!this.config.enableCache) {
			return
		}

		// Evict oldest entries if cache is full
		if (this.cache.size >= this.config.maxCacheSize) {
			const oldest = Array.from(this.cache.entries()).sort(
				(a, b) => (a[1].lastUsedAt ?? a[1].updatedAt) - (b[1].lastUsedAt ?? b[1].updatedAt),
			)[0]
			if (oldest) {
				this.cache.delete(oldest[0])
			}
		}

		this.cache.set(skill.id, skill)
	}

	private buildSearchIndex(): void {
		this.searchIndex = []
		this.documentFrequency = new Map()

		// First pass: calculate document frequency
		for (const skill of this.cache.values()) {
			const terms = this.getSkillTerms(skill)
			const uniqueTerms = new Set(terms)
			for (const term of uniqueTerms) {
				this.documentFrequency.set(term, (this.documentFrequency.get(term) ?? 0) + 1)
			}
		}

		// Second pass: calculate TF-IDF
		const totalDocs = this.cache.size
		for (const skill of this.cache.values()) {
			const terms = this.getSkillTerms(skill)
			const termCounts = new Map<string, number>()

			for (const term of terms) {
				termCounts.set(term, (termCounts.get(term) ?? 0) + 1)
			}

			const entry: SearchIndexEntry = {
				skillId: skill.id,
				terms: new Map(),
			}

			for (const [term, count] of termCounts) {
				const tf = count / terms.length
				const df = this.documentFrequency.get(term) ?? 1
				// Use smoothed IDF to avoid zero scores when there's only 1 document
				// log(1 + N/df) ensures scores > 0 even with single document
				const idf = Math.log(1 + totalDocs / df)
				entry.terms.set(term, tf * idf)
			}

			this.searchIndex.push(entry)
		}
	}

	private getSkillTerms(skill: SkillMetadata): string[] {
		const terms: string[] = []

		// Add name terms
		terms.push(...this.tokenize(skill.name.toLowerCase()))

		// Add description terms
		terms.push(...this.tokenize(skill.description.toLowerCase()))

		// Add tags
		for (const tag of skill.tags) {
			terms.push(...this.tokenize(tag.toLowerCase()))
		}

		// Add type
		terms.push(skill.type)

		// Add runtime
		terms.push(skill.runtime)

		return terms
	}

	private tokenize(text: string): string[] {
		// Simple tokenization: split on non-alphanumeric characters
		return text.split(/[^a-z0-9]+/).filter((t) => t.length > 1)
	}
}
