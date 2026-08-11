import { afterEach, describe, expect, it } from 'vitest';
import {
	bloggerBlogIdForPublication,
	bloggerUrlForPublication,
} from '../src/lib/blogger/config';

const SLUG = 'the-sore-transition';
const BLOG_ID_KEY = 'BLOGGER_THE_SORE_TRANSITION_BLOG_ID';
const BLOG_URL_KEY = 'BLOGGER_THE_SORE_TRANSITION_BLOG_URL';

afterEach(() => {
	delete process.env[BLOG_ID_KEY];
	delete process.env[BLOG_URL_KEY];
	delete process.env.BLOGGER_MY_BLOG_BLOG_ID;
});

describe('blogger config', () => {
	it('reads a required numeric blog id from the environment', () => {
		process.env[BLOG_ID_KEY] = '2453972458578480021';
		expect(bloggerBlogIdForPublication(SLUG)).toBe('2453972458578480021');
	});

	it('derives the env key from the publication slug', () => {
		process.env.BLOGGER_MY_BLOG_BLOG_ID = '123';
		expect(bloggerBlogIdForPublication('my-blog')).toBe('123');
	});

	it('throws a helpful error when the blog id is missing', () => {
		expect(() => bloggerBlogIdForPublication(SLUG)).toThrow(BLOG_ID_KEY);
		expect(() => bloggerBlogIdForPublication(SLUG)).toThrow(SLUG);
	});

	it('rejects a non-numeric blog id', () => {
		process.env[BLOG_ID_KEY] = 'not-a-number';
		expect(() => bloggerBlogIdForPublication(SLUG)).toThrow('Invalid Blogger blog ID');
	});

	it('returns undefined when the blog url is not configured', () => {
		expect(bloggerUrlForPublication(SLUG)).toBeUndefined();
	});

	it('normalizes a host-only blog url to an absolute https url', () => {
		process.env[BLOG_URL_KEY] = 'thesoretransition.blogspot.com';
		expect(bloggerUrlForPublication(SLUG)).toBe('https://thesoretransition.blogspot.com/');
	});

	it('accepts an already absolute blog url', () => {
		process.env[BLOG_URL_KEY] = 'https://example.blogspot.com/';
		expect(bloggerUrlForPublication(SLUG)).toBe('https://example.blogspot.com/');
	});

	it('rejects an invalid blog url', () => {
		process.env[BLOG_URL_KEY] = 'not a url';
		expect(() => bloggerUrlForPublication(SLUG)).toThrow('Invalid Blogger blog URL');
	});
});
