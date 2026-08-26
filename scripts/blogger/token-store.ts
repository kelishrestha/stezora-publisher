import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const TOKEN_DIR = path.join(process.cwd(), '.secrets');
const TOKEN_FILE = path.join(TOKEN_DIR, 'blogger-refresh-token');

export async function readBloggerRefreshToken(): Promise<string> {
	let token: string;
	try {
		token = (await readFile(TOKEN_FILE, 'utf-8')).trim();
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			throw new Error(`Blogger refresh token not found. Run "pnpm blogger:oauth" first; the token is stored in ${path.relative(process.cwd(), TOKEN_FILE)}.`);
		}
		throw error;
	}
	if (!token) {
		throw new Error(`Blogger refresh token file is empty: ${path.relative(process.cwd(), TOKEN_FILE)}`);
	}
	return token;
}

export async function writeBloggerRefreshToken(token: string): Promise<void> {
	const value = token.trim();
	if (!value) {
		throw new Error('Cannot store an empty Blogger refresh token');
	}
	await mkdir(TOKEN_DIR, { recursive: true, mode: 0o700 });
	await writeFile(TOKEN_FILE, `${value}\n`, { encoding: 'utf-8', mode: 0o600 });
	await chmod(TOKEN_FILE, 0o600);
	console.log(`\nStored Blogger refresh token in ${path.relative(process.cwd(), TOKEN_FILE)}`);
}
