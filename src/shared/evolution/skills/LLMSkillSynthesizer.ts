/**
 * LLMSkillSynthesizer - LLM-powered skill generation for Darwin Phase 4C
 *
 * Responsibilities:
 * - Analyze doom loop context deeply
 * - Generate detailed prompts for LLM
 * - Request TypeScript code to solve capability gaps
 * - Parse and validate LLM responses
 * - Support iterative refinement on validation failure
 * - Fall back to template-based synthesis when needed
 *
 * Uses existing API provider infrastructure for LLM calls
 */

import type {
	SkillMetadata,
	LearningSignal,
	LLMSynthesisConfig,
	LLMSynthesisResult,
	SynthesisContext,
	SynthesisTestCase,
	ValidationResult,
	ValidationIssue,
	SkillRuntime,
	SkillScope,
	SynthesisPromptConfig,
	SynthesisMetrics,
} from "@roo-code/types"

import { DEFAULT_LLM_SYNTHESIS_CONFIG } from "@roo-code/types"
import { SkillValidator } from "./SkillValidator"
import { SkillSynthesizer, type SynthesisResult } from "./SkillSynthesizer"

/**
 * Interface for API provider to make LLM calls
 * This abstracts the actual API provider implementation
 */
export interface LLMApiProvider {
	/**
	 * Send a message to the LLM and get a response
	 */
	sendMessage(
		messages: Array<{ role: "user" | "assistant" | "system"; content: string }>,
		options?: {
			temperature?: number
			maxTokens?: number
			timeout?: number
		},
	): Promise<{
		content: string
		tokensUsed?: number
		model?: string
	}>

	/**
	 * Get the model identifier
	 */
	getModel(): string
}

/**
 * Configuration for LLMSkillSynthesizer
 */
export interface LLMSkillSynthesizerConfig {
	/** Configuration for LLM synthesis */
	llmConfig?: Partial<LLMSynthesisConfig>

	/** API provider for making LLM calls */
	apiProvider?: LLMApiProvider

	/** SkillValidator instance for validating generated code */
	validator?: SkillValidator

	/** SkillSynthesizer instance for template fallback */
	templateSynthesizer?: SkillSynthesizer

	/** Prompt configuration */
	promptConfig?: Partial<SynthesisPromptConfig>

	/** Default scope for synthesized skills */
	defaultScope?: SkillScope

	/** Default runtime for synthesized skills */
	defaultRuntime?: SkillRuntime

	/** Author name for generated skills */
	author?: string
}

/**
 * Default system prompt for skill synthesis
 */
const DEFAULT_SYSTEM_PROMPT = `You are an expert TypeScript developer tasked with creating skill functions to solve capability gaps in an AI coding agent.

Your generated code MUST follow these rules:
1. Write pure TypeScript code compatible with Node.js 18+
2. Export a single async function as default
3. Include comprehensive error handling with try/catch
4. Add TypeScript type annotations for all parameters and return types
5. Maximum file size: 50KB
6. Include JSDoc documentation for the main function
7. Return a structured result object with success/error fields

FORBIDDEN patterns (will cause rejection):
- eval(), new Function(), or any dynamic code execution
- Direct process.env modifications
- Infinite loops without exit conditions
- Global/prototype modifications
- Direct file system access without proper error handling

Always include proper input validation and graceful error handling.`

/**
 * Default constraints for generated code
 */
const DEFAULT_CONSTRAINTS = [
	"Must be self-contained TypeScript code",
	"Must export a default async function",
	"Must include input validation",
	"Must return { success: boolean, data?: unknown, error?: string }",
	"Must handle all errors gracefully",
	"No external dependencies beyond Node.js built-ins",
]

/**
 * LLMSkillSynthesizer generates skills using LLM for intelligent code generation
 */
export class LLMSkillSynthesizer {
	private config: LLMSynthesisConfig
	private apiProvider?: LLMApiProvider
	private validator: SkillValidator
	private templateSynthesizer: SkillSynthesizer
	private promptConfig: SynthesisPromptConfig
	private defaultScope: SkillScope
	private defaultRuntime: SkillRuntime
	private author: string
	private metrics: SynthesisMetrics

