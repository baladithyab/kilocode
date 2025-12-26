import { describe, it, expect, vi, beforeEach } from "vitest"
import { DockerSkillExecutor } from "../DockerSkillExecutor"
import { DockerDetector } from "../DockerDetector"
import { execa } from "execa"

vi.mock("execa")
vi.mock("../DockerDetector")

describe("DockerSkillExecutor", () => {
	let executor: DockerSkillExecutor

	beforeEach(() => {
		executor = new DockerSkillExecutor()
		vi.resetAllMocks()
	})

	it("should fail if docker is not available", async () => {
		vi.mocked(DockerDetector.checkAvailability).mockResolvedValue(false)

		const result = await executor.execute({ id: "test-skill" } as any, "console.log('hello')")

		expect(result.status).toBe("failed")
		expect(result.error).toContain("Docker is not available")
	})

	it("should execute skill in docker", async () => {
		vi.mocked(DockerDetector.checkAvailability).mockResolvedValue(true)
		vi.mocked(execa).mockResolvedValue({
			stdout: "---RESULT---\n" + JSON.stringify({ success: true }),
			stderr: "",
			exitCode: 0,
			failed: false,
			timedOut: false,
		} as any)

		const result = await executor.execute({ id: "test-skill" } as any, "console.log('hello')")

		expect(result.status).toBe("completed")
		expect(result.returnValue).toEqual({ success: true })
		expect(execa).toHaveBeenCalledWith("docker", expect.arrayContaining(["run", "node", "-e"]), expect.any(Object))
	})

	it("should handle execution failure", async () => {
		vi.mocked(DockerDetector.checkAvailability).mockResolvedValue(true)
		vi.mocked(execa).mockResolvedValue({
			stdout: "",
			stderr: "Error: something went wrong",
			exitCode: 1,
			failed: true,
			timedOut: false,
		} as any)

		const result = await executor.execute({ id: "test-skill" } as any, "throw new Error('fail')")

		expect(result.status).toBe("failed")
		expect(result.error).toContain("Error: something went wrong")
	})

	it("should handle timeout", async () => {
		vi.mocked(DockerDetector.checkAvailability).mockResolvedValue(true)
		vi.mocked(execa).mockResolvedValue({
			stdout: "",
			stderr: "",
			exitCode: 0,
			failed: false,
			timedOut: true,
		} as any)

		const result = await executor.execute({ id: "test-skill" } as any, "while(true){}")

		expect(result.status).toBe("timeout")
		expect(result.error).toContain("timed out")
	})
})
