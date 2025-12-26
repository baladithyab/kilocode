// kilocode_change - new file for Darwin health indicator component
import { memo } from "react"
import { CheckCircle, AlertTriangle, XCircle, Activity, LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { StandardTooltip } from "@/components/ui"

export type HealthStatus = "healthy" | "degraded" | "unhealthy"

export interface HealthComponent {
	name: string
	status: string
}

export interface DarwinHealthIndicatorProps {
	/** Overall health status */
	status: HealthStatus
	/** Individual component health */
	components?: HealthComponent[]
	/** Last update timestamp */
	lastUpdate?: string
	/** Whether to show loading state */
	loading?: boolean
	/** Size variant */
	size?: "sm" | "md" | "lg"
	/** Additional className */
	className?: string
}

/**
 * Get configuration for health status
 */
function getStatusConfig(status: HealthStatus): {
	icon: LucideIcon
	color: string
	bgColor: string
	label: string
} {
	switch (status) {
		case "healthy":
			return {
				icon: CheckCircle,
				color: "text-green-500",
				bgColor: "bg-green-500/10",
				label: "Healthy",
			}
		case "degraded":
			return {
				icon: AlertTriangle,
				color: "text-yellow-500",
				bgColor: "bg-yellow-500/10",
				label: "Degraded",
			}
		case "unhealthy":
			return {
				icon: XCircle,
				color: "text-red-500",
				bgColor: "bg-red-500/10",
				label: "Unhealthy",
			}
	}
}

/**
 * Get size classes
 */
function getSizeClasses(size: "sm" | "md" | "lg"): {
	iconSize: string
	textSize: string
	padding: string
} {
	switch (size) {
		case "sm":
			return {
				iconSize: "w-4 h-4",
				textSize: "text-xs",
				padding: "px-2 py-1",
			}
		case "lg":
			return {
				iconSize: "w-6 h-6",
				textSize: "text-base",
				padding: "px-4 py-3",
			}
		case "md":
		default:
			return {
				iconSize: "w-5 h-5",
				textSize: "text-sm",
				padding: "px-3 py-2",
			}
	}
}

/**
 * Skeleton loader
 */
function HealthIndicatorSkeleton({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
	const { iconSize, padding } = getSizeClasses(size)

	return (
		<div className={cn("animate-pulse flex items-center gap-2", padding)}>
			<div className={cn(iconSize, "bg-vscode-input-background rounded-full")} />
			<div className="h-4 bg-vscode-input-background rounded w-16" />
		</div>
	)
}

/**
 * DarwinHealthIndicator - Visual health status indicator
 *
 * Displays:
 * - Overall system health status
 * - Color-coded indicator (green/yellow/red)
 * - Hover tooltip with component details
 * - Last update timestamp
 */
export const DarwinHealthIndicator = memo(function DarwinHealthIndicator({
	status,
	components = [],
	lastUpdate,
	loading = false,
	size = "md",
	className,
}: DarwinHealthIndicatorProps) {
	if (loading) {
		return <HealthIndicatorSkeleton size={size} />
	}

	const { icon: StatusIcon, color, bgColor, label } = getStatusConfig(status)
	const { iconSize, textSize, padding } = getSizeClasses(size)

	const tooltipContent = (
		<div className="space-y-1">
			<div className="font-medium">System Health: {label}</div>
			{components.length > 0 && (
				<div className="text-xs opacity-80">
					{components.map((c) => (
						<div key={c.name}>
							{c.name}: {c.status}
						</div>
					))}
				</div>
			)}
			{lastUpdate && (
				<div className="text-xs opacity-60">Last updated: {new Date(lastUpdate).toLocaleTimeString()}</div>
			)}
		</div>
	)

	return (
		<StandardTooltip content={tooltipContent}>
			<div
				className={cn("inline-flex items-center gap-2 rounded-full", bgColor, padding, className)}
				role="status"
				aria-label={`System health: ${label}`}>
				<StatusIcon className={cn(iconSize, color)} aria-hidden="true" />
				<span className={cn(textSize, color, "font-medium")}>{label}</span>

				{/* Pulse animation for unhealthy status */}
				{status === "unhealthy" && (
					<Activity className={cn("w-3 h-3 animate-pulse", color)} aria-hidden="true" />
				)}
			</div>
		</StandardTooltip>
	)
})

export default DarwinHealthIndicator
