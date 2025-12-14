import { z } from "zod"

/**
 * council.yaml schema (repo-local)
 *
 * Parsed from YAML in both VS Code and CLI, then validated with this schema.
 */

export const councilConfigVersion = 1 as const

export const councilRoleConfigSchema = z
	.object({
		/**
		 * Profile name to resolve.
		 * - VS Code: ProviderSettingsManager profile name
		 * - CLI: mapped via repo-local profile map or CLI flags
		 */
		profile: z.string(),
		/**
		 * Optional rubric identifier.
		 */
		rubricId: z.string().optional(),
		/**
		 * Repo-relative path to the prompt template markdown file.
		 */
		promptPath: z.string(),
	})
	.strict()

export type CouncilRoleConfig = z.infer<typeof councilRoleConfigSchema>

export const councilConfigSchema = z
	.object({
		version: z.literal(councilConfigVersion),
		/**
		 * Optional council name/id.
		 */
		councilId: z.string().optional(),
		/**
		 * Map: role -> role configuration.
		 */
		roles: z.record(z.string(), councilRoleConfigSchema),
	})
	.strict()

export type CouncilConfig = z.infer<typeof councilConfigSchema>

/**
 * Optional CLI-only profile mapping (repo-local)
 */

export const cliProfileMapEntrySchema = z
	.object({
		providerId: z.string(),
		model: z.string().optional(),
	})
	.strict()

export type CliProfileMapEntry = z.infer<typeof cliProfileMapEntrySchema>

export const cliProfileMapSchema = z
	.object({
		version: z.literal(1),
		profiles: z.record(z.string(), cliProfileMapEntrySchema),
	})
	.strict()

export type CliProfileMap = z.infer<typeof cliProfileMapSchema>
