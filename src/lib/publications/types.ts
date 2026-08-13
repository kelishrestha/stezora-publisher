export type PublicationAccent =
	| 'space-indigo'
	| 'ocean-deep'
	| 'dark-amaranth'
	| 'bright-amber'
	| 'soft-periwinkle';

export interface Publication {
	id: string;
	name: string;
	slug: string;
	description: string;
	accent: PublicationAccent;
}
