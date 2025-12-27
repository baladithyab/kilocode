CREATE TABLE `council_votes` (
	`id` text PRIMARY KEY NOT NULL,
	`proposal_id` text NOT NULL,
	`agent` text NOT NULL,
	`vote` text NOT NULL,
	`confidence` real NOT NULL,
	`reasoning` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`proposal_id`) REFERENCES `proposals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `execution_history` (
	`id` text PRIMARY KEY NOT NULL,
	`proposal_id` text NOT NULL,
	`skill_id` text,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`result` text,
	`error` text,
	FOREIGN KEY (`proposal_id`) REFERENCES `proposals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`intent` text NOT NULL,
	`target_files` text,
	`changes` text,
	`risk` text NOT NULL,
	`status` text NOT NULL,
	`reasoning` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `skills` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`code` text,
	`language` text NOT NULL,
	`tags` text,
	`usage_count` integer DEFAULT 0,
	`success_rate` real DEFAULT 0,
	`last_used` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `traces` (
	`id` text PRIMARY KEY NOT NULL,
	`timestamp` integer NOT NULL,
	`event` text NOT NULL,
	`tool_id` text,
	`status` text NOT NULL,
	`duration` integer,
	`error` text,
	`context` text,
	`metadata` text,
	`created_at` integer NOT NULL
);
