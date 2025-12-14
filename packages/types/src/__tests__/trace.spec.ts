// pnpm --filter @roo-code/types test src/__tests__/trace.spec.ts

import { createTraceV1, redactTraceV1, traceV1Schema } from "../trace.js"

describe("trace.v1", () => {
	it("creates a valid trace.v1 from persisted-like task messages", () => {
		const trace = createTraceV1({
			source: { kind: "vscode", taskId: "task_123" },
			task: { id: "task_123", title: "Implement feature X", mode: "code", ts: 123 },
			uiMessages: [
				{ ts: 1, type: "say", say: "text", text: "Task: implement feature X" },
				{ ts: 2, type: "say", say: "text", text: "Here is an API key: sk-abcdef0123456789abcdef0123456789" },
				{ ts: 3, type: "ask", ask: "command", text: "pnpm test" },
			],
			apiMessages: [{ role: "user", content: "hello" }],
		})

		expect(trace.version).toBe("trace.v1")
		expect(trace.uiMessages).toHaveLength(3)
		// Ensure it round-trips via schema
		expect(traceV1Schema.parse(trace)).toEqual(trace)
	})

	it("redacts secrets in nested structures and records metadata", () => {
		const trace = createTraceV1({
			source: { kind: "cli" },
			uiMessages: [
				{ ts: 1, type: "say", say: "text", text: "Bearer abcdefghijklmnopqrstuvwxyz" },
				{ ts: 2, type: "say", say: "text", text: "sk-ant-abcdef0123456789abcdef0123456789" },
			],
			apiMessages: [
				{
					headers: {
						Authorization: "Bearer abcdefghijklmnopqrstuvwxyz",
					},
				},
			],
		})

		const redacted = redactTraceV1(trace)
		expect(redacted.replacedCount).toBeGreaterThan(0)
		expect(redacted.patternIds.length).toBeGreaterThan(0)

		expect(redacted.value.redaction?.enabled).toBe(true)
		expect(redacted.value.redaction?.replacedCount).toBeGreaterThan(0)

		const texts = redacted.value.uiMessages.map((m) => m.text ?? "")
		expect(texts.join("\n")).toContain("[REDACTED")
	})
})
