import { z } from "zod"

export const proposalVersionV1 = "proposal.v1" as const

export const proposalChangeV1Schema = z
	.object({
		path: z.string(),
		reason: z.string().optional(),
	})
	.strict()

export type ProposalChangeV1 = z.infer<typeof proposalChangeV1Schema>

export const proposalV1Schema = z
	.object({
		version: z.literal(proposalVersionV1),
		id: z.string(),
		createdAt: z.string().datetime(),
		/**
		 * Paths are repo-relative (preferred) but may be absolute if produced outside a repo.
		 */
		tracePath: z.string(),
		reportsDir: z.string(),
		summary: z.string(),
		intent: z.string().optional(),
		scope: z.array(z.string()).optional(),
		risks: z.array(z.string()).optional(),
		verification: z.array(z.string()).optional(),
		changes: z.array(proposalChangeV1Schema).optional(),
	})
	.strict()

export type ProposalV1 = z.infer<typeof proposalV1Schema>

export type CreateProposalV1Params = {
	id?: string
	createdAt?: Date | string
	tracePath: string
	reportsDir: string
	summary: string
	intent?: string
	scope?: string[]
	risks?: string[]
	verification?: string[]
	changes?: ProposalChangeV1[]
}

function newProposalId(): string {
	return `proposal_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function toIsoString(value: Date | string | undefined): string {
	if (!value) {
		return new Date().toISOString()
	}
	if (typeof value === "string") {
		return value
	}
	return value.toISOString()
}

export function createProposalV1(params: CreateProposalV1Params): ProposalV1 {
	return proposalV1Schema.parse({
		version: proposalVersionV1,
		id: params.id ?? newProposalId(),
		createdAt: toIsoString(params.createdAt),
		tracePath: params.tracePath,
		reportsDir: params.reportsDir,
		summary: params.summary,
		intent: params.intent,
		scope: params.scope,
		risks: params.risks,
		verification: params.verification,
		changes: params.changes,
	})
}

export function formatProposalMarkdownV1(proposal: ProposalV1): string {
	const scope = proposal.scope ?? []
	const risks = proposal.risks ?? []
	const verification = proposal.verification ?? []
	const changes = proposal.changes ?? []

	return [
		`# Evolution Proposal (v1)`,
		"",
		`- Proposal ID: ${proposal.id}`,
		`- Created: ${proposal.createdAt}`,
		`- Trace: ${proposal.tracePath}`,
		`- Reports: ${proposal.reportsDir}`,
		"",
		`## Summary`,
		"",
		proposal.summary.trim(),
		"",
		proposal.intent ? `## Intent\n\n${proposal.intent.trim()}\n` : "",
		scope.length > 0 ? `## Scope\n\n${scope.map((s) => `- ${s}`).join("\n")}\n` : "",
		risks.length > 0 ? `## Risks\n\n${risks.map((r) => `- ${r}`).join("\n")}\n` : "",
		verification.length > 0 ? `## Verification\n\n${verification.map((v) => `- ${v}`).join("\n")}\n` : "",
		changes.length > 0
			? `## Proposed Changes\n\n${changes
					.map((c) => `- ${c.path}${c.reason ? ` — ${c.reason}` : ""}`)
					.join("\n")}\n`
			: "",
	]
		.filter((s) => s !== "")
		.join("\n")
}
