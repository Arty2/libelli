/**
 * A ZIP of files, stored rather than compressed.
 *
 * For the PNG export: fifty cards used to be fifty downloads, which a browser
 * either asks about fifty times or quietly stops after the first few. One
 * archive is one download. Stored, not deflated, because a PNG is already
 * compressed — deflating it again costs time and saves next to nothing — and
 * because stored entries need no compressor, so there is still no dependency
 * (see "No runtime dependencies" in AGENTS.md). What is left is the format's
 * bookkeeping: a CRC-32 per file, a local header before each, and a central
 * directory at the end that every unzip tool reads.
 *
 * No ZIP64: an archive over 4 GB of cards is not a thing this app makes, and
 * `zipStore` refuses one rather than writing a file that would not open.
 */
import { t } from './strings';

export interface ZipEntry {
	name: string;
	data: Uint8Array;
	/** when the file was made; now if absent */
	date?: Date;
}

const TABLE = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		table[n] = c >>> 0;
	}
	return table;
})();

/** The CRC-32 every ZIP entry carries (IEEE 802.3, the same as gzip and PNG). */
export function crc32(bytes: Uint8Array): number {
	let crc = 0xffffffff;
	for (let i = 0; i < bytes.length; i++) crc = TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
	return (crc ^ 0xffffffff) >>> 0;
}

/** MS-DOS time and date, which is what the format has: two-second steps, from 1980. */
function dosDateTime(date: Date): { time: number; day: number } {
	const year = Math.max(1980, date.getFullYear());
	return {
		time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
		day: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
	};
}

export function zipStore(entries: ZipEntry[]): Uint8Array<ArrayBuffer> {
	const encoder = new TextEncoder();
	const locals: Uint8Array[] = [];
	const centrals: Uint8Array[] = [];
	let offset = 0;

	for (const entry of entries) {
		const name = encoder.encode(entry.name);
		const crc = crc32(entry.data);
		const size = entry.data.length;
		const { time, day } = dosDateTime(entry.date ?? new Date());

		const local = new Uint8Array(30 + name.length);
		const l = new DataView(local.buffer);
		l.setUint32(0, 0x04034b50, true);
		l.setUint16(4, 20, true); // version needed: 2.0
		l.setUint16(6, 0x0800, true); // the name is UTF-8
		l.setUint16(8, 0, true); // stored
		l.setUint16(10, time, true);
		l.setUint16(12, day, true);
		l.setUint32(14, crc, true);
		l.setUint32(18, size, true);
		l.setUint32(22, size, true);
		l.setUint16(26, name.length, true);
		l.setUint16(28, 0, true);
		local.set(name, 30);

		const central = new Uint8Array(46 + name.length);
		const c = new DataView(central.buffer);
		c.setUint32(0, 0x02014b50, true);
		c.setUint16(4, 20, true); // made by
		c.setUint16(6, 20, true); // needed
		c.setUint16(8, 0x0800, true);
		c.setUint16(10, 0, true);
		c.setUint16(12, time, true);
		c.setUint16(14, day, true);
		c.setUint32(16, crc, true);
		c.setUint32(20, size, true);
		c.setUint32(24, size, true);
		c.setUint16(28, name.length, true);
		// extra, comment, disk, internal and external attributes: all zero
		c.setUint32(42, offset, true);
		central.set(name, 46);

		locals.push(local, entry.data);
		centrals.push(central);
		offset += local.length + size;
	}

	const directorySize = centrals.reduce((sum, part) => sum + part.length, 0);
	if (offset + directorySize > 0xffffffff || entries.length > 0xffff) {
		throw new Error(t.errors.archiveTooBig);
	}
	const end = new Uint8Array(22);
	const e = new DataView(end.buffer);
	e.setUint32(0, 0x06054b50, true);
	e.setUint16(8, entries.length, true);
	e.setUint16(10, entries.length, true);
	e.setUint32(12, directorySize, true);
	e.setUint32(16, offset, true);

	const out = new Uint8Array(offset + directorySize + end.length);
	let at = 0;
	for (const part of [...locals, ...centrals, end]) {
		out.set(part, at);
		at += part.length;
	}
	return out;
}
