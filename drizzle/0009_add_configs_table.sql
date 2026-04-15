CREATE TABLE `configs` (
  `id` text PRIMARY KEY NOT NULL,
  `team_id` text NOT NULL,
  `key` text NOT NULL,
  `value` text NOT NULL,
  `updated_by` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE UNIQUE INDEX `configs_team_key` ON `configs` (`team_id`, `key`);
