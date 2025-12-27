/**
 * Tests for TaskDelegatorAdapter
 */

import { createTaskDelegatorAdapter, isClineProviderLike, type ClineProviderLike } from "../TaskDelegatorAdapter"

describe("TaskDelegatorAdapter", () => {
	describe("createTaskDelegatorAdapter", () => {
		it("should create an adapter with getCurrentTask", () => {
			const mockProvider: ClineProviderLike = {
				getCurrentTask: vi.fn().mockReturnValue({ taskId: "test-task-123" }),
				delegateParentAndOpenChild: vi.fn(),
			}

			const adapter = createTaskDelegatorAdapter(mockProvider)
			const result = adapter.getCurrentTask()

			expect(result).toEqual({ taskId: "test-task-123" })
			expect(mockProvider.getCurrentTask).toHaveBeenCalled()
		})

		it("should return undefined when no current task", () => {
			const mockProvider: ClineProviderLike = {
				getCurrentTask: vi.fn().mockReturnValue(undefined),
				delegateParentAndOpenChild: vi.fn(),
			}

			const adapter = createTaskDelegatorAdapter(mockProvider)
			const result = adapter.getCurrentTask()

			expect(result).toBeUndefined()
		})

		it("should create an adapter with delegateParentAndOpenChild", async () => {
			const mockProvider: ClineProviderLike = {
				getCurrentTask: vi.fn(),
				delegateParentAndOpenChild: vi.fn().mockResolvedValue({ taskId: "child-task-456" }),
			}

			const adapter = createTaskDelegatorAdapter(mockProvider)
			const params = {
				parentTaskId: "parent-123",
				message: "Test delegation",
				initialTodos: [{ content: "Do something", status: "pending" as const }],
				mode: "code",
			}

			const result = await adapter.delegateParentAndOpenChild(params)

			expect(result).toEqual({ taskId: "child-task-456" })
			expect(mockProvider.delegateParentAndOpenChild).toHaveBeenCalledWith(params)
		})

		it("should propagate errors from delegateParentAndOpenChild", async () => {
			const mockProvider: ClineProviderLike = {
				getCurrentTask: vi.fn(),
				delegateParentAndOpenChild: vi.fn().mockRejectedValue(new Error("Delegation failed")),
			}

			const adapter = createTaskDelegatorAdapter(mockProvider)

			await expect(
				adapter.delegateParentAndOpenChild({
					parentTaskId: "parent-123",
					message: "Test",
					initialTodos: [],
					mode: "code",
				}),
			).rejects.toThrow("Delegation failed")
		})
	})

	describe("isClineProviderLike", () => {
		it("should return true for valid provider", () => {
			const validProvider = {
				getCurrentTask: () => ({ taskId: "test" }),
				delegateParentAndOpenChild: async () => ({ taskId: "child" }),
			}

			expect(isClineProviderLike(validProvider)).toBe(true)
		})

		it("should return false for null", () => {
			expect(isClineProviderLike(null)).toBe(false)
		})

		it("should return false for undefined", () => {
			expect(isClineProviderLike(undefined)).toBe(false)
		})

		it("should return false for primitive values", () => {
			expect(isClineProviderLike("string")).toBe(false)
			expect(isClineProviderLike(123)).toBe(false)
			expect(isClineProviderLike(true)).toBe(false)
		})

		it("should return false for object missing getCurrentTask", () => {
			const invalidProvider = {
				delegateParentAndOpenChild: async () => ({ taskId: "child" }),
			}

			expect(isClineProviderLike(invalidProvider)).toBe(false)
		})

		it("should return false for object missing delegateParentAndOpenChild", () => {
			const invalidProvider = {
				getCurrentTask: () => ({ taskId: "test" }),
			}

			expect(isClineProviderLike(invalidProvider)).toBe(false)
		})

		it("should return false for object with non-function properties", () => {
			const invalidProvider = {
				getCurrentTask: "not a function",
				delegateParentAndOpenChild: 123,
			}

			expect(isClineProviderLike(invalidProvider)).toBe(false)
		})
	})
})
