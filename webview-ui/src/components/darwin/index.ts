// kilocode_change - new file for Darwin components exports

// Main dashboard component
export { DarwinAnalyticsDashboard, type DarwinAnalyticsDashboardProps } from "./DarwinAnalyticsDashboard"

// Metric card component
export { DarwinMetricCard, type MetricCardProps, type MetricValueType, type TrendDirection } from "./DarwinMetricCard"

// Activity list component
export {
	DarwinActivityList,
	type DarwinActivityListProps,
	type ActivityItem,
	type ActivityType,
} from "./DarwinActivityList"

// Health indicator component
export {
	DarwinHealthIndicator,
	type DarwinHealthIndicatorProps,
	type HealthStatus,
	type HealthComponent,
} from "./DarwinHealthIndicator"
