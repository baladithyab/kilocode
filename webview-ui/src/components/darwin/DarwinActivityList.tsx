// kilocode_change - new file for Darwin analytics activity list component
import { memo, useMemo } from "react"
import { FileText, Wrench, Users, CheckCircle, XCircle, Clock, AlertCircle, LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { StandardTooltip } from "@/components/ui"
import type { RecentProposal, RecentSkill, RecentReview } from "@roo/ExtensionMessage"

export type ActivityType = "proposal" | "skill" | "review"

export interface ActivityItem {
	id: string
	type: ActivityType
	title: string
	description?: string
	status: string
	timestamp: string
	metadata?: Record<string, unknown>
}

export interface DarwinActivityListProps {
	/** Title for the activity list section */
	title?: string
	/** List of proposals */
	proposals?: RecentProposal[]
	/** List of skills */
	skills?: RecentSkill[]
	/** List of reviews */
	reviews?: RecentReview[]
	/** Maximum items to display */
	maxItems?: number
	/** Whether to show loading state */
	loading?: boolean
	/** Callback when an item is clicked */
	onItemClick?: (item: ActivityItem) => void
	/** Additional className */
	className?: string
}

/**
 * Get icon for activity type
 */
function getActivityIcon(type: ActivityType): LucideIcon {
	switch (type) {
		case "proposal":
			return FileText
		case "skill":
			return Wrench
		case "review":
			return Users
	}
}

/**
 * Get status icon and color
 */
function getStatusConfig(status: string): { icon: LucideIcon; color: string; bgColor: string } {
	switch (status.toLowerCase()) {
		case "approved":
		case "applied":
		case "success":
			return {
				icon: CheckCircle,
				color: "text-green-500",
				bgColor: "bg-green-500/10",
			}
		case "rejected":
		case "failed":
			return {
				icon: XCircle,
				color: "text-red-500",
				bgColor: "bg-red-500/10",
			}
		case "pending":
		case "deferred":
			return {
				icon: Clock,
				color: "text-yellow-500",
				bgColor: "bg-yellow-500/10",
			}
		default:
			return {
				icon: AlertCircle,
				color: "text-vscode-descriptionForeground",
				bgColor: "bg-vscode-input-background",
			}
	}
}

/**
 * Format timestamp to relative time
 */
function formatRelativeTime(timestamp: string): string {
	try {
		const date = new Date(timestamp)
		const now = new Date()
		const diffMs = now.getTime() - date.getTime()
		const diffMins = Math.floor(diffMs / 60000)
		const diffHours = Math.floor(diffMs / 3600000)
		const diffDays = Math.floor(diffMs / 86400000)

		if (diffMins < 1) return "Just now"
		if (diffMins < 60) return `${diffMins}m ago`
		if (diffHours < 24) return `${diffHours}h ago`
		if (diffDays < 7) return `${diffDays}d ago`

		return date.toLocaleDateString()
	} catch {
		return timestamp
	}
}

/**
 * Format timestamp to full date for tooltip
 */
function formatFullDate(timestamp: string): string {
	try {
		const date = new Date(timestamp)
		return date.toLocaleString()
	} catch {
		return timestamp
	}
}

/**
 * Activity list item component
 */
interface ActivityListItemProps {
	item: ActivityItem
	onClick?: (item: ActivityItem) => void
}

const ActivityListItem = memo(function ActivityListItem({ item, onClick }: ActivityListItemProps) {
	const TypeIcon = getActivityIcon(item.type)
	const { icon: StatusIcon, color: statusColor, bgColor } = getStatusConfig(item.status)

	return (
		<button
			type="button"
			onClick={() => onClick?.(item)}
			className={cn(
				"w-full text-left p-3 rounded-md",
				"hover:bg-vscode-list-hoverBackground",
				"transition-colors duration-150",
				"focus:outline-none focus:ring-1 focus:ring-vscode-focusBorder",
				onClick ? "cursor-pointer" : "cursor-default",
			)}
			aria-label={`${item.type}: ${item.title} - ${item.status}`}>
			<div className="flex items-start gap-3">
				{/* Type icon */}
				<div className={cn("p-2 rounded-md flex-shrink-0", "bg-vscode-input-background")}>
					<TypeIcon className="w-4 h-4 text-vscode-descriptionForeground" aria-hidden="true" />
				</div>

				{/* Content */}
				<div className="flex-1 min-w-0">
					<div className="flex items-center justify-between gap-2">
						<span className="font-medium text-sm text-vscode-foreground truncate">{item.title}</span>
						<StandardTooltip content={formatFullDate(item.timestamp)}>
							<span className="text-xs text-vscode-descriptionForeground flex-shrink-0">
								{formatRelativeTime(item.timestamp)}
							</span>
						</StandardTooltip>
					</div>

					{item.description && (
						<p className="text-xs text-vscode-descriptionForeground mt-1 truncate">{item.description}</p>
					)}

					{/* Status badge */}
					<div className="flex items-center gap-1 mt-2">
						<span
							className={cn(
								"inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs",
								bgColor,
								statusColor,
							)}>
							<StatusIcon className="w-3 h-3" aria-hidden="true" />
							{item.status}
						</span>
					</div>
				</div>
			</div>
		</button>
	)
})

/**
 * Skeleton loader for activity items
 */
function ActivityListSkeleton({ count = 3 }: { count?: number }) {
	return (
		<div className="space-y-2">
			{Array.from({ length: count }).map((_, i) => (
				<div key={i} className="animate-pulse p-3">
					<div className="flex items-start gap-3">
						<div className="w-8 h-8 bg-vscode-input-background rounded-md" />
						<div className="flex-1">
							<div className="h-4 bg-vscode-input-background rounded w-3/4 mb-2" />
							<div className="h-3 bg-vscode-input-background rounded w-1/2 mb-2" />
							<div className="h-5 bg-vscode-input-background rounded w-16" />
						</div>
					</div>
				</div>
			))}
		</div>
	)
}

/**
 * Empty state component
 */
function EmptyState({ message }: { message: string }) {
	return (
		<div className="py-8 text-center">
			<AlertCircle className="w-8 h-8 mx-auto text-vscode-descriptionForeground mb-2" />
			<p className="text-sm text-vscode-descriptionForeground">{message}</p>
		</div>
	)
}

/**
 * DarwinActivityList - Displays recent Darwin system activities
 *
 * Combines proposals, skills, and reviews into a unified activity feed.
 * Supports:
 * - Different activity types with icons
 * - Status indicators
 * - Relative timestamps with full date tooltips
 * - Loading and empty states
 * - Click handlers for details
 */
export const DarwinActivityList = memo(function DarwinActivityList({
	title = "Recent Activity",
	proposals = [],
	skills = [],
	reviews = [],
	maxItems = 10,
	loading = false,
	onItemClick,
	className,
}: DarwinActivityListProps) {
	// Convert and merge all activity types
	const activities = useMemo<ActivityItem[]>(() => {
		const items: ActivityItem[] = []

		// Add proposals
		proposals.forEach((p) => {
			items.push({
				id: p.id,
				type: "proposal",
				title: p.title,
				description: `Type: ${p.type}`,
				status: p.status,
				timestamp: p.timestamp,
				metadata: { proposalType: p.type },
			})
		})

		// Add skills
		skills.forEach((s) => {
			items.push({
				id: s.id,
				type: "skill",
				title: s.name,
				description: `Synthesized via ${s.synthesisMethod}`,
				status: "applied",
				timestamp: s.timestamp,
				metadata: { synthesisMethod: s.synthesisMethod },
			})
		})

		// Add reviews
		reviews.forEach((r) => {
			items.push({
				id: r.id,
				type: "review",
				title: `Review for ${r.proposalId}`,
				description: `${r.reviewerCount} reviewer${r.reviewerCount !== 1 ? "s" : ""}`,
				status: r.decision,
				timestamp: r.timestamp,
				metadata: { reviewerCount: r.reviewerCount },
			})
		})

		// Sort by timestamp (newest first) and limit
		return items
			.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
			.slice(0, maxItems)
	}, [proposals, skills, reviews, maxItems])

	return (
		<div className={cn("rounded-lg border border-vscode-editorWidget-border", className)}>
			{/* Header */}
			<div className="px-4 py-3 border-b border-vscode-editorWidget-border">
				<h3 className="text-sm font-medium text-vscode-foreground">{title}</h3>
			</div>

			{/* Content */}
			<div className="divide-y divide-vscode-editorWidget-border">
				{loading ? (
					<ActivityListSkeleton count={3} />
				) : activities.length === 0 ? (
					<EmptyState message="No recent activity" />
				) : (
					activities.map((item) => <ActivityListItem key={item.id} item={item} onClick={onItemClick} />)
				)}
			</div>
		</div>
	)
})

export default DarwinActivityList
