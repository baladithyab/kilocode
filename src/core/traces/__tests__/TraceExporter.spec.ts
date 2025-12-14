import { TraceExporter } from "../TraceExporter"

import type { HistoryItem } from "@roo-code/types"
import { traceV1Schema } from "@roo-code/types"

describe("TraceExporter", () => {
	it("buildTraceForCouncil transforms persisted-like messages into trace.v1", () => {
		const historyItem: HistoryItem = {
			id: "task_123",
			number: 42,
			ts: 123456789,
			task: "Implement evolution MVP",
			tokensIn: 1,
			tokensOut: 2,
			totalCost: 0,
			workspace: "/repo",
			mode: "code",
		}

		const trace = TraceExporter.buildTraceForCouncil({
			taskId: historyItem.id,
			uiMessages: [
				{ ts: 1, type: "say", say: "text", text: "hello" },
				{ ts: 2, type: "ask", ask: "command", text: "pnpm test" },
			],
			apiMessages: [{ role: "user", content: "hello" }],
			historyItem,
		})

		expect(traceV1Schema.parse(trace)).toEqual(trace)
		expect(trace.version).toBe("trace.v1")
		expect(trace.source?.kind).toBe("vscode")
		expect(trace.source?.taskId).toBe("task_123")
		expect(trace.task?.id).toBe("task_123")
		expect(trace.task?.title).toBe("Implement evolution MVP")
		expect(trace.task?.mode).toBe("code")
		expect(trace.uiMessages).toHaveLength(2)
	})
})
