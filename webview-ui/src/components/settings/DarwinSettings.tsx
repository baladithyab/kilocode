// kilocode_change - new file for Darwin evolution system settings
import { HTMLAttributes } from "react"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { VSCodeCheckbox, VSCodeDropdown, VSCodeOption } from "@vscode/webview-ui-toolkit/react"
import { Sparkles, AlertTriangle } from "lucide-react"

import {
	type DarwinConfigWithLLMSynthesis as DarwinConfig,
	type AutonomyLevel,
	AUTONOMY_LABELS,
	DEFAULT_DARWIN_CONFIG,
} from "@roo-code/types"

import { SetCachedStateField } from "./types"
import { SectionHeader } from "./SectionHeader"
import { Section } from "./Section"
import { Slider } from "../ui"

type DarwinSettingsProps = HTMLAttributes<HTMLDivElement> & {
	darwin?: DarwinConfig
	setCachedStateField: SetCachedStateField<"darwin">
}

export const DarwinSettings = ({ darwin, setCachedStateField, ...props }: DarwinSettingsProps) => {
	const { t } = useAppTranslation()

	// Use defaults if darwin is undefined
	const config = (darwin ?? DEFAULT_DARWIN_CONFIG) as any

	// Helper to update a single field in the darwin config
	const setDarwinField = <K extends keyof DarwinConfig>(field: K, value: DarwinConfig[K]) => {
		setCachedStateField("darwin", {
			...config,
			[field]: value,
		} as any)
	}

	return (
		<div {...props}>
			<SectionHeader
				description={t("settings:darwin.description", {
					defaultValue: "Configure the Darwin evolution system for self-improving agent capabilities.",
				})}>
				<div className="flex items-center gap-2">
					<Sparkles className="w-4" />
					<div>{t("settings:darwin.title", { defaultValue: "Darwin" })}</div>
				</div>
			</SectionHeader>

			{/* Master Enable Toggle */}
			<Section>
				<div className="flex flex-col gap-3">
					<div className="flex items-center gap-3 p-3 rounded-md bg-vscode-editor-background border border-vscode-editorWidget-border">
						<VSCodeCheckbox
							checked={config.enabled}
							onChange={(e: any) => setDarwinField("enabled", e.target.checked)}
							data-testid="darwin-enabled-checkbox">
							<span className="font-medium text-base">
								{t("settings:darwin.enabled.label", { defaultValue: "Enable Darwin Evolution System" })}
							</span>
						</VSCodeCheckbox>
					</div>
					<div className="text-vscode-descriptionForeground text-sm ml-1">
						{t("settings:darwin.enabled.description", {
							defaultValue:
								"When enabled, Darwin monitors task execution to detect patterns, propose improvements, and evolve agent capabilities over time.",
						})}
					</div>
				</div>
			</Section>

			{/* Warning Banner when enabled */}
			{config.enabled && (
				<Section>
					<div className="flex items-start gap-3 p-3 rounded-md bg-vscode-inputValidation-warningBackground border border-vscode-inputValidation-warningBorder">
						<AlertTriangle className="w-5 h-5 text-vscode-inputValidation-warningForeground flex-shrink-0 mt-0.5" />
						<div className="text-sm">
							<div className="font-medium text-vscode-inputValidation-warningForeground">
								{t("settings:darwin.warning.title", { defaultValue: "Experimental Feature" })}
							</div>
							<div className="text-vscode-foreground mt-1">
								{t("settings:darwin.warning.description", {
									defaultValue:
										"Darwin is an experimental system that learns from your interactions. Review proposals carefully before applying them.",
								})}
							</div>
						</div>
					</div>
				</Section>
			)}

			{/* Autonomy Level */}
			<Section>
				<div className="flex flex-col gap-2">
					<div className="font-medium">
						{t("settings:darwin.autonomyLevel.label", { defaultValue: "Autonomy Level" })}
					</div>
					<div className="text-vscode-descriptionForeground text-sm">
						{t("settings:darwin.autonomyLevel.description", {
							defaultValue: "Controls how much autonomy Darwin has when applying changes.",
						})}
					</div>
					<VSCodeDropdown
						value={String(config.autonomyLevel)}
						onChange={(e: any) => setDarwinField("autonomyLevel", Number(e.target.value) as AutonomyLevel)}
						disabled={!config.enabled}
						data-testid="darwin-autonomy-dropdown">
						<VSCodeOption value="0">
							{AUTONOMY_LABELS[0]} -{" "}
							{t("settings:darwin.autonomyLevel.manual", {
								defaultValue: "All changes require approval",
							})}
						</VSCodeOption>
						<VSCodeOption value="1">
							{AUTONOMY_LABELS[1]} -{" "}
							{t("settings:darwin.autonomyLevel.assisted", {
								defaultValue: "Low-risk changes auto-applied",
							})}
						</VSCodeOption>
						<VSCodeOption value="2">
							{AUTONOMY_LABELS[2]} -{" "}
							{t("settings:darwin.autonomyLevel.auto", { defaultValue: "All changes auto-applied" })}
						</VSCodeOption>
					</VSCodeDropdown>
				</div>
			</Section>

			{/* Trace Capture */}
			<Section>
				<div className="flex flex-col gap-1">
					<VSCodeCheckbox
						checked={config.traceCapture}
						onChange={(e: any) => setDarwinField("traceCapture", e.target.checked)}
						disabled={!config.enabled}
						data-testid="darwin-trace-checkbox">
						<span className="font-medium">
							{t("settings:darwin.traceCapture.label", { defaultValue: "Enable Trace Capture" })}
						</span>
					</VSCodeCheckbox>
					<div className="text-vscode-descriptionForeground text-sm ml-5 mt-1">
						{t("settings:darwin.traceCapture.description", {
							defaultValue:
								"Capture events during task execution to enable pattern detection and learning.",
						})}
					</div>
				</div>
			</Section>

			{/* Doom Loop Threshold */}
			<Section>
				<div className="flex flex-col gap-2">
					<div className="font-medium">
						{t("settings:darwin.doomLoopThreshold.label", {
							defaultValue: "Doom Loop Detection Threshold",
						})}
					</div>
					<div className="text-vscode-descriptionForeground text-sm">
						{t("settings:darwin.doomLoopThreshold.description", {
							defaultValue:
								"Number of repeated failures before triggering doom loop detection. Lower values are more sensitive.",
						})}
					</div>
					<div className="flex items-center gap-3 mt-1">
						<Slider
							min={2}
							max={10}
							step={1}
							value={[config.doomLoopThreshold]}
							onValueChange={([value]) => setDarwinField("doomLoopThreshold", value)}
							disabled={!config.enabled}
							data-testid="darwin-doom-threshold-slider"
							className="flex-1"
						/>
						<span className="text-sm text-vscode-foreground min-w-[40px] text-center">
							{config.doomLoopThreshold}
						</span>
					</div>
				</div>
			</Section>

			{/* Feature Toggles */}
			<Section>
				<div className="font-medium mb-3">
					{t("settings:darwin.features.title", { defaultValue: "Advanced Features" })}
				</div>

				{/* Autonomous Execution */}
				<div className="flex flex-col gap-1 mb-3">
					<VSCodeCheckbox
						checked={config.enableAutonomousExecution}
						onChange={(e: any) => setDarwinField("enableAutonomousExecution", e.target.checked)}
						disabled={!config.enabled}
						data-testid="darwin-autonomous-execution-checkbox">
						<span className="font-medium">
							{t("settings:darwin.enableAutonomousExecution.label", {
								defaultValue: "Autonomous Execution",
							})}
						</span>
					</VSCodeCheckbox>
					<div className="text-vscode-descriptionForeground text-sm ml-5 mt-1">
						{t("settings:darwin.enableAutonomousExecution.description", {
							defaultValue: "Allow Darwin to automatically execute approved proposals.",
						})}
					</div>
				</div>

				{/* Skill Synthesis */}
				<div className="flex flex-col gap-1 mb-3">
					<VSCodeCheckbox
						checked={config.enableSkillSynthesis}
						onChange={(e: any) => setDarwinField("enableSkillSynthesis", e.target.checked)}
						disabled={!config.enabled}
						data-testid="darwin-skill-synthesis-checkbox">
						<span className="font-medium">
							{t("settings:darwin.skillSynthesis.label", { defaultValue: "Skill Synthesis" })}
						</span>
					</VSCodeCheckbox>
					<div className="text-vscode-descriptionForeground text-sm ml-5 mt-1">
						{t("settings:darwin.skillSynthesis.description", {
							defaultValue:
								"Allow Darwin to create new tools and patterns based on successful workflows.",
						})}
					</div>
				</div>

				{/* Multi-Agent Council */}
				<div className="flex flex-col gap-1 mb-3">
					<VSCodeCheckbox
						checked={config.enableMultiAgentCouncil}
						onChange={(e: any) => setDarwinField("enableMultiAgentCouncil", e.target.checked)}
						disabled={!config.enabled}
						data-testid="darwin-multi-agent-council-checkbox">
						<span className="font-medium">
							{t("settings:darwin.enableMultiAgentCouncil.label", {
								defaultValue: "Multi-Agent Council",
							})}
						</span>
					</VSCodeCheckbox>
					<div className="text-vscode-descriptionForeground text-sm ml-5 mt-1">
						{t("settings:darwin.enableMultiAgentCouncil.description", {
							defaultValue:
								"Enable specialized agents (Analyst, Security, Reviewer) to review proposals.",
						})}
					</div>
				</div>

				{/* Self-Healing */}
				<div className="flex flex-col gap-1 mb-3">
					<VSCodeCheckbox
						checked={config.enableSelfHealing}
						onChange={(e: any) => setDarwinField("enableSelfHealing", e.target.checked)}
						disabled={!config.enabled}
						data-testid="darwin-self-healing-checkbox">
						<span className="font-medium">
							{t("settings:darwin.enableSelfHealing.label", { defaultValue: "Self-Healing" })}
						</span>
					</VSCodeCheckbox>
					<div className="text-vscode-descriptionForeground text-sm ml-5 mt-1">
						{t("settings:darwin.enableSelfHealing.description", {
							defaultValue: "Automatically detect and fix common errors and doom loops.",
						})}
					</div>
				</div>

				{/* Performance Analytics */}
				<div className="flex flex-col gap-1 mb-3">
					<VSCodeCheckbox
						checked={config.enablePerformanceAnalytics}
						onChange={(e: any) => setDarwinField("enablePerformanceAnalytics", e.target.checked)}
						disabled={!config.enabled}
						data-testid="darwin-performance-analytics-checkbox">
						<span className="font-medium">
							{t("settings:darwin.enablePerformanceAnalytics.label", {
								defaultValue: "Performance Analytics",
							})}
						</span>
					</VSCodeCheckbox>
					<div className="text-vscode-descriptionForeground text-sm ml-5 mt-1">
						{t("settings:darwin.enablePerformanceAnalytics.description", {
							defaultValue: "Track and analyze agent performance metrics over time.",
						})}
					</div>
				</div>

				{/* Config Evolution */}
				<div className="flex flex-col gap-1 mb-3">
					<VSCodeCheckbox
						checked={config.configEvolution}
						onChange={(e: any) => setDarwinField("configEvolution", e.target.checked)}
						disabled={!config.enabled}
						data-testid="darwin-config-evolution-checkbox">
						<span className="font-medium">
							{t("settings:darwin.configEvolution.label", { defaultValue: "Configuration Evolution" })}
						</span>
					</VSCodeCheckbox>
					<div className="text-vscode-descriptionForeground text-sm ml-5 mt-1">
						{t("settings:darwin.configEvolution.description", {
							defaultValue:
								"Allow Darwin to suggest changes to extension settings based on usage patterns.",
						})}
					</div>
				</div>
			</Section>

			{/* Execution Settings */}
			<Section>
				<div className="font-medium mb-3">
					{t("settings:darwin.execution.title", { defaultValue: "Execution Environment" })}
				</div>

				{/* Skill Execution Mode */}
				<div className="flex flex-col gap-2 mb-3">
					<div className="font-medium text-sm">
						{t("settings:darwin.skillExecutionMode.label", { defaultValue: "Skill Execution Mode" })}
					</div>
					<div className="text-vscode-descriptionForeground text-sm">
						{t("settings:darwin.skillExecutionMode.description", {
							defaultValue: "Choose how synthesized skills are executed.",
						})}
					</div>
					<VSCodeDropdown
						value={config.skillExecutionMode}
						onChange={(e: any) => setDarwinField("skillExecutionMode", e.target.value)}
						disabled={!config.enabled}
						data-testid="darwin-execution-mode-dropdown">
						<VSCodeOption value="default">
							{t("settings:darwin.skillExecutionMode.default", { defaultValue: "Default (Standard)" })}
						</VSCodeOption>
						<VSCodeOption value="docker-isolated">
							{t("settings:darwin.skillExecutionMode.docker", {
								defaultValue: "Docker Isolated (Recommended)",
							})}
						</VSCodeOption>
					</VSCodeDropdown>
					{config.skillExecutionMode === "docker-isolated" && (
						<div className="flex items-center gap-2 text-xs text-vscode-descriptionForeground mt-1">
							<AlertTriangle className="w-3 h-3" />
							<span>Requires Docker to be installed and running.</span>
						</div>
					)}
				</div>
			</Section>
		</div>
	)
}
