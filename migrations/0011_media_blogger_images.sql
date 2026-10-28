PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_media` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`publication_id` text NOT NULL,
	`r2_key` text,
	`source_url` text,
	`filename` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`publication_id`) REFERENCES `publications`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
-- source_url is new; existing rows are R2 uploads with no external source.
INSERT INTO `__new_media`("id", "post_id", "publication_id", "r2_key", "source_url", "filename", "mime_type", "size", "created_at") SELECT "id", "post_id", "publication_id", "r2_key", NULL, "filename", "mime_type", "size", "created_at" FROM `media`;--> statement-breakpoint
DROP TABLE `media`;--> statement-breakpoint
ALTER TABLE `__new_media` RENAME TO `media`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `media_r2_key_unique` ON `media` (`r2_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `media_post_source_unique` ON `media` (`post_id`,`source_url`);--> statement-breakpoint
CREATE INDEX `idx_media_post` ON `media` (`post_id`);--> statement-breakpoint
CREATE INDEX `idx_media_publication` ON `media` (`publication_id`);