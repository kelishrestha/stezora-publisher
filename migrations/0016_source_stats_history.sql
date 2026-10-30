CREATE TABLE `source_stats` (
	`captured_at` text PRIMARY KEY NOT NULL,
	`app_views` integer DEFAULT 0 NOT NULL,
	`blogger_views` integer DEFAULT 0 NOT NULL,
	`neobook_views` integer DEFAULT 0 NOT NULL
);