	constructor(config: LLMSkillSynthesizerConfig = {}) {
		this.config = {
			...DEFAULT_LLM_SYNTHESIS_CONFIG,
			...config.llmConfig,
		}

		this.apiProvider = config.apiProvider
		this.validator = config.validator ?? new SkillValidator()
		this.templateSynthesizer = config.templateSynthesizer ?? new SkillSynthesizer()
		this.defaultScope = config.defaultScope ?? "project"
		this.defaultRuntime = config.defaultRuntime ?? "typescript"
		this.author = config.author ?? "Darwin LLM Synthesis"

		this.promptConfig = {
			systemPrompt: config.promptConfig?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
			constraints: config.promptConfig?.constraints ?? DEFAULT_CONSTRAINTS,
			examplePatterns: config.promptConfig?.examplePatterns ?? [],
			includeSecurityWarnings: config.promptConfig?.includeSecurityWarnings ?? true,
			requestTestCases: config.promptConfig?.requestTestCases ?? true,
			maxContextLines: config.promptConfig?.maxContextLines ?? 100,
		}

		this.metrics = {
			totalAttempts: 0,
			successfulSyntheses: 0,
			failedSyntheses: 0,
			templateFallbacks: 0,
			totalTokens: 0,
			totalCostUsd: 0,
			avgSynthesisTimeMs: 0,
			avgRefinementAttempts: 0,
			synthesesToday: 0,
		}
	}

	/**
	 * Set the API provider for LLM calls
	 */
	setApiProvider(provider: LLMApiProvider): void {
		this.apiProvider = provider
	}

	/**
	 * Check if LLM synthesis is available and enabled
	 */
	isAvailable(): boolean {
		return this.config.enabled && this.apiProvider !== undefined
	}

	/**
	 * Synthesize a skill from a doom loop learning signal with context
	 */
	async synthesizeFromDoomLoop(signal: LearningSignal, context: SynthesisContext): Promise<LLMSynthesisResult> {
		const startTime = Date.now()
		this.metrics.totalAttempts++

		// Check if LLM synthesis is available
		if (!this.isAvailable()) {
			const fallbackResult = await this.fallbackToTemplate(signal)
			return {
				...fallbackResult,
				durationMs: Date.now() - startTime,
			}
		}

		try {
			// Build the synthesis prompt
			const prompt = this.buildLLMPrompt(signal, context)

			// Call LLM
			const llmResponse = await this.callLLM(prompt)

			if (!llmResponse.success || !llmResponse.content) {
				return this.handleLLMFailure(signal, llmResponse.error ?? "LLM call failed", startTime)
			}

			// Parse skill from response
			const parsedSkill = this.parseSkillFromResponse(llmResponse.content)

			if (!parsedSkill.success || !parsedSkill.code) {
				return this.handleLLMFailure(signal, parsedSkill.error ?? "Failed to parse LLM response", startTime)
			}

			// Validate the generated code
			const metadata = this.generateMetadata(parsedSkill.suggestedName ?? signal.description, signal)
			let validationResult = await this.validator.validate(parsedSkill.code, metadata)
			let code = parsedSkill.code
			let refinementAttempts = 0
			const validationHistory: Array<{ attempt: number; issues: string[] }> = []

			// Iterative refinement if validation fails
			while (!validationResult.valid && refinementAttempts < this.config.maxRefinementAttempts) {
				refinementAttempts++
				validationHistory.push({
					attempt: refinementAttempts,
					issues: validationResult.issues.map((i) => i.message),
				})

				const refinedResult = await this.refineSkill(code, validationResult)

				if (!refinedResult.success || !refinedResult.code) {
					break
				}

				code = refinedResult.code
				validationResult = await this.validator.validate(code, metadata)
			}

			// If still invalid after refinement, fall back to template
			if (!validationResult.valid) {
				const fallbackResult = await this.fallbackToTemplate(signal)
				return {
					...fallbackResult,
					fallbackUsed: "template",
					refinementAttempts,
					validationHistory,
					durationMs: Date.now() - startTime,
					tokensUsed: llmResponse.tokensUsed,
				}
			}

			// Success!
			this.metrics.successfulSyntheses++
			this.updateMetrics(Date.now() - startTime, refinementAttempts, llmResponse.tokensUsed)

			return {
				success: true,
				code,
				explanation: parsedSkill.explanation,
				testCases: parsedSkill.testCases,
				suggestedName: parsedSkill.suggestedName,
				suggestedDescription: parsedSkill.suggestedDescription,
				requiredPermissions: parsedSkill.requiredPermissions,
				refinementAttempts,
				validationHistory,
				tokensUsed: llmResponse.tokensUsed,
				costUsd: this.estimateCost(llmResponse.tokensUsed ?? 0),
				durationMs: Date.now() - startTime,
				modelUsed: llmResponse.model,
			}
		} catch (error) {
			return this.handleLLMFailure(signal, error instanceof Error ? error.message : String(error), startTime)
		}
	}

