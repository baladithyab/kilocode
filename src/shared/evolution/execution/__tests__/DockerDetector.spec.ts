import { describe, it, expect, vi, beforeEach } from "vitest"
import { DockerDetector } from "../DockerDetector"
import { execa } from "execa"

vi.mock("execa")

describe("DockerDetector", () => {
	beforeEach(() => {
		DockerDetector.reset()
		vi.resetAllMocks()
	})

	it("should return true when docker is available", async () => {
		vi.mocked(execa).mockResolvedValue({ stdout: "Docker version 20.10.0" } as any)

		const available = await DockerDetector.checkAvailability()
		expect(available).toBe(true)
		expect(DockerDetector.getVersion()).toBe("Docker version 20.10.0")
	})

	it("should return false when docker is not available", async () => {
		vi.mocked(execa).mockRejectedValue(new Error("Command not found"))

		const available = await DockerDetector.checkAvailability()
		expect(available).toBe(false)
		expect(DockerDetector.getVersion()).toBeUndefined()
	})

	it("should cache the result", async () => {
		vi.mocked(execa).mockResolvedValue({ stdout: "Docker version 20.10.0" } as any)

		await DockerDetector.checkAvailability()
		await DockerDetector.checkAvailability()

		expect(execa).toHaveBeenCalledTimes(1)
	})
})
