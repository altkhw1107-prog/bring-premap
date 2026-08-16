CREATE TABLE `capture_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`stage` integer NOT NULL,
	`category` text NOT NULL,
	`slope_angle` real,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_capture_observations_session_id` ON `capture_observations` (`session_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_capture_observations_session_stage_category` ON `capture_observations` (`session_id`,`stage`,`category`);