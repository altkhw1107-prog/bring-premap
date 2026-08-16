ALTER TABLE `capture_photos` ADD `ai_verified` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `capture_photos` ADD `ai_detected_category` text;--> statement-breakpoint
ALTER TABLE `capture_photos` ADD `ai_confidence` real;--> statement-breakpoint
ALTER TABLE `capture_photos` ADD `ai_reason` text;--> statement-breakpoint
ALTER TABLE `capture_photos` ADD `supabase_path` text;