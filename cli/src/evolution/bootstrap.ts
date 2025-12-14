import inquirer from "inquirer"

import { applyEvolutionBootstrap, planEvolutionBootstrap } from "../../../src/shared/evolution/bootstrap.js"

export async function runEvolutionBootstrapCli({ projectRoot }: { projectRoot: string }): Promise<void> {
	const plan = await planEvolutionBootstrap({ projectRoot })

	console.log(`\nEvolution Layer bootstrap (create-missing-only)\nProject root: ${projectRoot}\n`)
	console.log("Plan:")

	for (const item of plan.toCreate) {
		console.log(`[+] ${item.path}`)
	}

	for (const item of plan.skipped) {
		console.log(`[=] ${item.path} (${item.reason})`)
	}

	if (plan.suggestions.length > 0) {
		console.log("\nSuggestions:")
		for (const suggestion of plan.suggestions) {
			console.log(`- ${suggestion.replaceAll("\n", "\n  ")}`)
		}
	}

	if (plan.toCreate.length === 0) {
		console.log("\nNothing to create.")
		return
	}

	if (!process.stdin.isTTY) {
		console.error("\nRefusing to write files without an interactive TTY for confirmation.")
		process.exit(1)
	}

	const { proceed } = await inquirer.prompt<{ proceed: boolean }>([
		{
			type: "confirm",
			name: "proceed",
			message: `Proceed to create ${plan.toCreate.length} file(s)?`,
			default: false,
		},
	])

	if (!proceed) {
		console.log("\nAborted.")
		return
	}

	const result = await applyEvolutionBootstrap(plan)

	console.log("\nCreated:")
	for (const created of result.created) {
		console.log(`- ${created}`)
	}

	if (plan.suggestions.length > 0) {
		console.log("\nSuggestions (not applied automatically):")
		for (const suggestion of plan.suggestions) {
			console.log(`- ${suggestion.replaceAll("\n", "\n  ")}`)
		}
	}
}
