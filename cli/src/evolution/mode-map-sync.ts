import * as fs from "fs/promises"
import * as path from "path"

import inquirer from "inquirer"
import YAML from "yaml"

import { cliProfileMapSchema } from "@roo-code/types"

import {
	applyModeMapSync,
	planModeMapSync,
	writeModeMapSyncProposalArtifacts,
	type ModeMapSyncRoleChange,
} from "../../../src/shared/evolution/modeMapSync.js"

const DEFAULT_CLI_PROFILE_MAP_PATH = path.join(".kilocode", "evolution", "cli-profiles.yaml")

export type EvolutionModeMapSyncCliArgs = {
	workspaceRoot: string
	apply?: boolean
	dryRun?: boolean
	writeProposal?: boolean
	cliProfileMapPath?: string
	verbose?: boolean
}

function logEvent(
	verbose: boolean,
	event: {
		event: string
		phase: "start" | "end" | "error"
		ts: string
		data?: Record<string, unknown>
	},
): void {
	if (!verbose) return
	console.log(JSON.stringify(event))
}

function formatChange(change: ModeMapSyncRoleChange): string {
	if (change.kind === "update-profile") {
		return `[~] roles.${change.role}.profile: ${change.from} -> ${change.to}`
	}
	return `[+] roles.${change.role}: profile=${change.to} (generated prompt/rubric defaults)`
}

async function loadCliProfileNames(absPath: string): Promise<Set<string>> {
	const raw = await fs.readFile(absPath, "utf8")
	const parsed = cliProfileMapSchema.parse(YAML.parse(raw))
	return new Set(Object.keys(parsed.profiles))
}

export async function runEvolutionModeMapSyncCli(args: EvolutionModeMapSyncCliArgs): Promise<void> {
	const {
		workspaceRoot,
		apply = false,
		dryRun = true,
		writeProposal = true,
		cliProfileMapPath = DEFAULT_CLI_PROFILE_MAP_PATH,
		verbose = false,
	} = args

	const absWorkspace = path.resolve(workspaceRoot)

	logEvent(verbose, {
		event: "evolution.modeMapSync",
		phase: "start",
		ts: new Date().toISOString(),
		data: {
			workspaceRoot: absWorkspace,
			apply,
			dryRun,
			writeProposal,
			cliProfileMapPath,
		},
	})

	let plan
	try {
		plan = await planModeMapSync({ projectRoot: absWorkspace })
	} catch (error) {
		logEvent(verbose, {
			event: "evolution.modeMapSync",
			phase: "error",
			ts: new Date().toISOString(),
			data: {
				error: error instanceof Error ? error.message : String(error),
				recovery:
					"Verify docs/llm-mode-map.yaml exists and is valid, then re-run. If council.yaml is invalid, re-bootstrap Evolution Layer.",
			},
		})
		throw error
	}

	console.log(`\nEvolution Mode Map Sync\nWorkspace: ${absWorkspace}\n`)
	console.log(plan.summary)

	if (plan.drift.changes.length > 0) {
		console.log("\nSeat changes:")
		for (const c of plan.drift.changes) {
			console.log(formatChange(c))
		}
	}

	if (plan.drift.unmanagedRoles.length > 0) {
		console.log("\nUnmanaged council roles (left unchanged):")
		for (const role of plan.drift.unmanagedRoles) {
			console.log(`[=] ${role}`)
		}
	}

	if (plan.diffText) {
		console.log("\nDiff preview:\n")
		console.log(plan.diffText)
	}

	if (!apply) {
		let proposalDir: string | undefined
		if (writeProposal && plan.drift.changes.length > 0) {
			const artifacts = await writeModeMapSyncProposalArtifacts(plan)
			proposalDir = path.relative(absWorkspace, artifacts.proposalDir)
			console.log(`\nProposal artifacts written: ${proposalDir}`)
		}

		console.log("\nNext steps")
		console.log("- Preview latest artifacts: kilocode evolution open")
		console.log("- Apply: kilocode evolution mode-map sync --apply")

		logEvent(verbose, {
			event: "evolution.modeMapSync",
			phase: "end",
			ts: new Date().toISOString(),
			data: {
				applied: false,
				changes: plan.drift.changes.length,
				proposalDir,
			},
		})
		return
	}

	if (!process.stdin.isTTY) {
		logEvent(verbose, {
			event: "evolution.modeMapSync",
			phase: "error",
			ts: new Date().toISOString(),
			data: {
				error: "Refusing to apply without an interactive TTY for confirmation.",
				recovery: "Re-run in an interactive terminal or omit --apply for preview-only.",
			},
		})
		console.error("\nRefusing to apply without an interactive TTY for confirmation.")
		process.exit(1)
	}

	const { proceed } = await inquirer.prompt<{ proceed: boolean }>([
		{
			type: "confirm",
			name: "proceed",
			message: `Apply changes to ${plan.councilConfigPath}?`,
			default: false,
		},
	])

	if (!proceed) {
		console.log("\nAborted.")
		return
	}

	let cliProfileNames: Set<string> | undefined
	try {
		cliProfileNames = await loadCliProfileNames(path.resolve(absWorkspace, cliProfileMapPath))
	} catch (error) {
		logEvent(verbose, {
			event: "evolution.modeMapSync",
			phase: "error",
			ts: new Date().toISOString(),
			data: {
				error: error instanceof Error ? error.message : String(error),
				recovery:
					"Ensure .kilocode/evolution/cli-profiles.yaml exists (or pass --cli-profile-map) and is valid YAML.",
			},
		})
		console.error(
			`\nFailed to load CLI profile map (${cliProfileMapPath}). ${error instanceof Error ? error.message : String(error)}`,
		)
		process.exit(1)
	}

	const result = await applyModeMapSync({
		plan,
		writeProposal,
		validateProfileExists: async (name) => Boolean(cliProfileNames?.has(name)),
	})

	if (!result.changed) {
		console.log("\nNo changes to apply.")
		logEvent(verbose, {
			event: "evolution.modeMapSync",
			phase: "end",
			ts: new Date().toISOString(),
			data: { applied: true, changed: false },
		})
		return
	}

	const appliedRel = path.relative(absWorkspace, result.councilConfigPath)
	const proposalRel = result.proposal ? path.relative(absWorkspace, result.proposal.proposalDir) : undefined

	console.log(`\nApplied: ${appliedRel}`)
	if (proposalRel) {
		console.log(`Proposal artifacts: ${proposalRel}`)
	}

	console.log("\nNext steps")
	console.log("- Preview latest artifacts: kilocode evolution open")
	console.log("- Run council on a trace to validate the seats: kilocode council run --trace <trace.v1.json>")

	logEvent(verbose, {
		event: "evolution.modeMapSync",
		phase: "end",
		ts: new Date().toISOString(),
		data: {
			applied: true,
			changed: true,
			councilConfigPath: appliedRel,
			proposalDir: proposalRel,
		},
	})

	if (dryRun) {
		// no-op; apply implies non-dry-run. keep for flag parity.
	}
}
