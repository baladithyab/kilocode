// kilocode_change - new file for Darwin analytics metric card component
import { memo, type ReactNode } from "react"
import { LucideIcon, TrendingUp, TrendingDown, Minus } from "lucide-react"
import { cn } from "@/lib/utils"
import { StandardTooltip } from "@/components/ui"

export type MetricValueType = "number" | "percentage" | "time" | "currency"
export type TrendDirection = "up" | "down" | "neutral"

export interface MetricCardProps {
	/** Card title */
	title: string
	/** Main value to display */
	value: number | string
	/** Type of value for formatting */
	valueType?: MetricValueType
	/** Icon to display */
	icon?: LucideIcon
	/** Trend direction for visual indicator */
	trend?: TrendDirection
	/** Trend value (e.g., "+12%") */
	trendValue?: string
	/** Optional subtitle or description */
	subtitle?: string
	/** Optional tooltip content */
	tooltip?: string
	/** Whether the card is in loading state */
	loading?: boolean
	/** Additional className */
	className?: string
	/** Optional children for custom content */
	children?: ReactNode
}

/**
 * Format value based on type
 */
function formatValue(value: number | string, type: MetricValueType = "number"): string {
	if (typeof value === "string") return value

	switch (type) {
		case "percentage":
			return `${value.toFixed(1)}%`
		case "time":
			if (value < 1000) return `${value}ms`
			if (value < 60000) return `${(value / 1000).toFixed(1)}s`
			return `${(value / 60000).toFixed(1)}m`
		case "currency":
			return `$${value.toFixed(2)}`
		case "number":
		default:
			if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
			if (value >= 1000) return `${(value / 1000).toFixed(1)}K`
			return value.toLocaleString()
	}
}

/**
 * Get trend icon based on direction
 */
function getTrendIcon(trend: TrendDirection): LucideIcon {
	switch (trend) {
		case "up":
			return TrendingUp
		case "down":
			return TrendingDown
		default:
			return Minus
	}
}

/**
 * Get trend color based on direction
 */
function getTrendColor(trend: TrendDirection): string {
	switch (trend) {
		case "up":
			return "text-green-500"
		case "down":
			return "text-red-500"
		default:
			return "text-vscode-descriptionForeground"
	}
}

/**
 * Skeleton loader for metric card
 */
function MetricCardSkeleton() {
	return (
		<div className="animate-pulse">
			<div className="h-4 bg-vscode-input-background rounded w-3/4 mb-2" />
			<div className="h-8 bg-vscode-input-background rounded w-1/2 mb-1" />
			<div className="h-3 bg-vscode-input-background rounded w-1/3" />
		</div>
	)
}

/**
 * DarwinMetricCard - Reusable card for displaying individual metrics
 *
 * Supports:
 * - Different value types (number, percentage, time, currency)
 * - Trend indicators (up, down, neutral)
 * - Loading states with skeleton
 * - Tooltips for additional context
 * - Custom icons
 */
export const DarwinMetricCard = memo(function DarwinMetricCard({
	title,
	value,
	valueType = "number",
	icon: Icon,
	trend,
	trendValue,
	subtitle,
	tooltip,
	loading = false,
	className,
	children,
}: MetricCardProps) {
	const formattedValue = formatValue(value, valueType)
	const TrendIcon = trend ? getTrendIcon(trend) : null
	const trendColor = trend ? getTrendColor(trend) : ""

	const cardContent = (
		<div
			className={cn(
				"p-4 rounded-lg border border-vscode-editorWidget-border",
				"bg-vscode-editor-background hover:bg-vscode-list-hoverBackground",
				"transition-colors duration-150",
				className,
			)}
			role="article"
			aria-label={`${title}: ${formattedValue}`}>
			{loading ? (
				<MetricCardSkeleton />
			) : (
				<>
					{/* Header with icon and title */}
					<div className="flex items-center gap-2 mb-2">
						{Icon && (
							<Icon
								className="w-4 h-4 text-vscode-descriptionForeground flex-shrink-0"
								aria-hidden="true"
							/>
						)}
						<span className="text-sm text-vscode-descriptionForeground truncate">{title}</span>
					</div>

					{/* Main value */}
					<div className="flex items-baseline gap-2">
						<span className="text-2xl font-semibold text-vscode-foreground">{formattedValue}</span>

						{/* Trend indicator */}
						{trend && TrendIcon && (
							<div className={cn("flex items-center gap-1", trendColor)}>
								<TrendIcon className="w-4 h-4" aria-hidden="true" />
								{trendValue && <span className="text-xs">{trendValue}</span>}
							</div>
						)}
					</div>

					{/* Subtitle */}
					{subtitle && <p className="text-xs text-vscode-descriptionForeground mt-1 truncate">{subtitle}</p>}

					{/* Custom content */}
					{children}
				</>
			)}
		</div>
	)

	// Wrap with tooltip if provided
	if (tooltip) {
		return <StandardTooltip content={tooltip}>{cardContent}</StandardTooltip>
	}

	return cardContent
})

export default DarwinMetricCard
