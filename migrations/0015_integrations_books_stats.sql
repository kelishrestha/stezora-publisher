CREATE TABLE `blogger_stats` (
	`publication_id` text PRIMARY KEY NOT NULL,
	`blog_id` text NOT NULL,
	`views_all` integer,
	`views_30d` integer,
	`views_7d` integer,
	`fetched_at` text NOT NULL,
	FOREIGN KEY (`publication_id`) REFERENCES `publications`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `books` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text DEFAULT 'neobook' NOT NULL,
	`neobook_token` text,
	`title` text NOT NULL,
	`blurb` text,
	`category` text,
	`language` text,
	`price` text,
	`cover_url` text,
	`link_url` text,
	`chapters` integer,
	`read_time` integer,
	`views` integer,
	`likes` integer,
	`comments` integer,
	`bookmarks` integer,
	`published_at` text,
	`updated_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `books_source_token_unique` ON `books` (`source`,`neobook_token`);--> statement-breakpoint
ALTER TABLE `posts` ADD `neobook_url` text;--> statement-breakpoint
ALTER TABLE `posts` ADD `source` text DEFAULT 'app' NOT NULL;--> statement-breakpoint
ALTER TABLE `posts` ADD `neobook_views` integer;--> statement-breakpoint
ALTER TABLE `posts` ADD `neobook_likes` integer;--> statement-breakpoint
ALTER TABLE `posts` ADD `neobook_comments` integer;--> statement-breakpoint
UPDATE `posts` SET `source` = 'blogger' WHERE `blogger_post_id` IS NOT NULL;