	/**
	 * Build a detailed prompt for the LLM
	 */
	buildLLMPrompt(signal: LearningSignal, context: SynthesisContext): string {
		const sections: string[] = []

		// Objective section
		sections.push(`## OBJECTIVE
Create a TypeScript skill function to solve the following capability gap:

**Problem:** ${signal.description}
**Signal Type:** ${signal.type}
**Confidence:** ${(signal.confidence * 100).toFixed(1)}%`)

		// Context section
		if (context.toolName || context.errorMessages.length > 0) {
			sections.push(`\n## CONTEXT`)

			if (context.toolName) {
				sections.push(`**Tool that failed:** ${context.toolName}`)
			}

			if (context.errorMessages.length > 0) {
				sections.push(`**Error messages:**`)
				for (const msg of context.errorMessages.slice(0, 5)) {
					sections.push(`- ${msg.substring(0, 200)}`)
				}
			}

			if (context.errorPatterns.length > 0) {
				sections.push(`**Error patterns detected:**`)
				for (const pattern of context.errorPatterns) {
					sections.push(`- ${pattern}`)
				}
			}

			if (context.attemptedFixes.length > 0) {
				sections.push(`**Previously attempted fixes (didn't work):**`)
				for (const fix of context.attemptedFixes.slice(0, 3)) {
					sections.push(`- ${fix}`)
				}
			}

			if (context.stackTraces.length > 0) {
				sections.push(`**Stack trace (first error):**
\`\`\`
${context.stackTraces[0].substring(0, 500)}
\`\`\``)
			}

			if (context.userIntent) {
				sections.push(`**User's original intent:** ${context.userIntent}`)
			}

			if (context.projectType) {
				sections.push(`**Project type:** ${context.projectType}`)
			}
		}

		// File context section
		if (context.fileContext.length > 0) {
			sections.push(`\n## RELEVANT CODE CONTEXT`)
			for (const file of context.fileContext.slice(0, 3)) {
				const lines = file.content.split("\n").slice(0, this.promptConfig.maxContextLines)
				sections.push(`**File:** ${file.path}
\`\`\`typescript
${lines.join("\n")}
\`\`\``)
			}
		}

		// Requirements section
		sections.push(`\n## REQUIREMENTS
${this.promptConfig.constraints.map((c, i) => `${i + 1}. ${c}`).join("\n")}`)

		// Security warnings
		if (this.promptConfig.includeSecurityWarnings) {
			sections.push(`\n## SECURITY CONSTRAINTS
- NO eval(), new Function(), or dynamic code execution
- NO process.env modifications
- NO infinite loops without exit conditions
- NO global/prototype modifications
- Proper error handling required`)
		}

		// Expected output format
		sections.push(`\n## OUTPUT FORMAT
Provide your response in the following format:

### EXPLANATION
Brief explanation of your approach (2-3 sentences)

### CODE
\`\`\`typescript
// Your complete TypeScript code here
\`\`\`

### SKILL_INFO
- **Name:** suggested_skill_name
- **Description:** One sentence description
- **Permissions:** comma-separated list (e.g., read_file, network)`)

		// Test cases request
		if (this.promptConfig.requestTestCases) {
			sections.push(`
### TEST_CASES
Provide 1-2 test cases in JSON format:
\`\`\`json
[
  {
    "name": "test name",
    "input": { "key": "value" },
    "expectedOutput": { "success": true },
    "assertion": "description of what to check"
  }
]
\`\`\``)
		}

		// Example structure
		sections.push(`\n## EXAMPLE STRUCTURE
\`\`\`typescript
/**
 * Skill description
 * @param args - Input arguments
 * @returns Result with success status
 */
export interface Args {
  input: string;
}

export interface Result {
  success: boolean;
  data?: unknown;
  error?: string;
}

export default async function skillName(args: Args): Promise<Result> {
  try {
    // Validate input
    if (!args.input) {
      return { success: false, error: "Input is required" };
    }
    
    // Implementation
    const result = await processInput(args.input);
    
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
\`\`\``)

		return sections.join("\n")
	}

