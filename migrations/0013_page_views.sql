CREATE TABLE `page_views` (
	`id` text PRIMARY KEY NOT NULL,
	`path` text NOT NULL,
	`publication_slug` text,
	`post_slug` text,
	`referrer_host` text,
	`country` text,
	`region` text,
	`city` text,
	`continent` text,
	`device` text,
	`visitor_hash` text NOT NULL,
	`visitor_id` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_page_views_created_at` ON `page_views` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_page_views_post` ON `page_views` (`publication_slug`,`post_slug`);--> statement-breakpoint
CREATE INDEX `idx_page_views_country` ON `page_views` (`country`);