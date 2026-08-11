import type { BloggerPostDto, ImportReport } from './types';

export class ImportReporter {
	private report: ImportReport;

	constructor(publicationSlug: string, blogId: string) {
		this.report = {
			publicationSlug,
			blogId,
			found: 0,
			imported: 0,
			skipped: 0,
			skippedPosts: [],
			failed: [],
			images: [],
		};
	}

	recordFound(): void {
		this.report.found += 1;
	}

	recordImported(images: string[]): void {
		this.report.imported += 1;
		for (const url of images) {
			this.report.images.push({ url });
		}
	}

	recordSkipped(dto: BloggerPostDto, reason: string): void {
		this.report.skipped += 1;
		this.report.skippedPosts.push({ bloggerPostId: dto.id, title: dto.title, reason });
	}

	recordFailed(dto: BloggerPostDto, error: unknown): void {
		this.report.failed.push({
			bloggerPostId: dto.id,
			title: dto.title,
			error: error instanceof Error ? error.message : String(error),
		});
	}

	get summary(): ImportReport {
		return this.report;
	}
}
