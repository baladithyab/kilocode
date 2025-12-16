import React from "react"
import { VSCodeRadio, VSCodeRadioGroup } from "@vscode/webview-ui-toolkit/react"

import { Button, StandardTooltip } from "@src/components/ui"

export type AutomationLevel = 0 | 1 | 2 | 3

type AutomationLevelSelectorProps = {
	value: AutomationLevel
	savedValue?: AutomationLevel
	onChange: (value: AutomationLevel) => void
	onSave: () => void
	isSaving?: boolean
}

const levels: { level: AutomationLevel; title: string; description: string }[] = [
	{ level: 0, title: "Level 0 (Manual)", description: "Review all proposals manually." },
	{ level: 1, title: "Level 1 (Auto-Trigger)", description: "Automatic reviews, manual approval." },
	{ level: 2, title: "Level 2 (Auto-Apply Low Risk)", description: "Auto-apply safe changes." },
	{ level: 3, title: "Level 3 (Full Closed-Loop)", description: "Full automation with A/B testing." },
]

export const AutomationLevelSelector = ({
	value,
	savedValue,
	onChange,
	onSave,
	isSaving,
}: AutomationLevelSelectorProps) => {
	const hasUnsavedChange = savedValue === undefined || savedValue !== value

	return (
		<div className="flex flex-col gap-3 bg-vscode-editor-background border border-vscode-panel-border rounded-md p-4">
			<div className="text-sm font-medium text-vscode-foreground">Automation level</div>
			<p className="text-xs text-vscode-descriptionForeground mt-0 mb-1">
				Choose the automation level for Evolution workflows. Higher levels increase speed but also risk.
			</p>
			<VSCodeRadioGroup
				value={String(value)}
				onChange={(event: any) => onChange(Number(event.target.value) as AutomationLevel)}>
				<div className="grid gap-2 md:grid-cols-2">
					{levels.map((item) => (
						<label
							key={item.level}
							className="flex gap-3 rounded-md border border-vscode-panel-border/70 bg-vscode-editorWidget-background/70 p-3 hover:border-vscode-focusBorder transition-colors">
							<VSCodeRadio value={String(item.level)} />
							<div className="flex flex-col gap-1">
								<div className="text-sm font-medium text-vscode-foreground">{item.title}</div>
								<p className="text-xs text-vscode-descriptionForeground mt-0 mb-0">
									{item.description}
								</p>
							</div>
						</label>
					))}
				</div>
			</VSCodeRadioGroup>
			<div className="flex items-center gap-2">
				<StandardTooltip content={hasUnsavedChange ? "Save automation level" : "Already saved"}>
					<Button disabled={!hasUnsavedChange || isSaving} onClick={onSave} className="w-fit">
						{isSaving ? "Saving…" : "Save configuration"}
					</Button>
				</StandardTooltip>
				{savedValue !== undefined && (
					<span className="text-xs text-vscode-descriptionForeground">Current: Level {savedValue}</span>
				)}
			</div>
		</div>
	)
}

export default AutomationLevelSelector
