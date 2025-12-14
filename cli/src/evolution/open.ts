import path from "path"

import {
	findLatestEvolutionArtifact,
	type LatestEvolutionArtifact,
	type EvolutionArtifactKind,
} from "../../../src/shared/evolution/artifacts.js"

export type EvolutionOpenCliArgs = {
	workspaceRoot: string
}

function logEvent(event: {
	event: string
	phase: "start" | "end" | "error"
	ts: string
	data?: Record<string, unknown>
}): void {
	console.log(JSON.stringify(event))
}

function printLatest(kind: EvolutionArtifactKind, a: LatestEvolutionArtifact | undefined): void {
	const label = kind === "trace" ? "Latest trace" : kind === "report" ? "Latest council report" : "Latest proposal"
	console.log(`${label}: ${a?.openRelPath ?? a?.relPath ?? "(none found)"}`)
}

export async function runEvolutionOpenCli(args: EvolutionOpenCliArgs): Promise<void> {
	const { workspaceRoot } = args
	const projectRoot = path.resolve(workspaceRoot)

	logEvent({
		event: "evolution.open",
		phase: "start",
		ts: new Date().toISOString(),
		data: { projectRoot },
	})

	try {
		const [trace, report, proposal] = await Promise.all([
			findLatestEvolutionArtifact({ projectRoot, kind: "trace" }),
			findLatestEvolutionArtifact({ projectRoot, kind: "report" }),
			findLatestEvolutionArtifact({ projectRoot, kind: "proposal" }),
		])

		console.log("\nEvolution: latest artifacts")
		printLatest("trace", trace)
		printLatest("report", report)
		printLatest("proposal", proposal)

		console.log("\nNext steps")
		console.log("- Run council: kilocode council run --trace <trace.v1.json>")
		console.log(
			"- Generate proposal: kilocode evolve propose --trace <trace.v1.json> --reports <council.reports.dir>",
		)

		logEvent({
			event: "evolution.open",
			phase: "end",
			ts: new Date().toISOString(),
			data: {
				trace: trace?.relPath,
				report: report?.relPath,
				proposal: proposal?.relPath,
			},
		})
	} catch (error) {
		logEvent({
			event: "evolution.open",
			phase: "error",
			ts: new Date().toISOString(),
			data: {
				error: error instanceof Error ? error.message : String(error),
				recovery: "Ensure you are running inside a repo that contains the .kilocode/ Evolution directories.",
			},
		})
		throw error
	}
}
