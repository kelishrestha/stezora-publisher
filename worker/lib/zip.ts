/**
 * A tiny store-only (no compression) ZIP writer for the Workers runtime. There
 * is no dependency: each entry is stored uncompressed with its CRC-32, which
 * every unzip tool can read. The payload here is a backup bundle of mostly
 * small text files, so skipping DEFLATE keeps the code trivial and the output
 * deterministic (a fixed 1980-01-01 modification stamp, no clock read).
 */

const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n += 1) {
		let c = n;
		for (let k = 0; k < 8; k += 1) {
			c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		}
		table[n] = c >>> 0;
	}
	return table;
})();

function crc32(bytes: Uint8Array): number {
	let crc = 0xffffffff;
	for (let i = 0; i < bytes.length; i += 1) {
		crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
	}
	return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
	/** Path inside the archive, forward-slash separated (e.g. `tables/posts.json`). */
	name: string;
	/** File contents; a string is encoded as UTF-8. */
	data: string | Uint8Array;
}

const encoder = new TextEncoder();
// 1980-01-01 00:00:00 in DOS date/time fields (year - 1980 = 0, month 1, day 1).
const DOS_DATE = 0x21;
const DOS_TIME = 0;
const UTF8_FLAG = 0x0800; // General-purpose bit 11: file name is UTF-8.

/** Builds a ZIP archive from the given entries and returns the raw bytes. */
export function zip(entries: ZipEntry[]): Uint8Array {
	const files = entries.map((entry) => {
		const data = typeof entry.data === 'string' ? encoder.encode(entry.data) : entry.data;
		return { name: encoder.encode(entry.name), data, crc: crc32(data) };
	});

	const localParts: Uint8Array[] = [];
	const centralParts: Uint8Array[] = [];
	const offsets: number[] = [];
	let offset = 0;

	for (const file of files) {
		offsets.push(offset);
		const header = new Uint8Array(30 + file.name.length);
		const view = new DataView(header.buffer);
		view.setUint32(0, 0x04034b50, true); // local file header signature
		view.setUint16(4, 20, true); // version needed to extract
		view.setUint16(6, UTF8_FLAG, true);
		view.setUint16(8, 0, true); // compression method: stored
		view.setUint16(10, DOS_TIME, true);
		view.setUint16(12, DOS_DATE, true);
		view.setUint32(14, file.crc, true);
		view.setUint32(18, file.data.length, true); // compressed size
		view.setUint32(22, file.data.length, true); // uncompressed size
		view.setUint16(26, file.name.length, true);
		view.setUint16(28, 0, true); // extra field length
		header.set(file.name, 30);
		localParts.push(header, file.data);
		offset += header.length + file.data.length;
	}

	files.forEach((file, index) => {
		const record = new Uint8Array(46 + file.name.length);
		const view = new DataView(record.buffer);
		view.setUint32(0, 0x02014b50, true); // central directory signature
		view.setUint16(4, 20, true); // version made by
		view.setUint16(6, 20, true); // version needed to extract
		view.setUint16(8, UTF8_FLAG, true);
		view.setUint16(10, 0, true); // compression method: stored
		view.setUint16(12, DOS_TIME, true);
		view.setUint16(14, DOS_DATE, true);
		view.setUint32(16, file.crc, true);
		view.setUint32(20, file.data.length, true);
		view.setUint32(24, file.data.length, true);
		view.setUint16(28, file.name.length, true);
		view.setUint16(30, 0, true); // extra field length
		view.setUint16(32, 0, true); // comment length
		view.setUint16(34, 0, true); // disk number start
		view.setUint16(36, 0, true); // internal attributes
		view.setUint32(38, 0, true); // external attributes
		view.setUint32(42, offsets[index], true); // local header offset
		record.set(file.name, 46);
		centralParts.push(record);
	});

	const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
	const eocd = new Uint8Array(22);
	const view = new DataView(eocd.buffer);
	view.setUint32(0, 0x06054b50, true); // end of central directory signature
	view.setUint16(8, files.length, true); // entries on this disk
	view.setUint16(10, files.length, true); // total entries
	view.setUint32(12, centralSize, true);
	view.setUint32(16, offset, true); // central directory offset
	view.setUint16(20, 0, true); // comment length

	const parts = [...localParts, ...centralParts, eocd];
	const total = parts.reduce((sum, part) => sum + part.length, 0);
	const out = new Uint8Array(total);
	let pos = 0;
	for (const part of parts) {
		out.set(part, pos);
		pos += part.length;
	}
	return out;
}
