import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"

import YAML from "yaml"

vi.mock("vscode", () => {
	const config = {
		update: vi.fn(),
	}

	return {
		workspace: {
			getConfiguration: vi.fn(() => config),
		},
		ConfigurationTarget: {
			Workspace: 2,
		},
	}
})

describe("EvolutionWebviewHandler", () => {
	let projectRoot: string
	let posted: any[]
	let provider: { postMessageToWebview: (m: any) => Promise<void> }

	beforeEach(async () => {
		projectRoot = await mkdtemp(path.join(os.tmpdir(), "kilocode-evolution-webview-"))
		posted = []
		provider = {
			postMessageToWebview: vi.fn(async (m: any) => {
				posted.push(m)
			}),
		}

		// Ensure docs exist where required.
		await mkdir(path.join(projectRoot, "docs"), { recursive: true })
	})

	afterEach(async () => {
		await rm(projectRoot, { recursive: true, force: true })
	})

	test("evolution.requestState returns defaults when config/council missing", async () => {
		const { EvolutionWebviewHandler } = await import("./EvolutionWebviewHandler")
		const handler = new EvolutionWebviewHandler({ provider: provider as any, projectRoot })

		await handler.handle({ type: "evolution.requestState" } as any)

		expect(posted).toHaveLength(1)
		expect(posted[0].type).toBe("evolution.state")
		expect(posted[0].data).toEqual(
			expect.objectContaining({
				councilMembers: [],
				automationLevel: 0,
				lastReviewDate: null,
				pendingProposalsCount: 0,
				abTestActive: false,
			}),
		)
	})

	test("evolution.configure validates against docs/kilo-profiles.md and writes council.yaml", async () => {
		await writeFile(
			path.join(projectRoot, "docs", "kilo-profiles.md"),
			["# Profiles", "", "## Profile: Alice", "", "## Profile: Bob"].join("\n"),
			"utf8",
		)

		const { EvolutionWebviewHandler } = await import("./EvolutionWebviewHandler")
		const handler = new EvolutionWebviewHandler({ provider: provider as any, projectRoot })

		await handler.handle({ type: "evolution.configure", data: { councilMembers: ["Alice", "Bob"] } } as any)

		// configure posts actionResult and then state
		expect(posted.length).toBeGreaterThanOrEqual(2)
		expect(posted[0].type).toBe("evolution.actionResult")
		expect(posted[0].success).toBe(true)
		expect(posted[1].type).toBe("evolution.state")
		expect(posted[1].data.councilMembers).toEqual(expect.arrayContaining(["Alice", "Bob"]))

		const councilAbs = path.join(projectRoot, ".kilocode", "evolution", "council.yaml")
		const councilYaml = await readFile(councilAbs, "utf8")
		const parsed = YAML.parse(councilYaml) as any
		expect(parsed.version).toBe(1)
		expect(Object.values(parsed.roles).map((r: any) => r.profile)).toEqual(expect.arrayContaining(["Alice", "Bob"]))
	})

	test("evolution.configure accepts repo-style backtick profile slugs (### `context-manager`)", async () => {
		await writeFile(
			path.join(projectRoot, "docs", "kilo-profiles.md"),
			["# Kilo profiles (MVP1)", "", "## Profiles", "", "### `context-manager`", "", "### `eval-engineer`"].join(
				"\n",
			),
			"utf8",
		)

		const { EvolutionWebviewHandler } = await import("./EvolutionWebviewHandler")
		const handler = new EvolutionWebviewHandler({ provider: provider as any, projectRoot })

		await handler.handle({
			type: "evolution.configure",
			data: { councilMembers: ["context-manager", "eval-engineer"] },
		} as any)

		expect(posted.length).toBeGreaterThanOrEqual(2)
		expect(posted[0].type).toBe("evolution.actionResult")
		expect(posted[0].success).toBe(true)
		expect(posted[1].type).toBe("evolution.state")
		expect(posted[1].data.councilMembers).toEqual(expect.arrayContaining(["context-manager", "eval-engineer"]))

		const councilAbs = path.join(projectRoot, ".kilocode", "evolution", "council.yaml")
		const councilYaml = await readFile(councilAbs, "utf8")
		const parsed = YAML.parse(councilYaml) as any
		expect(parsed.version).toBe(1)
		expect(Object.values(parsed.roles).map((r: any) => r.profile)).toEqual(
			expect.arrayContaining(["context-manager", "eval-engineer"]),
		)
	})

	test("evolution.setAutomationLevel writes config.yaml and updates VS Code settings", async () => {
		const vscode = (await import("vscode")) as any
		const configMock = vscode.workspace.getConfiguration()

		const { EvolutionWebviewHandler } = await import("./EvolutionWebviewHandler")
		const handler = new EvolutionWebviewHandler({ provider: provider as any, projectRoot })

		await handler.handle({ type: "evolution.setAutomationLevel", data: { level: 2 } } as any)

		// actionResult + state
		expect(posted[0].type).toBe("evolution.actionResult")
		expect(posted[0].success).toBe(true)
		expect(posted[1].type).toBe("evolution.state")
		expect(posted[1].data.automationLevel).toBe(2)

		const cfgAbs = path.join(projectRoot, ".kilocode", "evolution", "config.yaml")
		const cfgYaml = await readFile(cfgAbs, "utf8")
		const cfg = YAML.parse(cfgYaml) as any
		expect(cfg.automation_level).toBe(2)
		expect(cfg.auto_apply_patterns).toEqual(expect.arrayContaining(["docs/**", "mode-map.json"]))

		// best-effort: ensure we wrote workspace settings for runtime automation
		expect(configMock.update).toHaveBeenCalled()
	})
})
