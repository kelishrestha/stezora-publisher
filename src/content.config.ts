import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const posts = defineCollection({
	loader: glob({ pattern: '**/*.json', base: './src/content/posts' }),
	schema: z.object({
		title: z.string(),
		excerpt: z.string(),
		publication: z.string(),
		tags: z.array(z.string()).default([]),
		pubDate: z.coerce.date(),
		updatedDate: z.coerce.date().optional(),
		status: z.enum(['published', 'draft']).default('published'),
		content: z.string(),
		bloggerPostId: z.string().optional(),
		bloggerUrl: z.url().optional(),
	}),
});

export const collections = { posts };
