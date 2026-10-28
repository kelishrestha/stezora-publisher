import { index, integer, primaryKey, sqliteTable, text, uniqueIndex, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core';

export * from './auth-schema';

export const publications = sqliteTable(
	'publications',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		slug: text('slug').notNull(),
		description: text('description'),
		accent: text('accent'),
		blogger_blog_id: text('blogger_blog_id'),
		blogger_url: text('blogger_url'),
		created_at: text('created_at').notNull(),
	},
	(table) => [uniqueIndex('publications_slug_unique').on(table.slug)]
);

export const posts = sqliteTable(
	'posts',
	{
		id: text('id').primaryKey(),
		publication_id: text('publication_id')
			.notNull()
			.references(() => publications.id),
		title: text('title').notNull(),
		slug: text('slug').notNull(),
		excerpt: text('excerpt'),
		content: text('content').notNull(),
		content_markdown: text('content_markdown'),
		seo_title: text('seo_title'),
		seo_description: text('seo_description'),
		status: text('status').notNull().default('draft'),
		published_at: text('published_at'),
		updated_at: text('updated_at'),
		canonical_url: text('canonical_url'),
		blogger_blog_id: text('blogger_blog_id'),
		blogger_post_id: text('blogger_post_id'),
		// AnySQLiteColumn breaks the posts ↔ media type cycle (media.post_id
		// references posts; this column references media).
		featured_image_id: text('featured_image_id').references((): AnySQLiteColumn => media.id),
		created_at: text('created_at').notNull(),
	},
	(table) => [
		index('idx_posts_publication_status').on(table.publication_id, table.status),
		uniqueIndex('posts_publication_slug_unique').on(table.publication_id, table.slug),
		uniqueIndex('posts_blogger_unique').on(table.blogger_blog_id, table.blogger_post_id),
	]
);

export const tags = sqliteTable(
	'tags',
	{
		id: text('id').primaryKey(),
		publication_id: text('publication_id')
			.notNull()
			.references(() => publications.id),
		name: text('name').notNull(),
		slug: text('slug').notNull(),
		// Nullable: tags imported before the column existed carry the backfill
		// date instead of a real creation date.
		created_at: text('created_at'),
	},
	(table) => [uniqueIndex('tags_publication_slug_unique').on(table.publication_id, table.slug)]
);

export const postTags = sqliteTable(
	'post_tags',
	{
		post_id: text('post_id')
			.notNull()
			.references(() => posts.id),
		tag_id: text('tag_id')
			.notNull()
			.references(() => tags.id),
	},
	(table) => [primaryKey({ columns: [table.post_id, table.tag_id] }), index('idx_post_tags_tag').on(table.tag_id)]
);

export const media = sqliteTable(
	'media',
	{
		id: text('id').primaryKey(),
		post_id: text('post_id')
			.notNull()
			.references(() => posts.id),
		publication_id: text('publication_id')
			.notNull()
			.references(() => publications.id),
		// R2-hosted uploads carry an r2_key; media imported from Blogger is
		// external (r2_key NULL) and identified by source_url until localized.
		r2_key: text('r2_key'),
		source_url: text('source_url'),
		filename: text('filename').notNull(),
		mime_type: text('mime_type').notNull(),
		size: integer('size').notNull(),
		created_at: text('created_at').notNull(),
	},
	(table) => [
		uniqueIndex('media_r2_key_unique').on(table.r2_key),
		uniqueIndex('media_post_source_unique').on(table.post_id, table.source_url),
		index('idx_media_post').on(table.post_id),
		index('idx_media_publication').on(table.publication_id),
	]
);

export const bloggerSync = sqliteTable(
	'blogger_sync',
	{
		id: text('id').primaryKey(),
		post_id: text('post_id')
			.notNull()
			.references(() => posts.id),
		blogger_blog_id: text('blogger_blog_id').notNull(),
		blogger_post_id: text('blogger_post_id').notNull(),
		status: text('status').notNull(),
		last_synced_at: text('last_synced_at'),
		error: text('error'),
	},
	(table) => [uniqueIndex('blogger_sync_post_unique').on(table.post_id)]
);

export type Publication = typeof publications.$inferSelect;
export type Post = typeof posts.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type Media = typeof media.$inferSelect;