export const SITE = {
	name: 'Stezora',
	url: 'https://stezora-publisher.workers.dev',
	description:
		'A personal multi-publication publishing platform written by one author and read by few, but valued by those who matter.',
	author: 'Stezora',
	locale: 'en',
	defaultImage: '/og-default.svg',
} as const;

export type SiteConfig = typeof SITE;
