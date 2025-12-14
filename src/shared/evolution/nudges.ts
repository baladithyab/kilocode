export type PeriodicNudgeDecisionInput = {
	enabled: boolean
	isBootstrapped: boolean
	/** Minimum milliseconds between nudges */
	intervalMs: number
	nowMs: number
	/** Last time we showed (or snoozed) the periodic nudge */
	lastNudgeAtMs?: number
	/** Last time the user completed a task in this workspace */
	lastTaskCompletedAtMs?: number
}

export function hoursToMs(hours: number): number {
	// Handle weird inputs defensively.
	if (!Number.isFinite(hours)) return 0
	return Math.max(0, Math.round(hours * 60 * 60 * 1000))
}

/**
 * Pure decision function for the Evolution periodic nudge.
 *
 * Rules:
 * - Opt-in
 * - Never show unless Evolution is bootstrapped (.kilocode/ present)
 * - Only show if at least one task completed since the last nudge
 * - Only show if interval has elapsed since the last nudge
 */
export function shouldShowPeriodicNudge(input: PeriodicNudgeDecisionInput): boolean {
	const { enabled, isBootstrapped, intervalMs, nowMs, lastNudgeAtMs, lastTaskCompletedAtMs } = input

	if (!enabled) return false
	if (!isBootstrapped) return false
	if (!Number.isFinite(intervalMs) || intervalMs <= 0) return false
	if (!Number.isFinite(nowMs) || nowMs <= 0) return false
	if (typeof lastNudgeAtMs !== "number" || !Number.isFinite(lastNudgeAtMs)) return false
	if (typeof lastTaskCompletedAtMs !== "number" || !Number.isFinite(lastTaskCompletedAtMs)) return false

	const lastNudgeAt = lastNudgeAtMs
	const lastTaskCompletedAt = lastTaskCompletedAtMs

	// Must have at least one completion since the last nudge.
	if (lastTaskCompletedAt <= lastNudgeAt) return false

	// Must respect the nudge interval.
	if (nowMs - lastNudgeAt < intervalMs) return false

	return true
}
