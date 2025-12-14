import { readdir, readFile, mkdir } from "node:fs/promises"
import * as path from "node:path"

import {
	createProposalV1,
	formatProposalMarkdownV1,
	scorecardV1Schema,
	traceV1Schema,
	type ProposalV1,
	type ScorecardV1,
	type TraceV1,
} from "@roo-code/types"

import { formatTimestampForFilename, toRepoRelativePath, writeJsonUnique, writeTextFileUnique } from "./fs"

export type EvolutionProposalGenerateOptions = {
	projectRoot: string
	tracePath: string
	reportsDir: string
	outDir?: string
	now?: Date
}

export type EvolutionProposalGenerateResult = {
	proposal: ProposalV1
	proposalDir: string
	jsonPath: string
	markdownPath: string
	loadedScorecards: ScorecardV1[]
	trace: TraceV1
}

async function loadTraceV1(tracePath: string): Promise<TraceV1> {
	const raw = await readFile(tracePath, "utf8")
	return traceV1Schema.parse(JSON.parse(raw))
}

async function loadScorecardsFromDir(dir: string): Promise<ScorecardV1[]> {
	const entries = await readdir(dir, { withFileTypes: true })

	const scorecards: ScorecardV1[] = []
	for (const ent of entries) {
		if (!ent.isFile()) continue
		if (!ent.name.endsWith(".json")) continue

		const p = path.join(dir, ent.name)
		try {
			const raw = await readFile(p, "utf8")
			const parsed = JSON.parse(raw)
			const result = scorecardV1Schema.safeParse(parsed)
			if (result.success) {
				scorecards.push(result.data)
			}
		} catch {
			// ignore
		}
	}

	return scorecards
}

function summarizeScorecards(scorecards: ScorecardV1[]): string {
	if (scorecards.length === 0) {
		return "No scorecards were found."
	}

	const verdictCounts = new Map<string, number>()
	for (const sc of scorecards) {
		const v = sc.overall?.verdict ?? "unknown"
		verdictCounts.set(v, (verdictCounts.get(v) ?? 0) + 1)
	}

	const verdictLine = Array.from(verdictCounts.entries())
		.sort((a, b) => a[0].localeCompare(b[0]))
		.map(([v, n]) => `${v}:${n}`)
		.join(", ")

	const findings = scorecards.flatMap((s) => s.findings ?? [])
	const recs = scorecards.flatMap((s) => s.recommendations ?? [])

	const lines = [
		`Council reviewed ${scorecards.length} role(s).`,
		`Verdicts: ${verdictLine}.`,
		findings.length > 0 ? `Findings (${findings.length}):` : "",
		...(findings.length > 0 ? findings.map((f) => `- ${f}`) : []),
		recs.length > 0 ? `Recommendations (${recs.length}):` : "",
		...(recs.length > 0 ? recs.map((r) => `- ${r}`) : []),
	]

	return lines.filter(Boolean).join("\n")
}

export async function generateEvolutionProposalFromScorecards(
	options: EvolutionProposalGenerateOptions,
): Promise<EvolutionProposalGenerateResult> {
	const {
		projectRoot,
		tracePath,
		reportsDir,
		outDir = path.join(".kilocode", "evolution", "proposals"),
		now = new Date(),
	} = options

	const [trace, scorecards] = await Promise.all([loadTraceV1(tracePath), loadScorecardsFromDir(reportsDir)])

	const ts = formatTimestampForFilename(now)
	const tracePathAbs = path.resolve(tracePath)
	const reportsDirAbs = path.resolve(reportsDir)

	const proposal = createProposalV1({
		tracePath: toRepoRelativePath(projectRoot, tracePathAbs),
		reportsDir: toRepoRelativePath(projectRoot, reportsDirAbs),
		summary: summarizeScorecards(scorecards),
		intent: "Evolution Layer change proposal generated from council scorecards.",
		scope: [],
		risks: [],
		verification: [],
		changes: [],
	})

	const baseDirName = `proposal.v1.${ts}.${trace.id.slice(0, 8)}`
	const proposalDirAbs = path.resolve(projectRoot, outDir, baseDirName)
	await mkdir(proposalDirAbs, { recursive: true })

	const jsonPath = await writeJsonUnique(proposalDirAbs, "proposal.v1.json", proposal)
	const markdownPath = await writeTextFileUnique(proposalDirAbs, "proposal.md", formatProposalMarkdownV1(proposal))

	return {
		proposal,
		proposalDir: proposalDirAbs,
		jsonPath,
		markdownPath,
		loadedScorecards: scorecards,
		trace,
	}
}
