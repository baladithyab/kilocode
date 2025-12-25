import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"
import { TraceCapture } from "../TraceCapture"
import { TraceStorage } from "../TraceStorage"
import { DEFAULT_DARWIN_CONFIG } from "@roo-code/types"

describe("TraceCapture", () => {
	let tempDir: string
	let traceCapture: TraceCapture

	beforeEach(async () => {
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "kilocode-trace-test-"))
		const config = { ...DEFAULT_DARWIN_CONFIG, enabled: true, traceCapture: true }
		traceCapture = new TraceCapture({ workspacePath: tempDir }, config)
		await traceCapture.initialize()
	})

	afterEach(async () => {
		await traceCapture.close()
		await fs.rm(tempDir, { recursive: true, force: true })
	})

	it("should capture tool success events", async () => {
		const taskId = "test-task-1"
		traceCapture.captureToolSuccess(taskId, "read_file", "Read file successfully")

		const traces = traceCapture.getTraces({ taskId })
		expect(traces).toHaveLength(1)
		expect(traces[0].type).toBe("tool_success")
		expect(traces[0].toolName).toBe("read_file")
	})

	it("should capture tool error events", async () => {
		const taskId = "test-task-2"
		traceCapture.captureToolError(taskId, "execute_command", "Command failed")

		const traces = traceCapture.getTraces({ taskId })
		expect(traces).toHaveLength(1)
		expect(traces[0].type).toBe("tool_error")
		expect(traces[0].toolName).toBe("execute_command")
		expect(traces[0].errorMessage).toBe("Command failed")
	})

	it("should detect doom loops (repeated failures)", async () => {
		const taskId = "test-task-3"
		const toolName = "edit_file"

		// Simulate 3 failures
		traceCapture.captureToolError(taskId, toolName, "Error 1")
		traceCapture.captureToolError(taskId, toolName, "Error 2")
		traceCapture.captureToolError(taskId, toolName, "Error 3")

		const recentErrors = traceCapture.getRecentToolErrors(toolName)
		expect(recentErrors).toHaveLength(3)

		// Capture doom loop detected event
		traceCapture.captureDoomLoopDetected(taskId, toolName, "Repeated failures", 3)

		const traces = traceCapture.getTraces({ taskId })
		const doomLoopEvent = traces.find((t) => t.type === "doom_loop_detected")
		expect(doomLoopEvent).toBeDefined()
		expect(doomLoopEvent?.toolName).toBe(toolName)
	})

	it("should persist traces to disk", async () => {
		const taskId = "test-task-4"
		traceCapture.captureToolSuccess(taskId, "list_files", "Listed files")

		// Force flush to disk
		await traceCapture.flush()

		// Check if file exists
		const storageDir = path.join(tempDir, ".kilocode", "evolution", "traces")
		const files = await fs.readdir(storageDir)
		expect(files.length).toBeGreaterThan(0)

		// Read file content
		const content = await fs.readFile(path.join(storageDir, files[0]), "utf-8")
		expect(content).toContain("list_files")
		expect(content).toContain(taskId)
	})

	it("should prune old traces", async () => {
		// Create a dummy old trace file
		const storageDir = path.join(tempDir, ".kilocode", "evolution", "traces")
		await fs.mkdir(storageDir, { recursive: true })

		const oldDate = new Date()
		oldDate.setDate(oldDate.getDate() - 40) // 40 days ago
		// Fix: filename must start with "traces-" to be recognized by TraceStorage
		const oldFileName = `traces-${oldDate.toISOString().split("T")[0]}.jsonl`
		const filePath = path.join(storageDir, oldFileName)
		await fs.writeFile(filePath, "{}")

		// Update file timestamp to be old (though TraceStorage uses filename date)
		await fs.utimes(filePath, oldDate, oldDate)

		// Prune traces older than 30 days
		const prunedCount = await traceCapture.pruneOldTraces(30)
		expect(prunedCount).toBe(1)

		const files = await fs.readdir(storageDir)
		expect(files).not.toContain(oldFileName)
	})
})
