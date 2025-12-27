import { sqliteTable, text, integer, real, blob, index } from "drizzle-orm/sqlite-core"
import { relations } from "drizzle-orm"

// Traces Table
export const traces = sqliteTable(
	"traces",
	{
		id: text("id").primaryKey(),
		timestamp: integer("timestamp").notNull(),
		event: text("event").notNull(),
		toolId: text("tool_id"),
		status: text("status", { enum: ["success", "error"] }).notNull(),
		duration: integer("duration"),
		error: text("error"),
		context: text("context", { mode: "json" }),
		metadata: text("metadata", { mode: "json" }),
		createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
	},
	(table) => ({
		timestampIdx: index("traces_timestamp_idx").on(table.timestamp),
		eventIdx: index("traces_event_idx").on(table.event),
		statusIdx: index("traces_status_idx").on(table.status),
	}),
)

// Proposals Table
export const proposals = sqliteTable(
	"proposals",
	{
		id: text("id").primaryKey(),
		type: text("type").notNull(),
		title: text("title").notNull(),
		description: text("description").notNull(),
		payload: text("payload", { mode: "json" }).notNull(),
		risk: text("risk", { enum: ["low", "medium", "high"] }).notNull(),
		status: text("status", {
			enum: ["pending", "approved", "rejected", "applied", "failed", "rolled_back"],
		}).notNull(),
		sourceSignalId: text("source_signal_id"),
		reviewedBy: text("reviewed_by"),
		reviewNotes: text("review_notes"),
		rollbackData: text("rollback_data", { mode: "json" }),
		createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
	},
	(table) => ({
		statusIdx: index("proposals_status_idx").on(table.status),
		createdAtIdx: index("proposals_created_at_idx").on(table.createdAt),
		riskIdx: index("proposals_risk_idx").on(table.risk),
	}),
)

// Skills Table
export const skills = sqliteTable(
	"skills",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		description: text("description"),
		code: text("code"),
		language: text("language", { enum: ["typescript", "javascript", "python", "bash"] }).notNull(),
		tags: text("tags", { mode: "json" }),
		usageCount: integer("usage_count").default(0),
		successRate: real("success_rate").default(0),
		lastUsed: integer("last_used", { mode: "timestamp" }),
		createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
	},
	(table) => ({
		usageCountIdx: index("skills_usage_count_idx").on(table.usageCount),
		successRateIdx: index("skills_success_rate_idx").on(table.successRate),
		lastUsedIdx: index("skills_last_used_idx").on(table.lastUsed),
	}),
)

// CouncilVotes Table
export const councilVotes = sqliteTable(
	"council_votes",
	{
		id: text("id").primaryKey(),
		proposalId: text("proposal_id")
			.references(() => proposals.id)
			.notNull(),
		agent: text("agent", { enum: ["analyst", "reviewer", "security", "performance"] }).notNull(),
		vote: text("vote", { enum: ["approve", "reject", "abstain"] }).notNull(),
		confidence: real("confidence").notNull(),
		reasoning: text("reasoning"),
		createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
	},
	(table) => ({
		proposalIdIdx: index("council_votes_proposal_id_idx").on(table.proposalId),
	}),
)

// ExecutionHistory Table
export const executionHistory = sqliteTable("execution_history", {
	id: text("id").primaryKey(),
	proposalId: text("proposal_id")
		.references(() => proposals.id)
		.notNull(),
	skillId: text("skill_id").references(() => skills.id),
	status: text("status", { enum: ["pending", "running", "success", "failed"] }).notNull(),
	startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
	completedAt: integer("completed_at", { mode: "timestamp" }),
	result: text("result", { mode: "json" }),
	error: text("error"),
})

// Relations
export const proposalsRelations = relations(proposals, ({ many }) => ({
	votes: many(councilVotes),
	executions: many(executionHistory),
}))

export const councilVotesRelations = relations(councilVotes, ({ one }) => ({
	proposal: one(proposals, {
		fields: [councilVotes.proposalId],
		references: [proposals.id],
	}),
}))

export const executionHistoryRelations = relations(executionHistory, ({ one }) => ({
	proposal: one(proposals, {
		fields: [executionHistory.proposalId],
		references: [proposals.id],
	}),
	skill: one(skills, {
		fields: [executionHistory.skillId],
		references: [skills.id],
	}),
}))

export const skillsRelations = relations(skills, ({ many }) => ({
	executions: many(executionHistory),
}))
