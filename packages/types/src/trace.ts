import { z } from "zod"
import { clineMessageSchema, type ClineMessage } from "./message.js"
import { historyItemSchema, type HistoryItem } from "./history.js"

/**
 * trace.v1
 *
 * A repo-local, council-review oriented trace format.
 *
 * Design goals (MVP):
 * - stable, machine-readable schema
 * - carries enough context for council review (task metadata + UI messages)
 * - can be produced both by the VS Code extension and the CLI
 */

export const traceVersionV1 = "trace.v1" as const

export const traceSourceV1Schema = z
	.object({
		kind: z.enum(["vscode", "cli"]),
		taskId: z.string().optional(),
		taskDir: z.string().optional(),
		inputPath: z.string().optional(),
	})
	.strict()

export type TraceSourceV1 = z.infer<typeof traceSourceV1Schema>

export const traceTaskV1Schema = z
	.object({
		id: z.string().optional(),
		number: z.number().optional(),
		title: z.string().optional(),
		workspace: z.string().optional(),
		mode: z.string().optional(),
		ts: z.number().optional(),
	})
	.strict()

export type TraceTaskV1 = z.infer<typeof traceTaskV1Schema>

export const traceRedactionV1Schema = z
	.object({
		enabled: z.boolean(),
		patternIds: z.array(z.string()).optional(),
		replacedCount: z.number().optional(),
	})
	.strict()

export type TraceRedactionV1 = z.infer<typeof traceRedactionV1Schema>

export const traceV1Schema = z
	.object({
		version: z.literal(traceVersionV1),
		id: z.string(),
		createdAt: z.string().datetime(),
		source: traceSourceV1Schema.optional(),
		task: traceTaskV1Schema.optional(),
		/**
		 * Raw Kilo Code UI message history. This is the primary input for council review.
		 */
		uiMessages: z.array(clineMessageSchema),
		/**
		 * Optional provider-level message history (provider-specific shapes).
		 *
		 * Kept as `unknown[]` for now to avoid coupling this schema to any single API.
		 */
		apiMessages: z.array(z.unknown()).optional(),
		/**
		 * Optional: include the computed history item snapshot (what shows up in History).
		 */
		historyItem: historyItemSchema.optional(),
		redaction: traceRedactionV1Schema.optional(),
	})
	.strict()

export type TraceV1 = z.infer<typeof traceV1Schema>

export type CreateTraceV1Params = {
	id?: string
	createdAt?: Date | string
	source?: TraceSourceV1
	task?: TraceTaskV1
	historyItem?: HistoryItem
	uiMessages: ClineMessage[]
	apiMessages?: unknown[]
}

function newTraceId(): string {
	return `trace_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
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

export function createTraceV1(params: CreateTraceV1Params): TraceV1 {
	const trace: TraceV1 = {
		version: traceVersionV1,
		id: params.id ?? newTraceId(),
		createdAt: toIsoString(params.createdAt),
		source: params.source,
		task: params.task,
		historyItem: params.historyItem,
		uiMessages: params.uiMessages,
		apiMessages: params.apiMessages,
	}

	return traceV1Schema.parse(trace)
}

export type RedactionPattern = {
	id: string
	description: string
	regex: RegExp
	replacement: string
}

export const defaultRedactionPatterns: readonly RedactionPattern[] = [
	{
		id: "openai_sk",
		description: "OpenAI-style secret keys (sk-...)",
		regex: /\bsk-[A-Za-z0-9]{20,}\b/g,
		replacement: "[REDACTED:openai_sk]",
	},
	{
		id: "anthropic_sk",
		description: "Anthropic-style secret keys (sk-ant-...)",
		regex: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,
		replacement: "[REDACTED:anthropic_sk]",
	},
	{
		id: "bearer_token",
		description: "Authorization Bearer tokens",
		regex: /\bBearer\s+[A-Za-z0-9._-]{10,}\b/g,
		replacement: "Bearer [REDACTED:bearer_token]",
	},
	{
		id: "aws_access_key",
		description: "AWS access key id (AKIA...)",
		regex: /\bAKIA[0-9A-Z]{16}\b/g,
		replacement: "[REDACTED:aws_access_key]",
	},
	{
		id: "private_key_block",
		description: "PEM private key blocks",
		regex: /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/g,
		replacement: "[REDACTED:private_key_block]",
	},
] as const

export type RedactionOptions = {
	/**
	 * Patterns to apply.
	 * Defaults to {@link defaultRedactionPatterns}.
	 */
	patterns?: readonly RedactionPattern[]
}

export type RedactionResult<T> = {
	value: T
	replacedCount: number
	patternIds: string[]
}

function redactString(value: string, patterns: readonly RedactionPattern[]): { value: string; count: number } {
	let out = value
	let count = 0
	for (const p of patterns) {
		const matches = out.match(p.regex)
		if (matches && matches.length > 0) {
			count += matches.length
			out = out.replace(p.regex, p.replacement)
		}
	}
	return { value: out, count }
}

function redactDeep(value: unknown, patterns: readonly RedactionPattern[]): { value: unknown; count: number } {
	if (typeof value === "string") {
		const r = redactString(value, patterns)
		return { value: r.value, count: r.count }
	}

	if (Array.isArray(value)) {
		let count = 0
		const next = value.map((v) => {
			const r = redactDeep(v, patterns)
			count += r.count
			return r.value
		})
		return { value: next, count }
	}

	if (value && typeof value === "object") {
		let count = 0
		const next: Record<string, unknown> = {}
		for (const [k, v] of Object.entries(value)) {
			const r = redactDeep(v, patterns)
			count += r.count
			next[k] = r.value
		}
		return { value: next, count }
	}

	return { value, count: 0 }
}

export function redactTraceV1(trace: TraceV1, options: RedactionOptions = {}): RedactionResult<TraceV1> {
	const patterns = options.patterns ?? defaultRedactionPatterns
	const redacted = redactDeep(trace, patterns)

	const value = traceV1Schema.parse({
		...(redacted.value as TraceV1),
		redaction: {
			enabled: true,
			patternIds: patterns.map((p) => p.id),
			replacedCount: redacted.count,
		},
	})

	return {
		value,
		replacedCount: redacted.count,
		patternIds: patterns.map((p) => p.id),
	}
}
