import { access, mkdir, writeFile } from "node:fs/promises"
import * as path from "node:path"

export function formatTimestampForFilename(date: Date): string {
	// 20251214T161234Z
	const iso = date.toISOString() // 2025-12-14T16:12:34.567Z
	return iso.replace(/[-:]/g, "").replace(/\.(\d+)Z$/, "Z")
}

export async function fileExists(filePath: string): Promise<boolean> {
	try {
		await access(filePath)
		return true
	} catch {
		return false
	}
}

export async function writeJsonUnique(dir: string, baseName: string, data: unknown): Promise<string> {
	await mkdir(dir, { recursive: true })

	const ext = path.extname(baseName) || ".json"
	const name = ext ? baseName.slice(0, -ext.length) : baseName

	for (let i = 0; i < 1000; i++) {
		const suffix = i === 0 ? "" : `-${String(i).padStart(3, "0")}`
		const fileName = `${name}${suffix}${ext}`
		const outPath = path.join(dir, fileName)

		if (await fileExists(outPath)) {
			continue
		}

		await writeFile(outPath, JSON.stringify(data, null, 2), "utf8")
		return outPath
	}

	throw new Error(`Failed to find an unused filename for '${baseName}' in '${dir}'.`)
}

export async function writeTextFileUnique(dir: string, baseName: string, content: string): Promise<string> {
	await mkdir(dir, { recursive: true })

	const ext = path.extname(baseName) || ""
	const name = ext ? baseName.slice(0, -ext.length) : baseName

	for (let i = 0; i < 1000; i++) {
		const suffix = i === 0 ? "" : `-${String(i).padStart(3, "0")}`
		const fileName = `${name}${suffix}${ext}`
		const outPath = path.join(dir, fileName)

		if (await fileExists(outPath)) {
			continue
		}

		await writeFile(outPath, content, "utf8")
		return outPath
	}

	throw new Error(`Failed to find an unused filename for '${baseName}' in '${dir}'.`)
}

export function toRepoRelativePath(projectRoot: string, absolutePath: string): string {
	const rel = path.relative(projectRoot, absolutePath)
	// normalize Windows paths to POSIX for repo-local references
	return rel.split(path.sep).join("/")
}
