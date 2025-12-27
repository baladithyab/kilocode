ALTER TABLE `proposals` ADD `title` text NOT NULL;--> statement-breakpoint
ALTER TABLE `proposals` ADD `description` text NOT NULL;--> statement-breakpoint
ALTER TABLE `proposals` ADD `payload` text NOT NULL;--> statement-breakpoint
ALTER TABLE `proposals` ADD `source_signal_id` text;--> statement-breakpoint
ALTER TABLE `proposals` ADD `reviewed_by` text;--> statement-breakpoint
ALTER TABLE `proposals` ADD `review_notes` text;--> statement-breakpoint
ALTER TABLE `proposals` ADD `rollback_data` text;--> statement-breakpoint
CREATE INDEX `proposals_status_idx` ON `proposals` (`status`);--> statement-breakpoint
CREATE INDEX `proposals_created_at_idx` ON `proposals` (`created_at`);--> statement-breakpoint
CREATE INDEX `proposals_risk_idx` ON `proposals` (`risk`);--> statement-breakpoint
ALTER TABLE `proposals` DROP COLUMN `intent`;--> statement-breakpoint
ALTER TABLE `proposals` DROP COLUMN `target_files`;--> statement-breakpoint
ALTER TABLE `proposals` DROP COLUMN `changes`;--> statement-breakpoint
ALTER TABLE `proposals` DROP COLUMN `reasoning`;--> statement-breakpoint
CREATE INDEX `council_votes_proposal_id_idx` ON `council_votes` (`proposal_id`);--> statement-breakpoint
CREATE INDEX `skills_usage_count_idx` ON `skills` (`usage_count`);--> statement-breakpoint
CREATE INDEX `skills_success_rate_idx` ON `skills` (`success_rate`);--> statement-breakpoint
CREATE INDEX `skills_last_used_idx` ON `skills` (`last_used`);--> statement-breakpoint
CREATE INDEX `traces_timestamp_idx` ON `traces` (`timestamp`);--> statement-breakpoint
CREATE INDEX `traces_event_idx` ON `traces` (`event`);--> statement-breakpoint
CREATE INDEX `traces_status_idx` ON `traces` (`status`);