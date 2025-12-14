import { describe, it, expect } from "vitest"

import { hoursToMs, shouldShowPeriodicNudge } from "./nudges"

describe("evolution periodic nudge", () => {
	it("hoursToMs returns 0 for non-finite values", () => {
		expect(hoursToMs(Number.NaN)).toBe(0)
		expect(hoursToMs(Number.POSITIVE_INFINITY)).toBe(0)
	})

	it("does not show when disabled", () => {
		expect(
			shouldShowPeriodicNudge({
				enabled: false,
				isBootstrapped: true,
				intervalMs: hoursToMs(24),
				nowMs: 10_000,
				lastNudgeAtMs: 0,
				lastTaskCompletedAtMs: 9_000,
			}),
		).toBe(false)
	})

	it("does not show when Evolution is not bootstrapped", () => {
		expect(
			shouldShowPeriodicNudge({
				enabled: true,
				isBootstrapped: false,
				intervalMs: hoursToMs(24),
				nowMs: 10_000,
				lastNudgeAtMs: 0,
				lastTaskCompletedAtMs: 9_000,
			}),
		).toBe(false)
	})

	it("does not show when interval has not elapsed", () => {
		expect(
			shouldShowPeriodicNudge({
				enabled: true,
				isBootstrapped: true,
				intervalMs: 10_000,
				nowMs: 15_000,
				lastNudgeAtMs: 10_000,
				lastTaskCompletedAtMs: 14_999,
			}),
		).toBe(false)
	})

	it("does not show when no task was completed since last nudge", () => {
		expect(
			shouldShowPeriodicNudge({
				enabled: true,
				isBootstrapped: true,
				intervalMs: 1,
				nowMs: 10_000,
				lastNudgeAtMs: 9_000,
				lastTaskCompletedAtMs: 9_000,
			}),
		).toBe(false)
	})

	it("shows when interval elapsed and at least one task completed since last nudge", () => {
		expect(
			shouldShowPeriodicNudge({
				enabled: true,
				isBootstrapped: true,
				intervalMs: 1_000,
				nowMs: 10_000,
				lastNudgeAtMs: 1_000,
				lastTaskCompletedAtMs: 9_999,
			}),
		).toBe(true)
	})
})
