import React from "react"

import { Badge } from "@src/components/ui"

const statusColor = (status?: string) => {
	if (!status) return "bg-vscode-editorWidget-background"
	const normalized = status.toLowerCase()
	if (normalized.includes("running") || normalized.includes("active"))
		return "bg-vscode-statusBarItem-remoteBackground/30"
	if (normalized.includes("error") || normalized.includes("failed"))
		return "bg-vscode-inputValidation-errorBackground/30"
	return "bg-vscode-editorWidget-background"
}

type StatusDashboardProps = {
	automationLevel?: number
	automationLabel?: string
	pendingProposals?: number
	lastCouncilReview?: string
	abTestStatus?: string
	councilMembers?: string[]
}

const formatTime = (value?: string) => {
	if (!value) return "Not recorded"
	const date = new Date(value)
	return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

export const StatusDashboard = ({
	automationLevel,
	automationLabel,
	pendingProposals,
	lastCouncilReview,
	abTestStatus,
	councilMembers,
}: StatusDashboardProps) => (
	<div className="grid gap-3 md:grid-cols-2">
		<div className="bg-vscode-editor-background border border-vscode-panel-border rounded-md p-4 flex flex-col gap-2">
			<div className="text-sm font-medium text-vscode-foreground">Automation</div>
			<div className="flex items-center gap-2">
				<Badge variant="outline">Level {automationLevel ?? "-"}</Badge>
				<span className="text-xs text-vscode-descriptionForeground">{automationLabel ?? "Not configured"}</span>
			</div>
		</div>

		<div className="bg-vscode-editor-background border border-vscode-panel-border rounded-md p-4 flex flex-col gap-1">
			<div className="text-sm font-medium text-vscode-foreground">Council review</div>
			<div className="text-xs text-vscode-descriptionForeground">Last run: {formatTime(lastCouncilReview)}</div>
			<div className="text-xs text-vscode-descriptionForeground">Pending proposals: {pendingProposals ?? 0}</div>
		</div>

		<div className="bg-vscode-editor-background border border-vscode-panel-border rounded-md p-4 flex flex-col gap-1">
			<div className="text-sm font-medium text-vscode-foreground">A/B testing</div>
			<div className={`text-xs px-2 py-1 rounded-sm w-fit ${statusColor(abTestStatus)}`}>
				{abTestStatus ?? "Not started"}
			</div>
		</div>

		<div className="bg-vscode-editor-background border border-vscode-panel-border rounded-md p-4 flex flex-col gap-2">
			<div className="text-sm font-medium text-vscode-foreground">Council members</div>
			<div className="flex flex-wrap gap-2">
				{(councilMembers ?? []).map((member) => (
					<Badge key={member} variant="secondary" className="text-[11px]">
						{member}
					</Badge>
				))}
				{(councilMembers ?? []).length === 0 && (
					<span className="text-xs text-vscode-descriptionForeground">No members configured</span>
				)}
			</div>
		</div>
	</div>
)

export default StatusDashboard
