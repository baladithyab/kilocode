import { execa } from "execa"

/**
 * Detects if Docker is available and running on the system
 */
export class DockerDetector {
	private static isAvailable: boolean | undefined
	private static version: string | undefined

	/**
	 * Check if Docker is available
	 */
	static async checkAvailability(): Promise<boolean> {
		if (this.isAvailable !== undefined) {
			return this.isAvailable
		}

		try {
			const { stdout } = await execa("docker", ["--version"])
			this.version = stdout.trim()
			this.isAvailable = true
			return true
		} catch (error) {
			this.isAvailable = false
			return false
		}
	}

	/**
	 * Get the detected Docker version
	 */
	static getVersion(): string | undefined {
		return this.version
	}

	/**
	 * Reset detection cache (useful for testing)
	 */
	static reset(): void {
		this.isAvailable = undefined
		this.version = undefined
	}
}
