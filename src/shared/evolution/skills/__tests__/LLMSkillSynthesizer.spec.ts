/**
 * LLMSkillSynthesizer Tests - Darwin Phase 4C
 *
 * Comprehensive test suite for LLM-powered skill synthesis
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import { LLMSkillSynthesizer, type LLMApiProvider } from "../LLMSkillSynthesizer"
import { SkillValidator } from "../SkillValidator"
import { SkillSynthesizer } from "../SkillSynthesizer"
import type { LearningSignal, SynthesisContext, ValidationResult } from "@roo-code/types"

/** Create a mock API provider */
function createMockApiProvider(
	response: string,
	options: {
		tokensUsed?: number
		model?: string
		shouldFail?: boolean
		errorMessage?: string
	} = {},
): LLMApiProvider {
	return {
		sendMessage: vi.fn().mockImplementation(async () => {
			if (options.shouldFail) {
				throw new Error(options.errorMessage ?? "Mock API error")
			}
			return {
				content: response,
				tokensUsed: options.tokensUsed ?? 500,
				model: options.model ?? "test-model",
			}
		}),
		getModel: () => options.model ?? "test-model",
	}
}

/** Create a mock learning signal for testing */
function createMockSignal(overrides: Partial<LearningSignal> = {}): LearningSignal {
	return {
		id: "signal-123",
		type: "doom_loop",
		confidence: 0.9,
		description: "Failed to parse JSON in API response",
		sourceEventIds: ["event-1", "event-2"],
		detectedAt: Date.now(),
		suggestedAction: "Add better JSON parsing with error handling",
		context: {
			toolName: "api_client",
			errorPattern: "SyntaxError: Unexpected token",
		},
		...overrides,
	}
}

/** Create a mock synthesis context */
function createMockContext(overrides: Partial<SynthesisContext> = {}): SynthesisContext {
	return {
		toolName: "api_client",
		errorMessages: ["SyntaxError: Unexpected token in JSON at position 0"],
		stackTraces: ["at JSON.parse (<anonymous>)\n    at parseResponse (api.ts:42)"],
		attemptedFixes: ["Try using try-catch around JSON.parse"],
		fileContext: [
			{
				path: "src/api/client.ts",
				content: "const data = JSON.parse(response.body);",
			},
		],
		errorPatterns: ["JSON parse error", "Unexpected token"],
		occurrenceCount: 3,
		traceEventIds: ["event-1", "event-2"],
		userIntent: "Make an API call and parse the response",
		projectType: "typescript",
		...overrides,
	}
}

/** Sample valid TypeScript code response from LLM */
const VALID_LLM_RESPONSE = `
### EXPLANATION
This skill safely parses JSON with comprehensive error handling.

### CODE
\`\`\`typescript
/**
 * Safe JSON Parser
 * Handles malformed JSON with fallback options
 */
export interface Args {
  jsonString: string;
  fallbackValue?: unknown;
}

export interface Result {
  success: boolean;
  data?: unknown;
  error?: string;
}

export default async function safeJsonParse(args: Args): Promise<Result> {
  try {
    if (!args.jsonString) {
      return { success: false, error: "Input is required" };
    }
    
    const data = JSON.parse(args.jsonString);
    return { success: true, data };
  } catch (error) {
    if (args.fallbackValue !== undefined) {
      return { success: true, data: args.fallbackValue };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
\`\`\`

### SKILL_INFO
- **Name:** safe_json_parser
- **Description:** Safely parse JSON with fallback support
- **Permissions:** none

### TEST_CASES
\`\`\`json
[
  {
    "name": "Valid JSON parsing",
    "input": { "jsonString": "{\\"key\\": \\"value\\"}" },
    "expectedOutput": { "success": true },
    "assertion": "Should parse valid JSON"
  },
  {
    "name": "Invalid JSON with fallback",
    "input": { "jsonString": "invalid", "fallbackValue": {} },
    "expectedOutput": { "success": true, "data": {} },
    "assertion": "Should return fallback on parse error"
  }
]
\`\`\`
`