	/**
	 * Call the LLM with the prompt
	 */
	async callLLM(
		prompt: string,
		retryCount = 0,
	): Promise<{
		success: boolean
		content?: string
		error?: string
		tokensUsed?: number
		model?: string
	}> {
		if (!this.apiProvider) {
			return {
				success: false,
				error: "No API provider configured",
			}
		}

		try {
			const response = await this.apiProvider.sendMessage(
				[
					{ role: "system", content: this.promptConfig.systemPrompt ?? DEFAULT_SYSTEM_PROMPT },
					{ role: "user", content: prompt },
				],
				{
					temperature: this.config.temperature,
					maxTokens: this.config.maxTokens,
					timeout: this.config.timeoutMs,
				},
			)

			if (response.tokensUsed) {
				this.metrics.totalTokens += response.tokensUsed
			}

			return {
				success: true,
				content: response.content,
				tokensUsed: response.tokensUsed,
				model: response.model ?? this.apiProvider.getModel(),
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error)

			// Retry on transient errors
			if (retryCount < this.config.maxRetries && this.isRetryableError(errorMessage)) {
				const delay = Math.min(1000 * Math.pow(2, retryCount), 10000)
				await this.sleep(delay)
				return this.callLLM(prompt, retryCount + 1)
			}

			return {
				success: false,
				error: errorMessage,
			}
		}
	}

	/**
	 * Parse skill code and metadata from LLM response
	 */
	parseSkillFromResponse(response: string): {
		success: boolean
		code?: string
		explanation?: string
		suggestedName?: string
		suggestedDescription?: string
		requiredPermissions: string[]
		testCases: SynthesisTestCase[]
		error?: string
	} {
		try {
			// Extract code block
			const codeMatch = response.match(/### CODE[\s\S]*?```typescript\n([\s\S]*?)```/)
			const code = codeMatch?.[1]?.trim()

			if (!code) {
				// Try alternative code block patterns
				const altCodeMatch = response.match(/```typescript\n([\s\S]*?)```/)
				if (!altCodeMatch?.[1]) {
					return {
						success: false,
						requiredPermissions: [],
						testCases: [],
						error: "No TypeScript code block found in response",
					}
				}
				// Use the first typescript code block if no ### CODE section
				const altCode = altCodeMatch[1].trim()

				return {
					success: true,
					code: altCode,
					explanation: this.extractSection(response, "EXPLANATION"),
					suggestedName: this.extractSkillInfo(response, "Name"),
					suggestedDescription: this.extractSkillInfo(response, "Description"),
					requiredPermissions: this.extractPermissions(response),
					testCases: this.extractTestCases(response),
				}
			}

			return {
				success: true,
				code,
				explanation: this.extractSection(response, "EXPLANATION"),
				suggestedName: this.extractSkillInfo(response, "Name"),
				suggestedDescription: this.extractSkillInfo(response, "Description"),
				requiredPermissions: this.extractPermissions(response),
				testCases: this.extractTestCases(response),
			}
		} catch (error) {
			return {
				success: false,
				requiredPermissions: [],
				testCases: [],
				error: error instanceof Error ? error.message : "Failed to parse response",
			}
		}
	}

	/**
	 * Refine a skill based on validation errors
	 */
	async refineSkill(
		code: string,
		validationResult: ValidationResult,
	): Promise<{
		success: boolean
		code?: string
		error?: string
	}> {
		if (!this.apiProvider) {
			return { success: false, error: "No API provider" }
		}

		// Build refinement prompt
		const issues = validationResult.issues.map((i) => `- [${i.severity}] ${i.message}`).join("\n")

		const refinementPrompt = `The following TypeScript skill code has validation issues that need to be fixed:

## CURRENT CODE
\`\`\`typescript
${code}
\`\`\`

## VALIDATION ISSUES
${issues}

## INSTRUCTIONS
Please fix ALL the validation issues and return the corrected code. Keep the same functionality but ensure:
1. All security issues are resolved
2. All syntax errors are fixed
3. Best practices are followed
4. Error handling is comprehensive

## OUTPUT FORMAT
Return ONLY the corrected TypeScript code in a code block:
\`\`\`typescript
// Fixed code here
\`\`\``

		try {
			const response = await this.callLLM(refinementPrompt)

			if (!response.success || !response.content) {
				return { success: false, error: response.error ?? "Refinement failed" }
			}

			// Extract refined code
			const codeMatch = response.content.match(/```typescript\n([\s\S]*?)```/)
			const refinedCode = codeMatch?.[1]?.trim()

			if (!refinedCode) {
				return { success: false, error: "No code block in refinement response" }
			}

			return { success: true, code: refinedCode }
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : "Refinement error",
			}
		}
	}

