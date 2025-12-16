import * as fs from "fs/promises"
import * as path from "path"

import { z } from "zod"
import { clineMessageSchema, createTraceV1, redactTraceV1, traceV1Schema } from "@roo-code/types"

export type TraceExportCliArgs = {
	workspaceRoot: string
	/** Existing trace.v1 file to (re-)export into .kilocode/traces/runs */
	traceInputPath?: string
	/** Task directory containing ui_messages.json (+ optional api_conversation_history.json) */
	taskDir?: string
	redact: boolean
	outDir?: string
}

function formatTimestampForFilename(date: Date): string {
	const iso = date.toISOString()
	return iso.replace(/[-:]/g, "").replace(/\.(\d+)Z$/, "Z")
}

async function fileExists(p: string): Promise<boolean> {
	try {
		await fs.access(p)
		return true
	} catch {
		return false
	}
}

async function writeJsonUnique(dir: string, baseName: string, data: unknown): Promise<string> {
	await fs.mkdir(dir, { recursive: true })

	const ext = path.extname(baseName) || ".json"
	const name = ext ? baseName.slice(0, -ext.length) : baseName

	for (let i = 0; i < 1000; i++) {
		const suffix = i === 0 ? "" : `-${String(i).padStart(3, "0")}`
		const fileName = `${name}${suffix}${ext}`
		const outPath = path.join(dir, fileName)

		if (await fileExists(outPath)) {
			continue
		}

		await fs.writeFile(outPath, JSON.stringify(data, null, 2), "utf8")
		return outPath
	}

	throw new Error(`Failed to find an unused filename for '${baseName}' in '${dir}'.`)
}

// Avoid TS "type instantiation is excessively deep" issues with complex zod generics.
const uiMessagesSchema: z.ZodTypeAny = z.array(clineMessageSchema as unknown as z.ZodTypeAny)

export async function runTraceExportCli(args: TraceExportCliArgs): Promise<{ outputPath: string }> {
	const { workspaceRoot, traceInputPath, taskDir, redact, outDir } = args

	if (!traceInputPath && !taskDir) {
		throw new Error("Provide either --trace <file> or --task-dir <path>.")
	}

	if (traceInputPath && taskDir) {
		throw new Error("Provide only one of --trace or --task-dir.")
	}

	let trace = undefined

	if (traceInputPath) {
		const raw = await fs.readFile(traceInputPath, "utf8")
		trace = traceV1Schema.parse(JSON.parse(raw))
	}

	if (taskDir) {
		const uiPath = path.join(taskDir, "ui_messages.json")
		const apiPath = path.join(taskDir, "api_conversation_history.json")

		const uiRaw = await fs.readFile(uiPath, "utf8")
		const uiMessages = uiMessagesSchema.parse(JSON.parse(uiRaw))

		let apiMessages: unknown[] = []
		if (await fileExists(apiPath)) {
			try {
				const apiRaw = await fs.readFile(apiPath, "utf8")
				const parsed = JSON.parse(apiRaw)
				apiMessages = Array.isArray(parsed) ? parsed : [parsed]
			} catch {
				apiMessages = []
			}
		}

		const taskId = path.basename(path.resolve(taskDir))

		trace = createTraceV1({
			source: { kind: "cli", taskDir, inputPath: taskDir },
			task: { id: taskId, title: uiMessages[0]?.text },
			uiMessages,
			apiMessages,
		})
	}

	if (!trace) {
		throw new Error("Failed to construct trace")
	}

	const finalTrace = redact ? redactTraceV1(trace).value : trace

	const outputDir = outDir
		? path.resolve(workspaceRoot, outDir)
		: path.join(workspaceRoot, ".kilocode", "traces", "runs")
	const ts = formatTimestampForFilename(new Date())
	const baseName = `trace.v1.${ts}.json`

	const outputPath = await writeJsonUnique(outputDir, baseName, finalTrace)
	return { outputPath }
}
