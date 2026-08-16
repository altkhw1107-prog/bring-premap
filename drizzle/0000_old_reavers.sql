CREATE TABLE `capture_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`object_key` text NOT NULL,
	`stage` integer NOT NULL,
	`file_name` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`slope_angle` real,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_capture_photos_session_id` ON `capture_photos` (`session_id`);--> statement-breakpoint
CREATE TABLE `capture_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`facility_name` text NOT NULL,
	`facility_type` text NOT NULL,
	`start_point` text NOT NULL,
	`end_point` text NOT NULL,
	`uses_elevator` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'waiting' NOT NULL,
	`device_count` integer DEFAULT 0 NOT NULL,
	`current_stage` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