	/**
	 * Get current synthesis metrics
	 */
	getMetrics(): SynthesisMetrics {
		return { ...this.metrics }
	}

	/**
	 * Reset synthesis metrics
	 */
	resetMetrics(): void {
		this.metrics = {
			totalAttempts: 0,
			successfulSyntheses: 0,
			failedSyntheses: 0,
			templateFallbacks: 0,
			totalTokens: 0,
			totalCostUsd: 0,
			avgSynthesisTimeMs: 0,
			avgRefinementAttempts: 0,
			synthesesToday: 0,
		}
	}

	/**
	 * Get current configuration
	 */
	getConfig(): LLMSynthesisConfig {
		return { ...this.config }
	}

	/**
	 * Update configuration
	 */
	updateConfig(updates: Partial<LLMSynthesisConfig>): void {
		this.config = {
			...this.config,
			...updates,
		}
	}

	private async fallbackToTemplate(signal: LearningSignal): Promise<LLMSynthesisResult> {
		const templateResult = this.templateSynthesizer.synthesizeFromSignal(signal)

		if (templateResult.success && templateResult.code) {
			// Track that we fell back to template
			this.metrics.templateFallbacks++

			return {
				success: true,
				code: templateResult.code,
				explanation: "Generated using template-based synthesis (LLM fallback)",
				testCases: [],
				suggestedName: templateResult.skill?.name,
				suggestedDescription: templateResult.skill?.description,
				requiredPermissions: templateResult.skill?.permissions ?? [],
				fallbackUsed: "template",
				refinementAttempts: 0,
				validationHistory: [],
			}
		}

		return {
			success: false,
			error: templateResult.error ?? "Template synthesis also failed",
			fallbackUsed: "none",
			testCases: [],
			requiredPermissions: [],
			refinementAttempts: 0,
			validationHistory: [],
		}
	}

	private async handleLLMFailure(
		signal: LearningSignal,
		error: string,
		startTime: number,
	): Promise<LLMSynthesisResult> {
		this.metrics.failedSyntheses++

		// Try template fallback (template fallbacks is incremented inside fallbackToTemplate if successful)
		const fallbackResult = await this.fallbackToTemplate(signal)

		return {
			...fallbackResult,
			error: fallbackResult.success ? undefined : error,
			durationMs: Date.now() - startTime,
		}
	}

