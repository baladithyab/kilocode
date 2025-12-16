import React from "react"

import { Button, StandardTooltip } from "@src/components/ui"

export type QuickAction = {
	label: string
	description: string
	commandId: string
}

type QuickActionsProps = {
	actions: QuickAction[]
	onAction: (commandId: string) => void
}

export const QuickActions = ({ actions, onAction }: QuickActionsProps) => {
	return (
		<div className="flex flex-col gap-3 bg-vscode-editor-background border border-vscode-panel-border rounded-md p-4">
			<div className="text-sm font-medium text-vscode-foreground">Quick actions</div>
			<p className="text-xs text-vscode-descriptionForeground mt-0 mb-1">
				Run Evolution commands directly from the webview to remove manual palette steps.
			</p>
			<div className="grid gap-2 md:grid-cols-2">
				{actions.map((action) => (
					<StandardTooltip key={action.commandId} content={action.description}>
						<Button
							variant="secondary"
							className="justify-start"
							onClick={() => onAction(action.commandId)}>
							{action.label}
						</Button>
					</StandardTooltip>
				))}
			</div>
		</div>
	)
}

export default QuickActions
