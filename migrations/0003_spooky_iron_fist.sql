PRAGMA foreign_keys=OFF;--> statement-breakpoint
DROP TABLE `categories`;--> statement-breakpoint
CREATE TABLE `__new_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`publication_id` text NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`excerpt` text,
	`content` text NOT NULL,
	`content_markdown` text,
	`seo_title` text,
	`seo_description` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`published_at` text,
	`updated_at` text,
	`canonical_url` text,
	`blogger_blog_id` text,
	`blogger_post_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`publication_id`) REFERENCES `publications`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_posts`("id", "publication_id", "title", "slug", "excerpt", "content", "content_markdown", "seo_title", "seo_description", "status", "published_at", "updated_at", "canonical_url", "blogger_blog_id", "blogger_post_id", "created_at") SELECT "id", "publication_id", "title", "slug", "excerpt", "content", "content_markdown", "seo_title", "seo_description", "status", "published_at", "updated_at", "canonical_url", "blogger_blog_id", "blogger_post_id", "created_at" FROM `posts`;--> statement-breakpoint
DROP TABLE `posts`;--> statement-breakpoint
ALTER TABLE `__new_posts` RENAME TO `posts`;--> statement-breakpoint
CREATE INDEX `idx_posts_publication_status` ON `posts` (`publication_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `posts_publication_slug_unique` ON `posts` (`publication_id`,`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `posts_blogger_unique` ON `posts` (`blogger_blog_id`,`blogger_post_id`);--> statement-breakpoint
-- Media: reset. Rows are re-created by the backfill/import (media is now
-- required to belong to a post and a publication).
DELETE FROM `media`;--> statement-breakpoint
DROP TABLE `media`;--> statement-breakpoint
CREATE TABLE `media` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`publication_id` text NOT NULL,
	`r2_key` text NOT NULL,
	`filename` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`publication_id`) REFERENCES `publications`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_r2_key_unique` ON `media` (`r2_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `media_post_id_unique` ON `media` (`post_id`);--> statement-breakpoint
CREATE INDEX `idx_media_publication` ON `media` (`publication_id`);--> statement-breakpoint
-- Tags: per-publication now. Reset rows (links and tags) and drop the global
-- uniqueness so (publication_id, slug) becomes the identity.
DELETE FROM `post_tags`;--> statement-breakpoint
DROP TABLE `tags`;--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`publication_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	FOREIGN KEY (`publication_id`) REFERENCES `publications`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_publication_slug_unique` ON `tags` (`publication_id`,`slug`);--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
