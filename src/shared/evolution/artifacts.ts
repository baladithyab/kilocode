import { readdir, stat } from "node:fs/promises"
import type { Dirent } from "node:fs"
import path from "node:path"

export type EvolutionArtifactKind = "trace" | "report" | "proposal"

export type LatestEvolutionArtifact = {
	kind: EvolutionArtifactKind
	/** Absolute path to the artifact (file or directory) */
	absPath: string
	/** Repo-relative path to the artifact (file or directory) */
	relPath: string
	mtimeMs: number
	isDirectory: boolean
	/** Optional absolute path to a file that should be opened for this artifact */
	openAbsPath?: string
	/** Optional repo-relative path to a file that should be opened for this artifact */
	openRelPath?: string
}

export type FindLatestDirEntryResult = {
	absPath: string
	relPath: string
	mtimeMs: number
	isDirectory: boolean
	name: string
}

function toRepoRelativePath(projectRoot: string, absPath: string): string {
	return path.relative(projectRoot, absPath).split(path.sep).join("/")
}

export async function findLatestDirEntry(args: {
	projectRoot: string
	dirRel: string
	filter: (ent: Dirent) => boolean
}): Promise<FindLatestDirEntryResult | undefined> {
	const { projectRoot, dirRel, filter } = args
	const dirAbs = path.resolve(projectRoot, dirRel)

	let entries: Dirent[]
	try {
		entries = await readdir(dirAbs, { withFileTypes: true })
	} catch {
		return undefined
	}

	let latest: FindLatestDirEntryResult | undefined

	for (const ent of entries) {
		if (!filter(ent)) continue

		const absPath = path.join(dirAbs, ent.name)
		let s
		try {
			s = await stat(absPath)
		} catch {
			continue
		}

		const candidate: FindLatestDirEntryResult = {
			name: ent.name,
			absPath,
			relPath: toRepoRelativePath(projectRoot, absPath),
			mtimeMs: s.mtimeMs,
			isDirectory: ent.isDirectory(),
		}

		if (!latest || candidate.mtimeMs > latest.mtimeMs) {
			latest = candidate
		}
	}

	return latest
}

async function fileExists(absPath: string): Promise<boolean> {
	try {
		const s = await stat(absPath)
		return s.isFile()
	} catch {
		return false
	}
}

export async function findLatestEvolutionArtifact(args: {
	projectRoot: string
	kind: EvolutionArtifactKind
}): Promise<LatestEvolutionArtifact | undefined> {
	const { projectRoot, kind } = args

	if (kind === "trace") {
		const latest = await findLatestDirEntry({
			projectRoot,
			dirRel: path.join(".kilocode", "traces", "runs"),
			filter: (ent) => ent.isFile() && ent.name.startsWith("trace.v1.") && ent.name.endsWith(".json"),
		})
		if (!latest) return undefined

		return {
			kind,
			absPath: latest.absPath,
			relPath: latest.relPath,
			mtimeMs: latest.mtimeMs,
			isDirectory: false,
			openAbsPath: latest.absPath,
			openRelPath: latest.relPath,
		}
	}

	if (kind === "report") {
		const latest = await findLatestDirEntry({
			projectRoot,
			dirRel: path.join(".kilocode", "evals", "reports"),
			filter: (ent) => ent.isDirectory(),
		})
		if (!latest) return undefined

		return {
			kind,
			absPath: latest.absPath,
			relPath: latest.relPath,
			mtimeMs: latest.mtimeMs,
			isDirectory: true,
		}
	}

	// proposal
	const latest = await findLatestDirEntry({
		projectRoot,
		dirRel: path.join(".kilocode", "evolution", "proposals"),
		filter: (ent) => ent.isDirectory(),
	})
	if (!latest) return undefined

	const proposalMd = path.join(latest.absPath, "proposal.md")
	const proposalJson = path.join(latest.absPath, "proposal.json")
	const proposalV1Json = path.join(latest.absPath, "proposal.v1.json")

	const openAbsPath = (await fileExists(proposalMd))
		? proposalMd
		: (await fileExists(proposalJson))
			? proposalJson
			: (await fileExists(proposalV1Json))
				? proposalV1Json
				: undefined

	return {
		kind,
		absPath: latest.absPath,
		relPath: latest.relPath,
		mtimeMs: latest.mtimeMs,
		isDirectory: true,
		...(openAbsPath
			? {
					openAbsPath,
					openRelPath: toRepoRelativePath(projectRoot, openAbsPath),
				}
			: {}),
	}
}

export async function findLatestEvolutionArtifacts(projectRoot: string): Promise<LatestEvolutionArtifact[]> {
	const [trace, report, proposal] = await Promise.all([
		findLatestEvolutionArtifact({ projectRoot, kind: "trace" }),
		findLatestEvolutionArtifact({ projectRoot, kind: "report" }),
		findLatestEvolutionArtifact({ projectRoot, kind: "proposal" }),
	])

	return [trace, report, proposal].filter(Boolean) as LatestEvolutionArtifact[]
}
