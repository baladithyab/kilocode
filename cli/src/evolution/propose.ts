import * as path from "path"

import { generateEvolutionProposalFromScorecards } from "../../../src/shared/evolution/proposalGenerator.js"

export type EvolveProposeCliArgs = {
	workspaceRoot: string
	tracePath: string
	reportsDir: string
	outDir?: string
}

export async function runEvolveProposeCli(args: EvolveProposeCliArgs): Promise<{
	proposalDir: string
	jsonPath: string
	markdownPath: string
}> {
	const { workspaceRoot, tracePath, reportsDir, outDir } = args

	const projectRoot = path.resolve(workspaceRoot)
	const absTracePath = path.resolve(projectRoot, tracePath)
	const absReportsDir = path.resolve(projectRoot, reportsDir)

	const result = await generateEvolutionProposalFromScorecards({
		projectRoot,
		tracePath: absTracePath,
		reportsDir: absReportsDir,
		...(outDir ? { outDir } : {}),
	})

	return {
		proposalDir: result.proposalDir,
		jsonPath: result.jsonPath,
		markdownPath: result.markdownPath,
	}
}