	private generateMetadata(name: string, signal: LearningSignal): SkillMetadata {
		const now = Date.now()
		const id = this.generateSkillId(name)

		return {
			id,
			name,
			description: signal.description,
			type: "workflow",
			runtime: this.defaultRuntime,
			scope: this.defaultScope,
			implementationPath: `${id}.ts`,
			parameters: {},
			tags: [signal.type, "llm-synthesized"],
			usageCount: 0,
			successCount: 0,
			failureCount: 0,
			active: true,
			version: "1.0.0",
			createdAt: now,
			updatedAt: now,
			sourceProposalId: signal.sourceEventIds[0],
			author: this.author,
			permissions: [],
		}
	}

	private generateSkillId(name: string): string {
		const cleanName = name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "_")
			.replace(/^_+|_+$/g, "")
			.substring(0, 30)

		return `skill_${cleanName}_${Date.now().toString(36)}`
	}

	private extractSection(response: string, sectionName: string): string | undefined {
		const regex = new RegExp(`### ${sectionName}\\s*\\n([\\s\\S]*?)(?=###|$)`, "i")
		const match = response.match(regex)
		return match?.[1]?.trim()
	}

	private extractSkillInfo(response: string, field: string): string | undefined {
		// Handle both "**Name:** value" and "- **Name:** value" formats
		const regex = new RegExp(`(?:[-*]\\s*)?\\*\\*${field}:\\*\\*\\s*(.+)`, "i")
		const match = response.match(regex)
		if (!match?.[1]) return undefined

		// Clean up the value - remove leading asterisks, dashes, and whitespace
		return match[1].trim().replace(/^[*-]\s*/, "")
	}

	private extractPermissions(response: string): string[] {
		const permissionsStr = this.extractSkillInfo(response, "Permissions")
		if (!permissionsStr) return []

		return permissionsStr
			.split(",")
			.map((p) => p.trim())
			.filter((p) => p.length > 0)
	}

	private extractTestCases(response: string): SynthesisTestCase[] {
		try {
			const testSection = this.extractSection(response, "TEST_CASES")
			if (!testSection) return []

			const jsonMatch = testSection.match(/```json\n([\s\S]*?)```/)
			if (!jsonMatch?.[1]) return []

			const parsed = JSON.parse(jsonMatch[1])
			if (!Array.isArray(parsed)) return []

			return parsed.map((tc) => ({
				name: tc.name ?? "Unnamed test",
				input: tc.input ?? {},
				expectedOutput: tc.expectedOutput,
				expectsError: tc.expectsError ?? false,
				assertion: tc.assertion ?? "Should complete",
			}))
		} catch {
			return []
		}
	}

	private isRetryableError(error: string): boolean {
		const retryablePatterns = [
			/timeout/i,
			/rate limit/i,
			/503/,
			/502/,
			/500/,
			/network error/i,
			/connection refused/i,
			/ECONNRESET/i,
		]

		return retryablePatterns.some((pattern) => pattern.test(error))
	}

	private estimateCost(tokens: number): number {
		// Rough estimate based on typical Claude pricing
		// Input + output tokens at ~$3/1M tokens
		return (tokens / 1_000_000) * 3
	}

	private updateMetrics(durationMs: number, refinementAttempts: number, tokensUsed?: number): void {
		const totalSyntheses = this.metrics.successfulSyntheses

		// Update average synthesis time
		if (totalSyntheses === 1) {
			this.metrics.avgSynthesisTimeMs = durationMs
		} else {
			this.metrics.avgSynthesisTimeMs =
				(this.metrics.avgSynthesisTimeMs * (totalSyntheses - 1) + durationMs) / totalSyntheses
		}

		// Update average refinement attempts
		if (totalSyntheses === 1) {
			this.metrics.avgRefinementAttempts = refinementAttempts
		} else {
			this.metrics.avgRefinementAttempts =
				(this.metrics.avgRefinementAttempts * (totalSyntheses - 1) + refinementAttempts) / totalSyntheses
		}

		// Update cost
		if (tokensUsed) {
			this.metrics.totalCostUsd += this.estimateCost(tokensUsed)
		}

		this.metrics.lastSynthesisAt = Date.now()
		this.metrics.synthesesToday++
	}

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms))
	}
}
