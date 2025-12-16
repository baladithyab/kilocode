import React, { useCallback, useEffect, useMemo, useState } from "react"
import { Sparkles } from "lucide-react"

import { Section } from "./Section"
import { SectionHeader } from "./SectionHeader"
import { CouncilConfig, type CouncilProfile } from "./evolution/CouncilConfig"
import { AutomationLevelSelector, type AutomationLevel } from "./evolution/AutomationLevelSelector"
import { QuickActions } from "./evolution/QuickActions"
import { StatusDashboard } from "./evolution/StatusDashboard"
import { vscode } from "@src/utils/vscode"

const DEFAULT_PROFILES: CouncilProfile[] = [
	{
		id: "context-manager",
		name: "Context Manager",
		role: "Memory & Governance",
		summary: "Curates project memory, skills, and governance changes for the Evolution Layer.",
	},
	{
		id: "eval-engineer",
		name: "Eval Engineer",
		role: "Quality & Rubrics",
		summary: "Maintains evals, rubrics, and trace templates to keep changes measurable and auditable.",
	},
]

const automationLabels: Record<AutomationLevel, string> = {
	0: "Manual",
	1: "Auto-Trigger",
	2: "Auto-Apply Low Risk",
	3: "Full Closed-Loop",
}

type EvolutionStatus = {
	lastCouncilReview?: string
	pendingProposals?: number
	abTestStatus?: string
	automationLevel?: AutomationLevel
	councilMembers?: string[]
}

export const EvolutionSettings = () => {
	const councilMin = useMemo(() => Math.min(3, Math.max(1, DEFAULT_PROFILES.length)), [])
	const councilMax = useMemo(
		() => Math.max(councilMin, Math.min(5, Math.max(1, DEFAULT_PROFILES.length))),
		[councilMin],
	)
	const defaultCouncil = useMemo(() => DEFAULT_PROFILES.slice(0, councilMax).map((p) => p.id), [councilMax])
	const [selectedCouncil, setSelectedCouncil] = useState<string[]>(defaultCouncil)
	const [automationLevel, setAutomationLevel] = useState<AutomationLevel>(0)
	const [savedAutomationLevel, setSavedAutomationLevel] = useState<AutomationLevel>(0)
	const [status, setStatus] = useState<EvolutionStatus>({
		pendingProposals: 0,
	})
	const [isSavingCouncil, setIsSavingCouncil] = useState(false)
	const [isSavingAutomation, setIsSavingAutomation] = useState(false)

	const handleMessage = useCallback((event: MessageEvent<any>) => {
		const message = event.data
		if (!message || typeof message !== "object") return

		if (message.type === "evolution.state" || message.type === "evolution.status") {
			const data = message.data || {}
			if (Array.isArray(data.councilMembers) && data.councilMembers.length > 0) {
				setSelectedCouncil(data.councilMembers)
			}
			if (typeof data.automationLevel === "number") {
				setAutomationLevel(data.automationLevel as AutomationLevel)
				setSavedAutomationLevel(data.automationLevel as AutomationLevel)
			}
			setStatus((prev) => ({
				...prev,
				lastCouncilReview: data.lastCouncilReview ?? prev.lastCouncilReview,
				pendingProposals:
					typeof data.pendingProposals === "number" ? data.pendingProposals : (prev.pendingProposals ?? 0),
				abTestStatus: data.abTestStatus ?? prev.abTestStatus,
				automationLevel: (data.automationLevel as AutomationLevel | undefined) ?? prev.automationLevel,
				councilMembers: data.councilMembers ?? prev.councilMembers,
			}))
		}

		if (message.type === "evolution.actionResult") {
			setIsSavingCouncil(false)
			setIsSavingAutomation(false)
			if (message.data?.automationLevel !== undefined) {
				setSavedAutomationLevel(message.data.automationLevel as AutomationLevel)
			}
		}
	}, [])

	useEffect(() => {
		window.addEventListener("message", handleMessage)
		vscode.postMessage({ type: "evolution.requestState" } as any)
		return () => window.removeEventListener("message", handleMessage)
	}, [handleMessage])

	const handleConfigureCouncil = () => {
		setIsSavingCouncil(true)
		vscode.postMessage({
			type: "evolution.configure",
			data: { councilMembers: selectedCouncil },
		} as any)
	}

	const handleSaveAutomation = () => {
		setIsSavingAutomation(true)
		vscode.postMessage({
			type: "evolution.setAutomationLevel",
			data: { automationLevel },
		} as any)
	}

	const handleQuickAction = (commandId: string) => {
		vscode.postMessage({ type: "openExternal", url: `command:${commandId}` })
	}

	return (
		<div className="flex flex-col gap-3">
			<SectionHeader description="Configure automation for the Evolution Layer without leaving the webview.">
				<div className="flex items-center gap-2">
					<Sparkles className="w-4 h-4 text-vscode-chart-line" />
					<div className="font-medium">Evolution Layer</div>
				</div>
			</SectionHeader>

			<Section className="gap-6">
				<CouncilConfig
					profiles={DEFAULT_PROFILES}
					selectedIds={selectedCouncil}
					onChange={setSelectedCouncil}
					onConfigure={handleConfigureCouncil}
					isSaving={isSavingCouncil}
					lastUpdated={status.lastCouncilReview}
					minSelection={councilMin}
					maxSelection={councilMax}
				/>

				<AutomationLevelSelector
					value={automationLevel}
					onChange={setAutomationLevel}
					onSave={handleSaveAutomation}
					isSaving={isSavingAutomation}
					savedValue={savedAutomationLevel}
				/>

				<QuickActions
					onAction={handleQuickAction}
					actions={[
						{
							label: "Bootstrap Evolution Layer",
							description: "Initializes governance scaffolding and dependencies.",
							commandId: "kilo-code.bootstrapEvolution",
						},
						{
							label: "Export Trace",
							description: "Bundle the latest trace for council review.",
							commandId: "kilo-code.exportTraceForCouncil",
						},
						{
							label: "Run Council Review",
							description: "Execute the council review workflow end-to-end.",
							commandId: "kilo-code.runCouncilReviewTrace",
						},
						{
							label: "Generate Proposal",
							description: "Synthesize proposals from scorecards and traces.",
							commandId: "kilo-code.generateEvolutionProposalFromScorecards",
						},
						{
							label: "Start A/B Test",
							description: "Launch the automated A/B testing workflow (Level 3).",
							commandId: "kilo-code.evolutionRunABTest",
						},
						{
							label: "View Latest Artifacts",
							description: "Open the latest Evolution artifacts and reports.",
							commandId: "kilo-code.evolutionOpenLatestArtifact",
						},
					]}
				/>

				<StatusDashboard
					automationLevel={status.automationLevel ?? automationLevel}
					pendingProposals={status.pendingProposals}
					lastCouncilReview={status.lastCouncilReview}
					abTestStatus={status.abTestStatus}
					councilMembers={status.councilMembers ?? selectedCouncil}
					automationLabel={automationLabels[status.automationLevel ?? automationLevel]}
				/>
			</Section>
		</div>
	)
}

export default EvolutionSettings
