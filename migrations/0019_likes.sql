CREATE TABLE `likes` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`visitor_id` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `likes_entity_visitor_unique` ON `likes` (`entity_type`,`entity_id`,`visitor_id`);--> statement-breakpoint
CREATE INDEX `idx_likes_entity` ON `likes` (`entity_type`,`entity_id`);