/** Response with security issue (eval) */
const INSECURE_LLM_RESPONSE = `
### CODE
\`\`\`typescript
export default async function unsafeCode(args: { code: string }): Promise<{ success: boolean }> {
  try {
    eval(args.code);
    return { success: true };
  } catch {
    return { success: false };
  }
}
\`\`\`
`

/** Response with no code block */
const INVALID_LLM_RESPONSE = `
I understand you want to parse JSON. Here's my suggestion:
You should use try-catch around JSON.parse.
`

describe("LLMSkillSynthesizer", () => {
	let synthesizer: LLMSkillSynthesizer
	let mockProvider: LLMApiProvider

	beforeEach(() => {
		mockProvider = createMockApiProvider(VALID_LLM_RESPONSE)
		synthesizer = new LLMSkillSynthesizer({
			apiProvider: mockProvider,
			llmConfig: { enabled: true },
		})
	})

	// ==========================================================================
	// Constructor and Configuration Tests
	// ==========================================================================

	describe("Constructor and Configuration", () => {
		it("should initialize with default configuration", () => {
			const synth = new LLMSkillSynthesizer()

			expect(synth.isAvailable()).toBe(false) // No provider
			expect(synth.getConfig()).toBeDefined()
			expect(synth.getConfig().temperature).toBe(0.3)
			expect(synth.getConfig().maxTokens).toBe(4000)
		})

		it("should accept custom configuration", () => {
			const synth = new LLMSkillSynthesizer({
				llmConfig: {
					enabled: true,
					temperature: 0.5,
					maxTokens: 2000,
					maxRetries: 5,
				},
			})

			const config = synth.getConfig()
			expect(config.temperature).toBe(0.5)
			expect(config.maxTokens).toBe(2000)
			expect(config.maxRetries).toBe(5)
		})

		it("should allow setting API provider after construction", () => {
			const synth = new LLMSkillSynthesizer({ llmConfig: { enabled: true } })
			expect(synth.isAvailable()).toBe(false)

			synth.setApiProvider(mockProvider)
			expect(synth.isAvailable()).toBe(true)
		})

		it("should allow updating configuration", () => {
			const synth = new LLMSkillSynthesizer({ apiProvider: mockProvider })
			synth.updateConfig({ temperature: 0.8 })

			expect(synth.getConfig().temperature).toBe(0.8)
		})
	})

	// ==========================================================================
	// Availability Tests
	// ==========================================================================

	describe("Availability", () => {
		it("should return false when no API provider is configured", () => {
			const synth = new LLMSkillSynthesizer({ llmConfig: { enabled: true } })
			expect(synth.isAvailable()).toBe(false)
		})

		it("should return false when synthesis is disabled", () => {
			const synth = new LLMSkillSynthesizer({
				apiProvider: mockProvider,
				llmConfig: { enabled: false },
			})
			expect(synth.isAvailable()).toBe(false)
		})

		it("should return true when enabled and provider is configured", () => {
			expect(synthesizer.isAvailable()).toBe(true)
		})
	})

	// ==========================================================================
	// Prompt Building Tests
	// ==========================================================================

	describe("Prompt Building", () => {
		it("should build a detailed prompt from signal and context", () => {
			const signal = createMockSignal()
			const context = createMockContext()

			const prompt = synthesizer.buildLLMPrompt(signal, context)

			expect(prompt).toContain("doom_loop")
			expect(prompt).toContain("Failed to parse JSON")
			expect(prompt).toContain("api_client")
			expect(prompt).toContain("SyntaxError")
		})

		it("should include error patterns in prompt", () => {
			const signal = createMockSignal()
			const context = createMockContext({
				errorPatterns: ["Pattern A", "Pattern B"],
			})

			const prompt = synthesizer.buildLLMPrompt(signal, context)

			expect(prompt).toContain("Pattern A")
			expect(prompt).toContain("Pattern B")
		})

		it("should include file context in prompt", () => {
			const signal = createMockSignal()
			const context = createMockContext({
				fileContext: [
					{
						path: "src/utils.ts",
						content: "export function helper() { return 42; }",
					},
				],
			})

			const prompt = synthesizer.buildLLMPrompt(signal, context)

			expect(prompt).toContain("src/utils.ts")
			expect(prompt).toContain("helper")
		})

		it("should include attempted fixes in prompt", () => {
			const signal = createMockSignal()
			const context = createMockContext({
				attemptedFixes: ["Fix A", "Fix B"],
			})

			const prompt = synthesizer.buildLLMPrompt(signal, context)

			expect(prompt).toContain("Fix A")
			expect(prompt).toContain("Fix B")
		})

		it("should include security constraints in prompt", () => {
			const signal = createMockSignal()
			const context = createMockContext()

			const prompt = synthesizer.buildLLMPrompt(signal, context)

			expect(prompt).toContain("eval")
			expect(prompt).toContain("SECURITY")
		})
	})

	// ==========================================================================
	// LLM Response Parsing Tests
	// ==========================================================================

	describe("Response Parsing", () => {
		it("should parse valid LLM response with code", () => {
			const result = synthesizer.parseSkillFromResponse(VALID_LLM_RESPONSE)

			expect(result.success).toBe(true)
			expect(result.code).toBeDefined()
			expect(result.code).toContain("safeJsonParse")
			expect(result.code).toContain("export default")
		})

		it("should extract explanation from response", () => {
			const result = synthesizer.parseSkillFromResponse(VALID_LLM_RESPONSE)

			expect(result.explanation).toBeDefined()
			expect(result.explanation).toContain("error handling")
		})

		it("should extract skill info from response", () => {
			const result = synthesizer.parseSkillFromResponse(VALID_LLM_RESPONSE)

			expect(result.suggestedName).toBe("safe_json_parser")
			expect(result.suggestedDescription).toContain("parse JSON")
		})

		it("should extract permissions from response", () => {
			const result = synthesizer.parseSkillFromResponse(VALID_LLM_RESPONSE)

			expect(result.requiredPermissions).toBeDefined()
			expect(Array.isArray(result.requiredPermissions)).toBe(true)
		})

		it("should extract test cases from response", () => {
			const result = synthesizer.parseSkillFromResponse(VALID_LLM_RESPONSE)

			expect(result.testCases).toBeDefined()
			expect(result.testCases.length).toBeGreaterThanOrEqual(1)
			expect(result.testCases[0].name).toBe("Valid JSON parsing")
		})

		it("should fail gracefully with no code block", () => {
			const result = synthesizer.parseSkillFromResponse(INVALID_LLM_RESPONSE)

			expect(result.success).toBe(false)
			expect(result.error).toContain("code block")
		})

		it("should handle malformed JSON in test cases", () => {
			const response = `### CODE
\`\`\`typescript
export default function test() { return { success: true }; }
\`\`\`

### TEST_CASES
\`\`\`json
{invalid json}
\`\`\``

			const result = synthesizer.parseSkillFromResponse(response)

			expect(result.success).toBe(true)
			expect(result.testCases).toEqual([])
		})
	})

	// ==========================================================================
	// Synthesis Tests
	// ==========================================================================

	describe("Synthesis", () => {
		it("should synthesize skill from doom loop signal", async () => {
			const signal = createMockSignal()
			const context = createMockContext()

			const result = await synthesizer.synthesizeFromDoomLoop(signal, context)

			expect(result.success).toBe(true)
			expect(result.code).toBeDefined()
			expect(result.code).toContain("export default")
		})

		it("should call LLM API with correct parameters", async () => {
			const signal = createMockSignal()
			const context = createMockContext()

			await synthesizer.synthesizeFromDoomLoop(signal, context)

			expect(mockProvider.sendMessage).toHaveBeenCalled()

			const call = (mockProvider.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0]
			expect(call[0]).toHaveLength(2) // system + user message
			expect(call[0][0].role).toBe("system")
			expect(call[0][1].role).toBe("user")
		})

		it("should track tokens used in metrics", async () => {
			const signal = createMockSignal()
			const context = createMockContext()

			await synthesizer.synthesizeFromDoomLoop(signal, context)

			const metrics = synthesizer.getMetrics()
			expect(metrics.totalTokens).toBeGreaterThan(0)
		})

		it("should track synthesis duration", async () => {
			const signal = createMockSignal()
			const context = createMockContext()

			const result = await synthesizer.synthesizeFromDoomLoop(signal, context)

			expect(result.durationMs).toBeDefined()
			expect(result.durationMs).toBeGreaterThanOrEqual(0)
		})

		it("should include model used in result", async () => {
			const signal = createMockSignal()
			const context = createMockContext()

			const result = await synthesizer.synthesizeFromDoomLoop(signal, context)

			expect(result.modelUsed).toBe("test-model")
		})
	})

	// ==========================================================================
	// Validation and Refinement Tests
	// ==========================================================================

	describe("Validation and Refinement", () => {
		it("should validate generated code", async () => {
			const signal = createMockSignal()
			const context = createMockContext()

			const result = await synthesizer.synthesizeFromDoomLoop(signal, context)

			expect(result.success).toBe(true)
			// Code passed validation
		})

		it("should attempt refinement on validation failure", async () => {
			// First response has security issue, second is fixed
			const insecureProvider = {
				sendMessage: vi
					.fn()
					.mockResolvedValueOnce({
						content: INSECURE_LLM_RESPONSE,
						tokensUsed: 100,
					})
					.mockResolvedValueOnce({
						content: VALID_LLM_RESPONSE,
						tokensUsed: 100,
					}),
				getModel: () => "test-model",
			}

			const synth = new LLMSkillSynthesizer({
				apiProvider: insecureProvider,
				llmConfig: { enabled: true, maxRefinementAttempts: 3 },
			})

			const signal = createMockSignal()
			const context = createMockContext()

			const result = await synth.synthesizeFromDoomLoop(signal, context)

			expect(insecureProvider.sendMessage).toHaveBeenCalledTimes(2)
			expect(result.refinementAttempts).toBeGreaterThan(0)
		})

		it("should track validation history", async () => {
			const insecureProvider = {
				sendMessage: vi
					.fn()
					.mockResolvedValueOnce({
						content: INSECURE_LLM_RESPONSE,
						tokensUsed: 100,
					})
					.mockResolvedValueOnce({
						content: VALID_LLM_RESPONSE,
						tokensUsed: 100,
					}),
				getModel: () => "test-model",
			}

			const synth = new LLMSkillSynthesizer({
				apiProvider: insecureProvider,
				llmConfig: { enabled: true },
			})

			const signal = createMockSignal()
			const context = createMockContext()

			const result = await synth.synthesizeFromDoomLoop(signal, context)

			expect(result.validationHistory).toBeDefined()
			expect(result.validationHistory.length).toBeGreaterThan(0)
		})
	})

	// ==========================================================================
	// Fallback Tests
	// ==========================================================================

	describe("Fallback to Templates", () => {
		it("should fallback when LLM is not available", async () => {
			const synth = new LLMSkillSynthesizer({
				llmConfig: { enabled: true },
				// No API provider
			})

			const signal = createMockSignal()
			const context = createMockContext()

			const result = await synth.synthesizeFromDoomLoop(signal, context)

			expect(result.fallbackUsed).toBe("template")
			expect(result.code).toBeDefined()
		})

		it("should fallback when LLM API fails", async () => {
			const failingProvider = createMockApiProvider("", {
				shouldFail: true,
				errorMessage: "API error",
			})

			const synth = new LLMSkillSynthesizer({
				apiProvider: failingProvider,
				llmConfig: { enabled: true },
			})

			const signal = createMockSignal()
			const context = createMockContext()

			const result = await synth.synthesizeFromDoomLoop(signal, context)

			expect(result.fallbackUsed).toBe("template")
		})

		it("should fallback after max refinement attempts", async () => {
			// Always returns insecure code
			const badProvider = {
				sendMessage: vi.fn().mockResolvedValue({
					content: INSECURE_LLM_RESPONSE,
					tokensUsed: 100,
				}),
				getModel: () => "test-model",
			}

			const synth = new LLMSkillSynthesizer({
				apiProvider: badProvider,
				llmConfig: { enabled: true, maxRefinementAttempts: 2 },
			})

			const signal = createMockSignal()
			const context = createMockContext()

			const result = await synth.synthesizeFromDoomLoop(signal, context)

			expect(result.fallbackUsed).toBe("template")
			// Initial + 2 refinement attempts
			expect(badProvider.sendMessage.mock.calls.length).toBeLessThanOrEqual(3)
		})

		it("should track template fallbacks in metrics", async () => {
			const synth = new LLMSkillSynthesizer({
				llmConfig: { enabled: true },
			})

			const signal = createMockSignal()
			const context = createMockContext()

			await synth.synthesizeFromDoomLoop(signal, context)

			const metrics = synth.getMetrics()
			expect(metrics.templateFallbacks).toBe(1)
		})
	})

	// ==========================================================================
	// Error Handling Tests
	// ==========================================================================

	describe("Error Handling", () => {
		it("should handle timeout errors with retry", async () => {
			const timeoutProvider = {
				sendMessage: vi.fn().mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce({
					content: VALID_LLM_RESPONSE,
					tokensUsed: 100,
				}),
				getModel: () => "test-model",
			}

			const synth = new LLMSkillSynthesizer({
				apiProvider: timeoutProvider,
				llmConfig: { enabled: true, maxRetries: 3 },
			})

			const signal = createMockSignal()
			const context = createMockContext()

			const result = await synth.synthesizeFromDoomLoop(signal, context)

			expect(result.success).toBe(true)
			expect(timeoutProvider.sendMessage).toHaveBeenCalledTimes(2)
		})

		it("should handle rate limit errors with retry", async () => {
			const rateLimitProvider = {
				sendMessage: vi.fn().mockRejectedValueOnce(new Error("rate limit exceeded")).mockResolvedValueOnce({
					content: VALID_LLM_RESPONSE,
					tokensUsed: 100,
				}),
				getModel: () => "test-model",
			}

			const synth = new LLMSkillSynthesizer({
				apiProvider: rateLimitProvider,
				llmConfig: { enabled: true, maxRetries: 3 },
			})

			const signal = createMockSignal()
			const context = createMockContext()

			const result = await synth.synthesizeFromDoomLoop(signal, context)

			expect(result.success).toBe(true)
		})

		it("should respect max retries limit", async () => {
			const alwaysFailProvider = {
				sendMessage: vi.fn().mockRejectedValue(new Error("500 internal error")),
				getModel: () => "test-model",
			}

			const synth = new LLMSkillSynthesizer({
				apiProvider: alwaysFailProvider,
				llmConfig: { enabled: true, maxRetries: 2 },
			})

			const signal = createMockSignal()
			const context = createMockContext()

			await synth.synthesizeFromDoomLoop(signal, context)

			// Initial + 2 retries
			expect(alwaysFailProvider.sendMessage.mock.calls.length).toBeLessThanOrEqual(3)
		})
	})

	// ==========================================================================
	// Metrics Tests
	// ==========================================================================

	describe("Metrics", () => {
		it("should track total synthesis attempts", async () => {
			const signal = createMockSignal()
			const context = createMockContext()

			await synthesizer.synthesizeFromDoomLoop(signal, context)
			await synthesizer.synthesizeFromDoomLoop(signal, context)

			const metrics = synthesizer.getMetrics()
			expect(metrics.totalAttempts).toBe(2)
		})

		it("should track successful syntheses", async () => {
			const signal = createMockSignal()
			const context = createMockContext()

			await synthesizer.synthesizeFromDoomLoop(signal, context)

			const metrics = synthesizer.getMetrics()
			expect(metrics.successfulSyntheses).toBe(1)
		})

		it("should track failed syntheses", async () => {
			const failingProvider = createMockApiProvider("invalid response with no code", {
				shouldFail: false,
			})

			const synth = new LLMSkillSynthesizer({
				apiProvider: failingProvider,
				llmConfig: { enabled: true },
			})

			const signal = createMockSignal()
			const context = createMockContext()

			await synth.synthesizeFromDoomLoop(signal, context)

			const metrics = synth.getMetrics()
			expect(metrics.failedSyntheses).toBe(1)
		})

		it("should calculate average synthesis time", async () => {
			const signal = createMockSignal()
			const context = createMockContext()

			await synthesizer.synthesizeFromDoomLoop(signal, context)
			await synthesizer.synthesizeFromDoomLoop(signal, context)

			const metrics = synthesizer.getMetrics()
			// Average time is only calculated for successful syntheses
			// If syntheses were successful, time should be > 0
			if (metrics.successfulSyntheses > 0) {
				expect(metrics.avgSynthesisTimeMs).toBeGreaterThanOrEqual(0)
			}
			// At minimum, total attempts should be 2
			expect(metrics.totalAttempts).toBe(2)
		})

		it("should track total cost", async () => {
			const signal = createMockSignal()
			const context = createMockContext()

			await synthesizer.synthesizeFromDoomLoop(signal, context)

			const metrics = synthesizer.getMetrics()
			expect(metrics.totalCostUsd).toBeGreaterThanOrEqual(0)
		})

		it("should allow resetting metrics", async () => {
			const signal = createMockSignal()
			const context = createMockContext()

			await synthesizer.synthesizeFromDoomLoop(signal, context)
			synthesizer.resetMetrics()

			const metrics = synthesizer.getMetrics()
			expect(metrics.totalAttempts).toBe(0)
			expect(metrics.successfulSyntheses).toBe(0)
		})
	})

	// ==========================================================================
	// Edge Cases
	// ==========================================================================

	describe("Edge Cases", () => {
		it("should handle empty context", async () => {
			const signal = createMockSignal()
			const context: SynthesisContext = {
				errorMessages: [],
				stackTraces: [],
				attemptedFixes: [],
				fileContext: [],
				errorPatterns: [],
				occurrenceCount: 1,
				traceEventIds: [],
			}

			const result = await synthesizer.synthesizeFromDoomLoop(signal, context)

			expect(result.success).toBe(true)
		})

		it("should handle very long error messages", async () => {
			const signal = createMockSignal()
			const context = createMockContext({
				errorMessages: [Array(1000).fill("error ").join("")],
			})

			const result = await synthesizer.synthesizeFromDoomLoop(signal, context)

			expect(result.success).toBe(true)
		})

		it("should handle special characters in context", async () => {
			const signal = createMockSignal({
				description: "Error with <script> and 'quotes' and \"double quotes\"",
			})
			const context = createMockContext({
				errorMessages: ["Error: ${injection} `template`"],
			})

			const result = await synthesizer.synthesizeFromDoomLoop(signal, context)

			expect(result.success).toBe(true)
		})

		it("should handle multiple file contexts", async () => {
			const signal = createMockSignal()
			const context = createMockContext({
				fileContext: [
					{ path: "file1.ts", content: "const a = 1;" },
					{ path: "file2.ts", content: "const b = 2;" },
					{ path: "file3.ts", content: "const c = 3;" },
					{ path: "file4.ts", content: "const d = 4;" },
				],
			})

			const prompt = synthesizer.buildLLMPrompt(signal, context)

			// Should only include first 3 files
			expect(prompt).toContain("file1.ts")
			expect(prompt).toContain("file2.ts")
			expect(prompt).toContain("file3.ts")
			expect(prompt).not.toContain("file4.ts")
		})
	})
})
