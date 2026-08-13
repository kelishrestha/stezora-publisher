import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

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

export const categories = sqliteTable(
	'categories',
	{
		id: text('id').primaryKey(),
		publication_id: text('publication_id')
			.notNull()
			.references(() => publications.id),
		name: text('name').notNull(),
		slug: text('slug').notNull(),
	},
	(table) => [uniqueIndex('categories_publication_slug_unique').on(table.publication_id, table.slug)]
);

export const posts = sqliteTable(
	'posts',
	{
		id: text('id').primaryKey(),
		publication_id: text('publication_id')
			.notNull()
			.references(() => publications.id),
		category_id: text('category_id').references(() => categories.id),
		title: text('title').notNull(),
		slug: text('slug').notNull(),
		excerpt: text('excerpt'),
		content: text('content').notNull(),
		status: text('status').notNull().default('draft'),
		published_at: text('published_at'),
		updated_at: text('updated_at'),
		canonical_url: text('canonical_url'),
		blogger_blog_id: text('blogger_blog_id'),
		blogger_post_id: text('blogger_post_id'),
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
		name: text('name').notNull(),
		slug: text('slug').notNull(),
	},
	(table) => [uniqueIndex('tags_slug_unique').on(table.slug)]
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
		post_id: text('post_id').references(() => posts.id),
		r2_key: text('r2_key').notNull(),
		filename: text('filename').notNull(),
		mime_type: text('mime_type').notNull(),
		size: integer('size').notNull(),
		created_at: text('created_at').notNull(),
	},
	(table) => [
		uniqueIndex('media_r2_key_unique').on(table.r2_key),
		index('idx_media_post').on(table.post_id),
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
export type Category = typeof categories.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type Media = typeof media.$inferSelect;