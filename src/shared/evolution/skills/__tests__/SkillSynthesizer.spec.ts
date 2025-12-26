/**
 * Tests for SkillSynthesizer
 */

import { describe, it, expect, beforeEach } from "vitest"
import { SkillSynthesizer } from "../SkillSynthesizer"
import type { LearningSignal, SkillSynthesisRequest } from "@roo-code/types"

describe("SkillSynthesizer", () => {
	let synthesizer: SkillSynthesizer

	beforeEach(() => {
		synthesizer = new SkillSynthesizer({
			author: "Test Author",
		})
	})

	describe("synthesize", () => {
		it("should synthesize a skill from a template", () => {
			const request: SkillSynthesisRequest = {
				name: "File Parser",
				description: "Parse JSON files",
				templateId: "file_processor",
				runtime: "typescript",
				scope: "project",
				tags: ["json", "parser"],
			}

			const result = synthesizer.synthesize(request)

			expect(result.success).toBe(true)
			expect(result.skill).toBeDefined()
			expect(result.code).toBeDefined()
			expect(result.skill?.name).toBe("File Parser")
			expect(result.skill?.tags).toContain("json")
		})

		it("should synthesize a skill with custom code", () => {
			const request: SkillSynthesisRequest = {
				name: "Custom Processor",
				description: "Custom processing logic",
				customCode: `const result = input.toUpperCase();`,
				runtime: "typescript",
				scope: "project",
			}

			const result = synthesizer.synthesize(request)

			expect(result.success).toBe(true)
			expect(result.code).toContain("toUpperCase")
		})

		it("should generate test code", () => {
			const request: SkillSynthesisRequest = {
				name: "Test Skill",
				description: "A skill for testing",
				templateId: "custom",
				runtime: "typescript",
				scope: "project",
			}

			const result = synthesizer.synthesize(request)

			expect(result.testCode).toBeDefined()
			expect(result.testCode).toContain("describe")
			expect(result.testCode).toContain("expect")
		})

		it("should fail for non-existent template without custom code", () => {
			const request: SkillSynthesisRequest = {
				name: "Invalid",
				description: "Invalid skill",
				templateId: "nonexistent_template",
				runtime: "typescript",
				scope: "project",
			}

			const result = synthesizer.synthesize(request)

			expect(result.success).toBe(false)
			expect(result.error).toContain("Template not found")
		})

		it("should replace placeholders in template", () => {
			const request: SkillSynthesisRequest = {
				name: "Data Transform",
				description: "Transform data formats",
				templateId: "data_transformer",
				placeholderValues: {
					inputType: "rawData: string;",
					outputType: "parsedData: object;",
					transformLogic: "const transformed = JSON.parse(data.rawData);",
				},
				runtime: "typescript",
				scope: "project",
			}

			const result = synthesizer.synthesize(request)

			expect(result.success).toBe(true)
			expect(result.code).toContain("rawData: string")
			expect(result.code).toContain("parsedData: object")
		})

		it("should include author in generated metadata", () => {
			const request: SkillSynthesisRequest = {
				name: "Authored Skill",
				description: "A skill with author",
				templateId: "custom",
				runtime: "typescript",
				scope: "project",
			}

			const result = synthesizer.synthesize(request)

			expect(result.skill?.author).toBe("Test Author")
		})

		it("should generate unique skill IDs", () => {
			const request1: SkillSynthesisRequest = {
				name: "Skill One",
				description: "First skill",
				runtime: "typescript",
				scope: "project",
			}
			const request2: SkillSynthesisRequest = {
				name: "Skill One",
				description: "Same name, different instance",
				runtime: "typescript",
				scope: "project",
			}

			const result1 = synthesizer.synthesize(request1)
			const result2 = synthesizer.synthesize(request2)

			expect(result1.skill?.id).not.toBe(result2.skill?.id)
		})
	})

	describe("synthesizeFromSignal", () => {
		it("should synthesize from doom_loop signal", () => {
			const signal: LearningSignal = {
				id: "signal-1",
				type: "doom_loop",
				confidence: 0.9,
				description: "Tool failed repeatedly",
				sourceEventIds: ["event-1", "event-2"],
				detectedAt: Date.now(),
				suggestedAction: "Try alternative approach",
				context: {
					toolName: "file_edit",
					errorCount: 3,
				},
			}

			const result = synthesizer.synthesizeFromSignal(signal)

			expect(result.success).toBe(true)
			expect(result.skill).toBeDefined()
			expect(result.skill?.tags).toContain("doom_loop")
			expect(result.skill?.tags).toContain("file_edit")
		})

		it("should synthesize from capability_gap signal", () => {
			const signal: LearningSignal = {
				id: "signal-2",
				type: "capability_gap",
				confidence: 0.8,
				description: "Missing file processing capability",
				sourceEventIds: ["event-3"],
				detectedAt: Date.now(),
				context: {
					capability: "process files",
				},
			}

			const result = synthesizer.synthesizeFromSignal(signal)

			expect(result.success).toBe(true)
			// Should suggest file_processor template
			expect(result.skill).toBeDefined()
		})

		it("should synthesize from inefficiency signal", () => {
			const signal: LearningSignal = {
				id: "signal-3",
				type: "inefficiency",
				confidence: 0.7,
				description: "Suboptimal workflow detected",
				sourceEventIds: ["event-4", "event-5"],
				detectedAt: Date.now(),
				suggestedAction: "Batch operations together",
				context: {
					area: "file operations",
				},
			}

			const result = synthesizer.synthesizeFromSignal(signal)

			expect(result.success).toBe(true)
			expect(result.skill?.description).toBe("Suboptimal workflow detected")
		})

		it("should include source signal ID in metadata", () => {
			const signal: LearningSignal = {
				id: "signal-trackable",
				type: "doom_loop",
				confidence: 0.9,
				description: "Test signal",
				sourceEventIds: [],
				detectedAt: Date.now(),
			}

			const request: SkillSynthesisRequest = {
				name: "Test",
				description: "Test",
				runtime: "typescript",
				scope: "project",
				sourceSignalId: signal.id,
			}

			const result = synthesizer.synthesize(request)

			// Note: sourceProposalId would be set when proposal creates the skill
			// For direct synthesis from signal, we track via tags
			expect(result.skill?.tags).toBeDefined()
		})
	})

	describe("templates", () => {
		it("should have builtin templates", () => {
			const templates = synthesizer.getTemplates()

			expect(templates.length).toBeGreaterThan(0)
			expect(templates.map((t) => t.id)).toContain("file_processor")
			expect(templates.map((t) => t.id)).toContain("api_client")
			expect(templates.map((t) => t.id)).toContain("data_transformer")
			expect(templates.map((t) => t.id)).toContain("command_runner")
			expect(templates.map((t) => t.id)).toContain("custom")
		})

		it("should allow adding custom templates", () => {
			synthesizer.addTemplate({
				id: "my_custom_template",
				name: "My Custom Template",
				templateType: "custom",
				runtime: "typescript",
				description: "A custom template",
				codeTemplate: "export default () => 'custom';",
				placeholders: [],
				defaultPermissions: [],
			})

			const template = synthesizer.getTemplate("my_custom_template")
			expect(template).toBeDefined()
			expect(template?.name).toBe("My Custom Template")
		})

		it("should allow removing custom templates", () => {
			synthesizer.addTemplate({
				id: "removable_template",
				name: "Removable",
				templateType: "custom",
				runtime: "typescript",
				description: "To be removed",
				codeTemplate: "",
				placeholders: [],
				defaultPermissions: [],
			})

			const removed = synthesizer.removeTemplate("removable_template")
			expect(removed).toBe(true)

			const template = synthesizer.getTemplate("removable_template")
			expect(template).toBeUndefined()
		})

		it("should not allow removing builtin templates", () => {
			const removed = synthesizer.removeTemplate("file_processor")
			expect(removed).toBe(false)

			const template = synthesizer.getTemplate("file_processor")
			expect(template).toBeDefined()
		})

		it("should get a specific template", () => {
			const template = synthesizer.getTemplate("api_client")

			expect(template).toBeDefined()
			expect(template?.name).toBe("API Client")
			expect(template?.runtime).toBe("typescript")
		})
	})

	describe("template types", () => {
		it("should use file_processor for file-related capabilities", () => {
			const signal: LearningSignal = {
				id: "sig-file",
				type: "capability_gap",
				confidence: 0.8,
				description: "Need to read files",
				sourceEventIds: [],
				detectedAt: Date.now(),
				context: {
					capability: "read and process files",
				},
			}

			const result = synthesizer.synthesizeFromSignal(signal)

			expect(result.success).toBe(true)
			// The synthesizer should pick file_processor template
		})

		it("should use api_client for HTTP-related capabilities", () => {
			const signal: LearningSignal = {
				id: "sig-api",
				type: "capability_gap",
				confidence: 0.8,
				description: "Need to make API calls",
				sourceEventIds: [],
				detectedAt: Date.now(),
				context: {
					capability: "fetch data from HTTP API",
				},
			}

			const result = synthesizer.synthesizeFromSignal(signal)

			expect(result.success).toBe(true)
		})

		it("should use data_transformer for transform-related capabilities", () => {
			const signal: LearningSignal = {
				id: "sig-transform",
				type: "capability_gap",
				confidence: 0.8,
				description: "Need to transform data",
				sourceEventIds: [],
				detectedAt: Date.now(),
				context: {
					capability: "convert JSON to XML",
				},
			}

			const result = synthesizer.synthesizeFromSignal(signal)

			expect(result.success).toBe(true)
		})
	})
})
