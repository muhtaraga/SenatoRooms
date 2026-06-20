PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_senate_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`senate_id` text NOT NULL,
	`invited_user_id` text NOT NULL,
	`invited_by_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`senate_id`) REFERENCES `senates`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invited_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invited_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_senate_invites`("id", "senate_id", "invited_user_id", "invited_by_id", "status", "created_at") SELECT "id", "senate_id", "invited_user_id", "invited_by_id", "status", "created_at" FROM `senate_invites`;--> statement-breakpoint
DROP TABLE `senate_invites`;--> statement-breakpoint
ALTER TABLE `__new_senate_invites` RENAME TO `senate_invites`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `senate_invites_unique_idx` ON `senate_invites` (`senate_id`,`invited_user_id`);--> statement-breakpoint
CREATE INDEX `senate_invites_user_status_idx` ON `senate_invites` (`invited_user_id`,`status`);