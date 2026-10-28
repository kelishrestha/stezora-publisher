CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`publication_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	FOREIGN KEY (`publication_id`) REFERENCES `publications`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_publication_slug_unique` ON `tags` (`publication_id`,`slug`);