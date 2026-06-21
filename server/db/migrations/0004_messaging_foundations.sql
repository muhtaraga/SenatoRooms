ALTER TABLE `users` ADD `deleted_at` integer;
--> statement-breakpoint
ALTER TABLE `conversation_members` ADD `left_at` integer;
--> statement-breakpoint
ALTER TABLE `messages` ADD `reply_to_message_id` text REFERENCES `messages`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
CREATE TABLE `user_settings` (
  `user_id` text PRIMARY KEY NOT NULL,
  `theme` text DEFAULT 'light' NOT NULL,
  `reduce_motion` integer DEFAULT false NOT NULL,
  `read_receipts` integer DEFAULT true NOT NULL,
  `show_online_status` integer DEFAULT true NOT NULL,
  `sound_enabled` integer DEFAULT true NOT NULL,
  `toasts_enabled` integer DEFAULT true NOT NULL,
  `badges_enabled` integer DEFAULT true NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `user_settings` (`user_id`, `updated_at`)
SELECT `id`, `created_at` FROM `users`;
--> statement-breakpoint
CREATE TABLE `conversation_preferences` (
  `id` text PRIMARY KEY NOT NULL,
  `conversation_id` text NOT NULL,
  `user_id` text NOT NULL,
  `notification_level` text DEFAULT 'all' NOT NULL,
  `muted_until` integer,
  `archived_at` integer,
  `cleared_at` integer,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conversation_preferences_user_conversation_idx` ON `conversation_preferences` (`user_id`,`conversation_id`);
--> statement-breakpoint
CREATE INDEX `conversation_preferences_user_archive_idx` ON `conversation_preferences` (`user_id`,`archived_at`);
--> statement-breakpoint
CREATE TABLE `conversation_read_states` (
  `id` text PRIMARY KEY NOT NULL,
  `conversation_id` text NOT NULL,
  `user_id` text NOT NULL,
  `last_read_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `conversation_read_states` (`id`, `conversation_id`, `user_id`, `last_read_at`, `updated_at`)
SELECT lower(hex(randomblob(16))), cm.`conversation_id`, cm.`user_id`, c.`created_at`, c.`created_at`
FROM `conversation_members` cm
JOIN `conversations` c ON c.`id` = cm.`conversation_id`;
--> statement-breakpoint
CREATE UNIQUE INDEX `conversation_read_states_user_conversation_idx` ON `conversation_read_states` (`user_id`,`conversation_id`);
--> statement-breakpoint
CREATE TABLE `user_blocks` (
  `id` text PRIMARY KEY NOT NULL,
  `blocker_id` text NOT NULL,
  `blocked_user_id` text NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`blocker_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`blocked_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_blocks_unique_idx` ON `user_blocks` (`blocker_id`,`blocked_user_id`);
--> statement-breakpoint
CREATE INDEX `user_blocks_blocked_user_idx` ON `user_blocks` (`blocked_user_id`);
--> statement-breakpoint
CREATE TABLE `message_reactions` (
  `id` text PRIMARY KEY NOT NULL,
  `message_id` text NOT NULL,
  `user_id` text NOT NULL,
  `emoji` text NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `message_reactions_unique_idx` ON `message_reactions` (`message_id`,`user_id`,`emoji`);
--> statement-breakpoint
CREATE INDEX `message_reactions_message_idx` ON `message_reactions` (`message_id`);
