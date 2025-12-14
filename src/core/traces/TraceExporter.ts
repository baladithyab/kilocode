import * as path from "path"
import * as fs from "fs/promises"

import type { ClineMessage, HistoryItem } from "@roo-code/types"
import { createTraceV1, redactTraceV1, type TraceV1 } from "@roo-code/types"

import { fileExistsAtPath } from "../../utils/fs"
import { readApiMessages } from "../task-persistence/apiMessages"
import { readTaskMessages } from "../task-persistence/taskMessages"

export type ExportTraceForCouncilOptions = {
	workspaceRoot: string
	globalStoragePath: string
	/**
	 * Task id to export.
	 */
	taskId: string
	/**
	 * Optional history item for richer metadata.
	 */
	historyItem?: HistoryItem
	/**
	 * If true, apply basic redaction patterns.
	 */
	redact?: boolean
}

function formatTimestampForFilename(date: Date): string {
	// 20251214T161234Z
	const iso = date.toISOString() // 2025-12-14T16:12:34.567Z
	return iso.replace(/[-:]/g, "").replace(/\.(\d+)Z$/, "Z")
}

async function writeJsonUnique(dir: string, baseName: string, data: unknown): Promise<string> {
	await fs.mkdir(dir, { recursive: true })

	const ext = path.extname(baseName) || ".json"
	const name = ext ? baseName.slice(0, -ext.length) : baseName

	for (let i = 0; i < 1000; i++) {
		const suffix = i === 0 ? "" : `-${String(i).padStart(3, "0")}`
		const fileName = `${name}${suffix}${ext}`
		const outPath = path.join(dir, fileName)

		if (await fileExistsAtPath(outPath)) {
			continue
		}

		await fs.writeFile(outPath, JSON.stringify(data, null, 2), "utf8")
		return outPath
	}

	throw new Error(`Failed to find an unused filename for '${baseName}' in '${dir}'.`)
}

export class TraceExporter {
	static buildTraceForCouncil(params: {
		taskId: string
		uiMessages: ClineMessage[]
		apiMessages: unknown[]
		historyItem?: HistoryItem
	}): TraceV1 {
		const { taskId, uiMessages, apiMessages, historyItem } = params

		return createTraceV1({
			source: { kind: "vscode", taskId },
			task: historyItem
				? {
						id: historyItem.id,
						number: historyItem.number,
						title: historyItem.task,
						workspace: historyItem.workspace,
						mode: historyItem.mode,
						ts: historyItem.ts,
					}
				: { id: taskId },
			historyItem,
			uiMessages,
			apiMessages,
		})
	}

	static async exportTraceForCouncil(
		options: ExportTraceForCouncilOptions,
	): Promise<{ trace: TraceV1; outputPath: string }> {
		const { workspaceRoot, globalStoragePath, taskId, historyItem, redact } = options

		const [uiMessages, apiMessages] = await Promise.all([
			readTaskMessages({ taskId, globalStoragePath }),
			readApiMessages({ taskId, globalStoragePath }),
		])

		const trace = TraceExporter.buildTraceForCouncil({ taskId, uiMessages, apiMessages, historyItem })

		const finalTrace = redact ? redactTraceV1(trace).value : trace

		const outDir = path.join(workspaceRoot, ".kilocode", "traces", "runs")
		const ts = formatTimestampForFilename(new Date())
		const shortTask = taskId.slice(0, 8)
		const baseName = `trace.v1.${shortTask}.${ts}.json`

		const outputPath = await writeJsonUnique(outDir, baseName, finalTrace)

		return { trace: finalTrace, outputPath }
	}
}
