import { stat } from "node:fs/promises"
import path from "node:path"

export function getEvolutionRootDir(projectRoot: string): string {
	return path.resolve(projectRoot, ".kilocode")
}

/**
 * Returns true if the workspace appears to have Evolution Layer bootstrapped.
 *
 * Current heuristic (minimal): a top-level `.kilocode/` directory exists.
 */
export async function isEvolutionBootstrapped(projectRoot: string): Promise<boolean> {
	try {
		return (await stat(getEvolutionRootDir(projectRoot))).isDirectory()
	} catch {
		return false
	}
}
