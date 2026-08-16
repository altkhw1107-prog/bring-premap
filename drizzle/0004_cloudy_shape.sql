ALTER TABLE `capture_sessions` ADD `root_session_id` text;--> statement-breakpoint
ALTER TABLE `capture_sessions` ADD `route_number` integer DEFAULT 1 NOT NULL;