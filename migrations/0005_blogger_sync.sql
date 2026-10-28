CREATE TABLE `blogger_sync` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`blogger_blog_id` text NOT NULL,
	`blogger_post_id` text NOT NULL,
	`status` text NOT NULL,
	`last_synced_at` text,
	`error` text,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `blogger_sync_post_unique` ON `blogger_sync` (`post_id`);