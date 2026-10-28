-- posts <-> media reference each other (media.post_id, posts.featured_image_id).
-- SQLite resolves foreign keys lazily, so the reference to media here is valid
-- even though media is created in the next migration (0002_media).
CREATE TABLE `posts` (
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
	`featured_image_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`publication_id`) REFERENCES `publications`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`featured_image_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_posts_publication_status` ON `posts` (`publication_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `posts_publication_slug_unique` ON `posts` (`publication_id`,`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `posts_blogger_unique` ON `posts` (`blogger_blog_id`,`blogger_post_id`);