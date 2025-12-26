// kilocode_change - new file for Darwin Analytics Dashboard component
import { memo, useCallback, useEffect, useState } from "react"
import {
	Sparkles,
	FileText,
	Wrench,
	Users,
	DollarSign,
	Activity,
	RefreshCw,
	BarChart3,
	TrendingUp,
	Clock,
	CheckCircle,
	XCircle,
	AlertCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { vscode } from "@/utils/vscode"
import { Button, Progress } from "@/components/ui"
import { SectionHeader } from "@/components/settings/SectionHeader"
import { Section } from "@/components/settings/Section"
import type { DarwinAnalytics, ExtensionMessage } from "@roo/ExtensionMessage"

import { DarwinMetricCard } from "./DarwinMetricCard"
import { DarwinActivityList } from "./DarwinActivityList"
import { DarwinHealthIndicator, type HealthStatus } from "./DarwinHealthIndicator"

export interface DarwinAnalyticsDashboardProps {
	/** Initial analytics data (optional) */
	initialData?: DarwinAnalytics
	/** Whether Darwin is enabled */
	darwinEnabled?: boolean
	/** Callback when refresh is requested */
	onRefresh?: () => void
	/** Additional className */
	className?: string
}

/**
 * Default empty analytics state
 */
const DEFAULT_ANALYTICS: DarwinAnalytics = {
	health: {
		status: "healthy",
		components: [],
		lastUpdate: new Date().toISOString(),
	},
	execution: {
		proposalsToday: 0,
		proposalsWeek: 0,
		proposalsTotal: 0,
		autoApproved: 0,
		manuallyApproved: 0,
		rejected: 0,
		successRate: 0,
		queueDepth: 0,
	},
	skills: {
		totalSkills: 0,
		synthesizedToday: 0,
		synthesizedWeek: 0,
		topSkills: [],
		avgSuccessRate: 0,
		synthesisMethodBreakdown: { template: 0, llm: 0, hybrid: 0 },
	},
	council: {
		reviewsTotal: 0,
		avgReviewTime: 0,
		decisions: { approved: 0, rejected: 0, deferred: 0 },
		multiAgentEnabled: false,
	},
	recentActivity: {
		proposals: [],
		skills: [],
		reviews: [],
	},
}

/**
 * Polling interval for analytics updates (30 seconds)
 */
const POLL_INTERVAL_MS = 30000

/**
 * DarwinAnalyticsDashboard - Main analytics dashboard component
 *
 * Displays:
 * - Health status section
 * - Execution metrics section
 * - Skills metrics section
 * - Council metrics section
 * - Cost tracking section (if LLM synthesis enabled)
 * - Recent activity section
 */
export const DarwinAnalyticsDashboard = memo(function DarwinAnalyticsDashboard({
	initialData,
	darwinEnabled = true,
	onRefresh,
	className,
}: DarwinAnalyticsDashboardProps) {
	const { t } = useAppTranslation()
	const [analytics, setAnalytics] = useState<DarwinAnalytics>(initialData ?? DEFAULT_ANALYTICS)
	const [loading, setLoading] = useState(!initialData)
	const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
	const [isPolling, setIsPolling] = useState(true)

	// Request analytics data from extension
	const fetchAnalytics = useCallback(() => {
		setLoading(true)
		vscode.postMessage({ type: "getDarwinAnalytics" })
	}, [])

	// Handle refresh button click
	const handleRefresh = useCallback(() => {
		fetchAnalytics()
		onRefresh?.()
	}, [fetchAnalytics, onRefresh])

	// Listen for analytics updates from extension
	useEffect(() => {
		const handleMessage = (event: MessageEvent<ExtensionMessage>) => {
			const message = event.data
			if (message.type === "darwinAnalyticsUpdate" && message.darwinAnalytics) {
				setAnalytics(message.darwinAnalytics)
				setLastRefresh(new Date())
				setLoading(false)
			}
		}

		window.addEventListener("message", handleMessage)
		return () => window.removeEventListener("message", handleMessage)
	}, [])

	// Initial fetch
	useEffect(() => {
		if (darwinEnabled) {
			fetchAnalytics()
		}
	}, [darwinEnabled, fetchAnalytics])

	// Polling for updates
	useEffect(() => {
		if (!darwinEnabled || !isPolling) return

		const interval = setInterval(() => {
			vscode.postMessage({ type: "getDarwinAnalytics" })
		}, POLL_INTERVAL_MS)

		return () => clearInterval(interval)
	}, [darwinEnabled, isPolling])

	// Stop polling when component is not visible
	useEffect(() => {
		const handleVisibility = () => {
			setIsPolling(!document.hidden)
		}

		document.addEventListener("visibilitychange", handleVisibility)
		return () => document.removeEventListener("visibilitychange", handleVisibility)
	}, [])

	// Show disabled state if Darwin is not enabled
	if (!darwinEnabled) {
		return (
			<div className={cn("p-6 text-center", className)}>
				<Sparkles className="w-12 h-12 mx-auto text-vscode-descriptionForeground mb-4" />
				<h3 className="text-lg font-medium text-vscode-foreground mb-2">
					{t("darwin:analytics.disabled.title", { defaultValue: "Darwin is Disabled" })}
				</h3>
				<p className="text-sm text-vscode-descriptionForeground max-w-md mx-auto">
					{t("darwin:analytics.disabled.description", {
						defaultValue: "Enable Darwin in Settings to start tracking evolution metrics and analytics.",
					})}
				</p>
			</div>
		)
	}

	const { health, execution, skills, council, costs, recentActivity } = analytics

	// Calculate totals for charts
	const totalDecisions = council.decisions.approved + council.decisions.rejected + council.decisions.deferred
	const approvalRate = totalDecisions > 0 ? (council.decisions.approved / totalDecisions) * 100 : 0

	return (
		<div className={cn("space-y-6", className)}>
			{/* Header */}
			<SectionHeader
				description={t("darwin:analytics.description", {
					defaultValue: "Real-time metrics and insights from the Darwin evolution system.",
				})}>
				<div className="flex items-center justify-between w-full">
					<div className="flex items-center gap-2">
						<BarChart3 className="w-4" />
						<span>{t("darwin:analytics.title", { defaultValue: "Analytics Dashboard" })}</span>
					</div>
					<div className="flex items-center gap-3">
						{lastRefresh && (
							<span className="text-xs text-vscode-descriptionForeground">
								{t("darwin:analytics.lastUpdated", { defaultValue: "Updated" })}{" "}
								{lastRefresh.toLocaleTimeString()}
							</span>
						)}
						<Button variant="ghost" size="sm" onClick={handleRefresh} disabled={loading} className="gap-2">
							<RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
							{t("darwin:analytics.refresh", { defaultValue: "Refresh" })}
						</Button>
					</div>
				</div>
			</SectionHeader>

			{/* Health Status Section */}
			<Section>
				<div className="flex items-center justify-between mb-4">
					<h3 className="text-sm font-medium text-vscode-foreground">
						{t("darwin:analytics.health.title", { defaultValue: "System Health" })}
					</h3>
					<DarwinHealthIndicator
						status={health.status as HealthStatus}
						components={health.components}
						lastUpdate={health.lastUpdate}
						loading={loading}
					/>
				</div>

				{/* Component status grid */}
				{health.components.length > 0 && (
					<div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
						{health.components.map((component) => (
							<div
								key={component.name}
								className="flex items-center gap-2 p-2 rounded-md bg-vscode-input-background">
								{component.status === "active" ? (
									<CheckCircle className="w-3 h-3 text-green-500" />
								) : component.status === "error" ? (
									<XCircle className="w-3 h-3 text-red-500" />
								) : (
									<AlertCircle className="w-3 h-3 text-yellow-500" />
								)}
								<span className="text-xs text-vscode-foreground">{component.name}</span>
							</div>
						))}
					</div>
				)}
			</Section>

			{/* Execution Metrics Section */}
			<Section>
				<h3 className="text-sm font-medium text-vscode-foreground mb-4">
					{t("darwin:analytics.execution.title", { defaultValue: "Execution Metrics" })}
				</h3>
				<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
					<DarwinMetricCard
						title={t("darwin:analytics.execution.proposalsToday", { defaultValue: "Today" })}
						value={execution.proposalsToday}
						icon={FileText}
						loading={loading}
						subtitle="proposals generated"
					/>
					<DarwinMetricCard
						title={t("darwin:analytics.execution.proposalsWeek", { defaultValue: "This Week" })}
						value={execution.proposalsWeek}
						icon={FileText}
						loading={loading}
						subtitle="proposals generated"
					/>
					<DarwinMetricCard
						title={t("darwin:analytics.execution.successRate", { defaultValue: "Success Rate" })}
						value={execution.successRate}
						valueType="percentage"
						icon={TrendingUp}
						trend={execution.successRate >= 80 ? "up" : execution.successRate >= 50 ? "neutral" : "down"}
						loading={loading}
					/>
					<DarwinMetricCard
						title={t("darwin:analytics.execution.queueDepth", { defaultValue: "Queue Depth" })}
						value={execution.queueDepth}
						icon={Activity}
						loading={loading}
						subtitle="pending proposals"
					/>
				</div>

				{/* Approval breakdown */}
				<div className="mt-4 grid grid-cols-3 gap-4">
					<div className="p-3 rounded-md bg-vscode-input-background">
						<div className="flex items-center gap-2 mb-1">
							<CheckCircle className="w-4 h-4 text-green-500" />
							<span className="text-xs text-vscode-descriptionForeground">Auto-approved</span>
						</div>
						<span className="text-lg font-semibold text-vscode-foreground">{execution.autoApproved}</span>
					</div>
					<div className="p-3 rounded-md bg-vscode-input-background">
						<div className="flex items-center gap-2 mb-1">
							<CheckCircle className="w-4 h-4 text-blue-500" />
							<span className="text-xs text-vscode-descriptionForeground">Manually approved</span>
						</div>
						<span className="text-lg font-semibold text-vscode-foreground">
							{execution.manuallyApproved}
						</span>
					</div>
					<div className="p-3 rounded-md bg-vscode-input-background">
						<div className="flex items-center gap-2 mb-1">
							<XCircle className="w-4 h-4 text-red-500" />
							<span className="text-xs text-vscode-descriptionForeground">Rejected</span>
						</div>
						<span className="text-lg font-semibold text-vscode-foreground">{execution.rejected}</span>
					</div>
				</div>
			</Section>

			{/* Skills Metrics Section */}
			<Section>
				<h3 className="text-sm font-medium text-vscode-foreground mb-4">
					{t("darwin:analytics.skills.title", { defaultValue: "Skills Library" })}
				</h3>
				<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
					<DarwinMetricCard
						title={t("darwin:analytics.skills.total", { defaultValue: "Total Skills" })}
						value={skills.totalSkills}
						icon={Wrench}
						loading={loading}
					/>
					<DarwinMetricCard
						title={t("darwin:analytics.skills.synthesizedToday", { defaultValue: "Synthesized Today" })}
						value={skills.synthesizedToday}
						icon={Wrench}
						loading={loading}
					/>
					<DarwinMetricCard
						title={t("darwin:analytics.skills.synthesizedWeek", { defaultValue: "This Week" })}
						value={skills.synthesizedWeek}
						icon={Wrench}
						loading={loading}
					/>
					<DarwinMetricCard
						title={t("darwin:analytics.skills.avgSuccessRate", { defaultValue: "Avg Success Rate" })}
						value={skills.avgSuccessRate}
						valueType="percentage"
						icon={TrendingUp}
						loading={loading}
					/>
				</div>

				{/* Synthesis method breakdown */}
				<div className="mt-4">
					<h4 className="text-xs text-vscode-descriptionForeground mb-2">Synthesis Method Breakdown</h4>
					<div className="flex items-center gap-4">
						<div className="flex-1">
							<div className="flex justify-between text-xs mb-1">
								<span className="text-vscode-descriptionForeground">Template</span>
								<span className="text-vscode-foreground">
									{skills.synthesisMethodBreakdown.template}
								</span>
							</div>
							<Progress
								value={
									skills.totalSkills > 0
										? (skills.synthesisMethodBreakdown.template / skills.totalSkills) * 100
										: 0
								}
								className="h-2"
							/>
						</div>
						<div className="flex-1">
							<div className="flex justify-between text-xs mb-1">
								<span className="text-vscode-descriptionForeground">LLM</span>
								<span className="text-vscode-foreground">{skills.synthesisMethodBreakdown.llm}</span>
							</div>
							<Progress
								value={
									skills.totalSkills > 0
										? (skills.synthesisMethodBreakdown.llm / skills.totalSkills) * 100
										: 0
								}
								className="h-2"
							/>
						</div>
						<div className="flex-1">
							<div className="flex justify-between text-xs mb-1">
								<span className="text-vscode-descriptionForeground">Hybrid</span>
								<span className="text-vscode-foreground">{skills.synthesisMethodBreakdown.hybrid}</span>
							</div>
							<Progress
								value={
									skills.totalSkills > 0
										? (skills.synthesisMethodBreakdown.hybrid / skills.totalSkills) * 100
										: 0
								}
								className="h-2"
							/>
						</div>
					</div>
				</div>

				{/* Top skills */}
				{skills.topSkills.length > 0 && (
					<div className="mt-4">
						<h4 className="text-xs text-vscode-descriptionForeground mb-2">
							{t("darwin:analytics.skills.topSkills", { defaultValue: "Most Used Skills" })}
						</h4>
						<div className="space-y-2">
							{skills.topSkills.slice(0, 5).map((skill, index) => (
								<div
									key={skill.id}
									className="flex items-center justify-between p-2 rounded-md bg-vscode-input-background">
									<div className="flex items-center gap-2">
										<span className="text-xs text-vscode-descriptionForeground w-4">
											#{index + 1}
										</span>
										<span className="text-sm text-vscode-foreground">{skill.name}</span>
									</div>
									<span className="text-xs text-vscode-descriptionForeground">
										{skill.usageCount} uses
									</span>
								</div>
							))}
						</div>
					</div>
				)}
			</Section>

			{/* Council Metrics Section */}
			<Section>
				<h3 className="text-sm font-medium text-vscode-foreground mb-4">
					{t("darwin:analytics.council.title", { defaultValue: "Council Reviews" })}
				</h3>
				<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
					<DarwinMetricCard
						title={t("darwin:analytics.council.totalReviews", { defaultValue: "Total Reviews" })}
						value={council.reviewsTotal}
						icon={Users}
						loading={loading}
					/>
					<DarwinMetricCard
						title={t("darwin:analytics.council.avgTime", { defaultValue: "Avg Review Time" })}
						value={council.avgReviewTime}
						valueType="time"
						icon={Clock}
						loading={loading}
					/>
					<DarwinMetricCard
						title={t("darwin:analytics.council.approvalRate", { defaultValue: "Approval Rate" })}
						value={approvalRate}
						valueType="percentage"
						icon={CheckCircle}
						loading={loading}
					/>
					<DarwinMetricCard
						title={t("darwin:analytics.council.multiAgent", { defaultValue: "Multi-Agent" })}
						value={council.multiAgentEnabled ? "Enabled" : "Disabled"}
						icon={Users}
						loading={loading}
					/>
				</div>

				{/* Decision breakdown */}
				{totalDecisions > 0 && (
					<div className="mt-4 grid grid-cols-3 gap-4">
						<div className="p-3 rounded-md bg-green-500/10">
							<div className="text-xs text-green-500 mb-1">Approved</div>
							<div className="text-lg font-semibold text-green-500">{council.decisions.approved}</div>
						</div>
						<div className="p-3 rounded-md bg-red-500/10">
							<div className="text-xs text-red-500 mb-1">Rejected</div>
							<div className="text-lg font-semibold text-red-500">{council.decisions.rejected}</div>
						</div>
						<div className="p-3 rounded-md bg-yellow-500/10">
							<div className="text-xs text-yellow-500 mb-1">Deferred</div>
							<div className="text-lg font-semibold text-yellow-500">{council.decisions.deferred}</div>
						</div>
					</div>
				)}
			</Section>

			{/* Cost Tracking Section (if LLM synthesis enabled) */}
			{costs && (
				<Section>
					<h3 className="text-sm font-medium text-vscode-foreground mb-4">
						{t("darwin:analytics.costs.title", { defaultValue: "Cost Tracking" })}
					</h3>
					<div className="grid grid-cols-2 md:grid-cols-3 gap-4">
						<DarwinMetricCard
							title={t("darwin:analytics.costs.tokensToday", { defaultValue: "Tokens Today" })}
							value={costs.tokensToday}
							icon={Activity}
							loading={loading}
						/>
						<DarwinMetricCard
							title={t("darwin:analytics.costs.tokensWeek", { defaultValue: "Tokens This Week" })}
							value={costs.tokensWeek}
							icon={Activity}
							loading={loading}
						/>
						<DarwinMetricCard
							title={t("darwin:analytics.costs.estimatedCost", { defaultValue: "Estimated Cost" })}
							value={costs.estimatedCost}
							valueType="currency"
							icon={DollarSign}
							loading={loading}
						/>
					</div>
				</Section>
			)}

			{/* Recent Activity Section */}
			<Section>
				<h3 className="text-sm font-medium text-vscode-foreground mb-4">
					{t("darwin:analytics.recentActivity.title", { defaultValue: "Recent Activity" })}
				</h3>
				<DarwinActivityList
					proposals={recentActivity.proposals}
					skills={recentActivity.skills}
					reviews={recentActivity.reviews}
					maxItems={10}
					loading={loading}
				/>
			</Section>
		</div>
	)
})

export default DarwinAnalyticsDashboard
