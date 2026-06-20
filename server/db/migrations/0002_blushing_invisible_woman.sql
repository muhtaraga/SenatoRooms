ALTER TABLE `conversations` ADD `last_activity_at` integer;--> statement-breakpoint
UPDATE `conversations` SET `last_activity_at` = `created_at` WHERE `last_activity_at` IS NULL;--> statement-breakpoint
CREATE INDEX `conversations_last_activity_idx` ON `conversations` (`last_activity_at`);
