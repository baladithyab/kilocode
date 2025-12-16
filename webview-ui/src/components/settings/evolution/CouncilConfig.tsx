import React, { useMemo } from "react"
import { VSCodeCheckbox } from "@vscode/webview-ui-toolkit/react"

import { Badge, Button, StandardTooltip } from "@src/components/ui"
import { cn } from "@src/lib/utils"

type CouncilConfigProps = {
	profiles: CouncilProfile[]
	selectedIds: string[]
	onChange: (next: string[]) => void
	onConfigure: () => void
	isSaving?: boolean
	lastUpdated?: string
	minSelection?: number
	maxSelection?: number
}

export type CouncilProfile = {
	id: string
	name: string
	role: string
	summary?: string
}

const formatDate = (value?: string) => {
	if (!value) return "Not yet run"
	const parsed = new Date(value)
	return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString()
}

export const CouncilConfig: React.FC<CouncilConfigProps> = ({
	profiles,
	selectedIds,
	onChange,
	onConfigure,
	isSaving,
	lastUpdated,
	minSelection = 3,
	maxSelection = 5,
}: CouncilConfigProps) => {
	const selectedProfiles = useMemo(
		() => selectedIds.map((id) => profiles.find((p) => p.id === id)).filter(Boolean) as CouncilProfile[],
		[profiles, selectedIds],
	)

	const toggle = (id: string) => {
		onChange(
			selectedIds.includes(id)
				? selectedIds.filter((value) => value !== id)
				: selectedIds.length < maxSelection
					? [...selectedIds, id]
					: selectedIds,
		)
	}

	const selectionTooSmall = selectedIds.length < minSelection
	const selectionTooLarge = selectedIds.length > maxSelection

	return (
		<div className="flex flex-col gap-3 bg-vscode-editor-background border border-vscode-panel-border rounded-md p-4">
			<div className="flex items-start justify-between gap-2">
				<div>
					<div className="text-sm font-medium text-vscode-foreground">Council configuration</div>
					<p className="text-vscode-descriptionForeground text-xs mt-1 mb-0">
						Choose 3-5 profiles from <code>docs/kilo-profiles.md</code> to define the Evolution council.
					</p>
				</div>
				<div className="text-xs text-vscode-descriptionForeground">
					Last configured: {formatDate(lastUpdated)}
				</div>
			</div>

			<div className="grid gap-3 md:grid-cols-2">
				{profiles.map((profile) => {
					const checked = selectedIds.includes(profile.id)
					const limitReached = !checked && selectedIds.length >= maxSelection
					return (
						<label
							key={profile.id}
							className={cn(
								"flex gap-3 rounded-md border border-vscode-panel-border bg-vscode-editorWidget-background/60 p-3 hover:border-vscode-focusBorder transition-colors",
								limitReached && "opacity-60 cursor-not-allowed",
							)}>
							<VSCodeCheckbox
								checked={checked}
								disabled={limitReached}
								onChange={() => toggle(profile.id)}
								aria-label={`Select ${profile.name}`}
							/>
							<div className="flex-1">
								<div className="flex items-center gap-2">
									<div className="font-medium text-sm text-vscode-foreground">{profile.name}</div>
									<Badge variant="secondary" className="text-[11px]">
										{profile.role}
									</Badge>
								</div>
								{profile.summary && (
									<p className="text-vscode-descriptionForeground text-xs mt-1 mb-0">
										{profile.summary}
									</p>
								)}
							</div>
						</label>
					)
				})}
			</div>

			<div className="flex flex-wrap gap-2 items-center">
				<div className="text-xs text-vscode-descriptionForeground">
					Selected {selectedIds.length}/{maxSelection}
				</div>
				{selectedProfiles.map((profile) => (
					<Badge key={profile.id} variant="outline" className="text-[11px]">
						{profile.name} • {profile.role}
					</Badge>
				))}
			</div>

			<div className="flex items-center gap-2">
				<StandardTooltip
					content={
						selectionTooSmall
							? `Select at least ${minSelection} profiles`
							: selectionTooLarge
								? `Select at most ${maxSelection} profiles`
								: "Save selected council to .kilocode/evolution/council.yaml"
					}>
					<Button
						className="w-fit"
						disabled={selectionTooSmall || selectionTooLarge || isSaving}
						onClick={onConfigure}>
						{isSaving ? "Saving…" : "Configure Council"}
					</Button>
				</StandardTooltip>
				{selectionTooSmall && (
					<span className="text-xs text-vscode-errorForeground">
						Select at least {minSelection} profiles.
					</span>
				)}
			</div>
		</div>
	)
}

export default CouncilConfig
