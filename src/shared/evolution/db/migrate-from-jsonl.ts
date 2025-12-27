import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"
import { traceQueries, proposalQueries, skillQueries } from "./index"
import type { TraceEvent, EvolutionProposal, SkillMetadata } from "@roo-code/types"
import { v4 as uuidv4 } from "uuid"

const WORKSPACE_PATH = process.cwd()
const TRACES_DIR = path.join(WORKSPACE_PATH, ".kilocode/evolution/traces")
const PROPOSALS_DIR = path.join(WORKSPACE_PATH, ".kilocode/evolution/proposals")
const SKILLS_DIR = path.join(WORKSPACE_PATH, ".kilocode/skills")

async function migrateTraces() {
	console.log("Migrating traces...")
	try {
		const files = await fs.readdir(TRACES_DIR)
		const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"))

		for (const file of jsonlFiles) {
			const content = await fs.readFile(path.join(TRACES_DIR, file), "utf-8")
			const lines = content.split("\n").filter((line) => line.trim())

			for (const line of lines) {
				try {
					const event = JSON.parse(line) as TraceEvent
					await traceQueries.create({
						id: uuidv4(),
						timestamp: event.timestamp,
						event: event.type,
						toolId: event.toolName,
						status: event.errorMessage ? "error" : "success",
						duration: null, // Not available in old traces
						error: event.errorMessage,
						context: JSON.stringify(event.metadata), // Mapping metadata to context for now
						metadata: JSON.stringify(event.metadata),
						createdAt: new Date(),
					})
				} catch (e) {
					console.error(`Failed to migrate trace line: ${e}`)
				}
			}
		}
		console.log("Traces migration completed.")
	} catch (e) {
		console.log("No traces found or error reading traces directory.")
	}
}

async function migrateProposals() {
	console.log("Migrating proposals...")
	try {
		const files = await fs.readdir(PROPOSALS_DIR)
		const jsonFiles = files.filter((f) => f.endsWith(".json"))

		for (const file of jsonFiles) {
			try {
				const content = await fs.readFile(path.join(PROPOSALS_DIR, file), "utf-8")
				const proposal = JSON.parse(content) as EvolutionProposal

				await proposalQueries.create({
					id: proposal.id,
					type: proposal.type,
					title: proposal.title,
					description: proposal.description,
					payload: JSON.stringify(proposal.payload),
					risk: proposal.risk,
					status: proposal.status,
					sourceSignalId: proposal.sourceSignalId,
					reviewedBy: proposal.reviewedBy,
					reviewNotes: proposal.reviewNotes,
					rollbackData: proposal.rollbackData ? JSON.stringify(proposal.rollbackData) : undefined,
					createdAt: new Date(proposal.createdAt),
					updatedAt: new Date(proposal.updatedAt),
				})
			} catch (e) {
				console.error(`Failed to migrate proposal ${file}: ${e}`)
			}
		}
		console.log("Proposals migration completed.")
	} catch (e) {
		console.log("No proposals found or error reading proposals directory.")
	}
}

async function migrateSkills() {
	console.log("Migrating skills...")
	try {
		for (const scope of ["global", "project"]) {
			const scopeDir = path.join(SKILLS_DIR, scope)
			try {
				const files = await fs.readdir(scopeDir)
				const jsonFiles = files.filter((f) => f.endsWith(".json") && f !== "index.json")

				for (const file of jsonFiles) {
					try {
						const content = await fs.readFile(path.join(scopeDir, file), "utf-8")
						const metadata = JSON.parse(content) as SkillMetadata

						// Read implementation code
						const implPath = path.join(scopeDir, metadata.implementationPath)
						let code = ""
						try {
							code = await fs.readFile(implPath, "utf-8")
						} catch {
							console.warn(`Implementation file not found for skill ${metadata.id}`)
						}

						await skillQueries.create({
							id: metadata.id,
							name: metadata.name,
							description: metadata.description,
							code: code,
							language:
								metadata.runtime === "python"
									? "python"
									: metadata.runtime === "shell"
										? "bash"
										: "typescript",
							tags: JSON.stringify(metadata.tags),
							usageCount: metadata.usageCount,
							successRate: metadata.successRate,
							lastUsed: metadata.lastUsedAt ? new Date(metadata.lastUsedAt) : null,
							createdAt: new Date(metadata.createdAt),
							updatedAt: new Date(metadata.updatedAt),
						})
					} catch (e) {
						console.error(`Failed to migrate skill ${file}: ${e}`)
					}
				}
			} catch {
				// Scope directory might not exist
			}
		}
		console.log("Skills migration completed.")
	} catch (e) {
		console.log("No skills found or error reading skills directory.")
	}
}

async function main() {
	console.log("Starting migration from JSONL to SQLite...")
	await migrateTraces()
	await migrateProposals()
	await migrateSkills()
	console.log("Migration finished.")
}

if (require.main === module) {
	main().catch(console.error)
}
