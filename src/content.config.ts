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
		seoTitle: z.string().optional(),
		seoDescription: z.string().optional(),
		featuredImage: z.string().optional(),
		bloggerBlogId: z.string().optional(),
		bloggerPostId: z.string().optional(),
		bloggerUrl: z.url().optional(),
		neobookUrl: z.url().optional(),
		neobookViews: z.number().optional(),
		neobookLikes: z.number().optional(),
		neobookComments: z.number().optional(),
	}),
});

const testimonials = defineCollection({
	loader: glob({ pattern: '**/*.json', base: './src/content/testimonials' }),
	schema: z.object({
		name: z.string(),
		location: z.string().optional().default(''),
		work: z.string().optional().default(''),
		story: z.string(),
		rating: z.number().optional().default(5),
		sortOrder: z.number().optional().default(0),
	}),
});

export const collections = { posts, testimonials };
