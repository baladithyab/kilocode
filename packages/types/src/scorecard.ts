import { z } from "zod"

export const scorecardVersionV1 = "scorecard.v1" as const

export const scorecardVerdictSchema = z.enum(["pass", "warn", "fail", "unknown"])
export type ScorecardVerdict = z.infer<typeof scorecardVerdictSchema>

export const scorecardScoreItemV1Schema = z
	.object({
		id: z.string(),
		label: z.string().optional(),
		/**
		 * Normalized score in [0, 1].
		 *
		 * Council prompts should ask models to output normalized scores.
		 */
		score: z.number().min(0).max(1).optional(),
		rationale: z.string().optional(),
	})
	.strict()

export type ScorecardScoreItemV1 = z.infer<typeof scorecardScoreItemV1Schema>

export const scorecardCouncilInfoV1Schema = z
	.object({
		role: z.string(),
		profile: z.string(),
		rubricId: z.string().optional(),
		promptPath: z.string().optional(),
	})
	.strict()

export type ScorecardCouncilInfoV1 = z.infer<typeof scorecardCouncilInfoV1Schema>

export const scorecardTraceRefV1Schema = z
	.object({
		id: z.string().optional(),
		path: z.string().optional(),
	})
	.strict()

export type ScorecardTraceRefV1 = z.infer<typeof scorecardTraceRefV1Schema>

export const scorecardOverallV1Schema = z
	.object({
		verdict: scorecardVerdictSchema.default("unknown"),
		/**
		 * Optional overall normalized score in [0, 1].
		 */
		score: z.number().min(0).max(1).optional(),
		summary: z.string().optional(),
	})
	.strict()

export type ScorecardOverallV1 = z.infer<typeof scorecardOverallV1Schema>

export const scorecardV1Schema = z
	.object({
		version: z.literal(scorecardVersionV1),
		id: z.string(),
		createdAt: z.string().datetime(),
		trace: scorecardTraceRefV1Schema.optional(),
		council: scorecardCouncilInfoV1Schema,
		overall: scorecardOverallV1Schema.optional(),
		scores: z.array(scorecardScoreItemV1Schema).optional(),
		findings: z.array(z.string()).optional(),
		recommendations: z.array(z.string()).optional(),
		/**
		 * For auditability: record the exact filled prompt used in this run.
		 *
		 * WARNING: this may contain trace content; callers should ensure redaction
		 * is applied where appropriate.
		 */
		prompt: z.string().optional(),
		/**
		 * Raw model output (untrusted).
		 */
		raw: z.unknown().optional(),
	})
	.strict()

export type ScorecardV1 = z.infer<typeof scorecardV1Schema>

export type CreateScorecardV1Params = {
	id?: string
	createdAt?: Date | string
	trace?: ScorecardTraceRefV1
	council: ScorecardCouncilInfoV1
	overall?: ScorecardOverallV1
	scores?: ScorecardScoreItemV1[]
	findings?: string[]
	recommendations?: string[]
	prompt?: string
	raw?: unknown
}

function newScorecardId(): string {
	return `scorecard_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
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

export function createScorecardV1(params: CreateScorecardV1Params): ScorecardV1 {
	return scorecardV1Schema.parse({
		version: scorecardVersionV1,
		id: params.id ?? newScorecardId(),
		createdAt: toIsoString(params.createdAt),
		trace: params.trace,
		council: params.council,
		overall: params.overall,
		scores: params.scores,
		findings: params.findings,
		recommendations: params.recommendations,
		prompt: params.prompt,
		raw: params.raw,
	})
}
