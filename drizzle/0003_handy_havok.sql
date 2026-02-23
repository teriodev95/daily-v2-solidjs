CREATE TABLE `story_completions` (
	`id` text PRIMARY KEY NOT NULL,
	`story_id` text NOT NULL,
	`user_id` text NOT NULL,
	`completion_date` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`story_id`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `stories` ADD `recurrence_days` text;--> statement-breakpoint
ALTER TABLE `week_goals` ADD `is_closed` integer DEFAULT false NOT NULL;