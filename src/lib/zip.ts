/**
 * A ZIP of files, stored rather than compressed — and, the other way, any
 * ordinary ZIP read back.
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
 *
 * `unzip` reads what other tools write too — a package unzipped and zipped
 * again by an operating system is deflated — so it takes deflated entries
 * as well as stored ones, inflated by the browser's own
 * `DecompressionStream`. It goes by the central directory, which is where
 * the sizes are true even for an entry written as a stream.
 */

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
		throw new Error('Too much for one archive — export fewer cards at a time.');
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

/** Why an archive could not be read, said in words a person can act on. */
export class ZipError extends Error {}

/**
 * The most one entry may inflate to. An archive comes from somebody else, and
 * a few hundred kilobytes of deflate can stand for gigabytes of zeros, which
 * would take the tab — and its unsaved work — down with it.
 */
export const MAX_ENTRY = 256 * 1024 * 1024;

/**
 * The most a whole archive may inflate to. Per entry is not enough: a bomb
 * can point twenty directory entries at one local header, each under the
 * entry limit, and twenty of them are five gigabytes.
 */
export const MAX_ARCHIVE = 512 * 1024 * 1024;

class TooLarge extends Error {}

/** Inflated, but never past `limit`: the size the directory declares, or `MAX_ENTRY`. */
async function inflateRaw(data: Uint8Array, limit: number): Promise<Uint8Array> {
	const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
	const reader = stream.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.length;
		if (total > limit) {
			await reader.cancel();
			throw new TooLarge();
		}
		chunks.push(value);
	}
	const out = new Uint8Array(total);
	let at = 0;
	for (const chunk of chunks) {
		out.set(chunk, at);
		at += chunk.length;
	}
	return out;
}

/**
 * IBM code page 437's upper half: what a name means in an archive that does
 * not flag it UTF-8, as older and Windows tools write them. Read as UTF-8,
 * `café.jpg` came out `caf\uFFFD.jpg` and matched nothing.
 */
const CP437 =
	'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■\u00a0';

/**
 * A name as its archive spells it, in NFC. UTF-8 when flagged so (bit 11) —
 * and when it reads as UTF-8 at all, since macOS's Archive Utility writes
 * UTF-8 without the flag, and decomposed: `café` as `cafe` and an accent,
 * which a cell's `local:café.jpg` would never match. CP437 only for bytes
 * that are not UTF-8, as older and Windows tools write them.
 */
export function entryName(bytes: Uint8Array, utf8: boolean): string {
	if (!utf8 && bytes.some((b) => b >= 0x80)) {
		try {
			return new TextDecoder('utf-8', { fatal: true }).decode(bytes).normalize('NFC');
		} catch {
			return Array.from(bytes, (b) => (b < 0x80 ? String.fromCharCode(b) : CP437[b - 0x80])).join('');
		}
	}
	return new TextDecoder().decode(bytes).normalize('NFC');
}

/**
 * Every file in an archive, by its name inside it. Folders are left out —
 * an entry whose name ends in `/` holds nothing. Throws `ZipError` for a
 * file that is not a ZIP, or uses what this reader does not: ZIP64,
 * encryption, or a compression other than none and deflate.
 */
export async function unzip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	// The end record is the last 22 bytes, unless the archive has a comment
	// after it: up to 64 KB of one, searched backwards for the signature.
	let end = -1;
	for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 22 - 0xffff); at--) {
		if (view.getUint32(at, true) === 0x06054b50) {
			end = at;
			break;
		}
	}
	if (end < 0) throw new ZipError('This is not a ZIP archive.');
	const count = view.getUint16(end + 10, true);
	let at = view.getUint32(end + 16, true);
	if (count === 0xffff || at === 0xffffffff) throw new ZipError('This archive is ZIP64, which libelli cannot read.');

	const files = new Map<string, Uint8Array>();
	let total = 0;
	for (let i = 0; i < count; i++) {
		if (at + 46 > bytes.length || view.getUint32(at, true) !== 0x02014b50) throw new ZipError('This archive is damaged.');
		const flags = view.getUint16(at + 8, true);
		const method = view.getUint16(at + 10, true);
		const packed = view.getUint32(at + 20, true);
		const unpacked = view.getUint32(at + 24, true);
		const nameLength = view.getUint16(at + 28, true);
		const extraLength = view.getUint16(at + 30, true);
		const commentLength = view.getUint16(at + 32, true);
		const local = view.getUint32(at + 42, true);
		const name = entryName(bytes.subarray(at + 46, at + 46 + nameLength), !!(flags & 0x0800));
		at += 46 + nameLength + extraLength + commentLength;
		if (name.endsWith('/')) continue;
		if (flags & 1) throw new ZipError(`“${name}” in this archive is encrypted.`);
		if (local + 30 > bytes.length || view.getUint32(local, true) !== 0x04034b50) throw new ZipError('This archive is damaged.');
		// The local header's own name and extra field, which need not match the
		// directory's lengths, are what the data follows.
		const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
		const data = bytes.subarray(start, start + packed);
		if (data.length !== packed) throw new ZipError('This archive is cut short.');
		total += method === 0 ? packed : unpacked;
		if (total > MAX_ARCHIVE) throw new ZipError('This archive is too large to open.');
		if (method === 0) files.set(name, data.slice());
		else if (method === 8) {
			try {
				// No more than the directory says it holds: a bomb lies about that too.
				files.set(name, await inflateRaw(data, Math.min(unpacked, MAX_ENTRY)));
			} catch (error) {
				if (error instanceof TooLarge) throw new ZipError(`“${name}” in this archive is larger than it says, or too large to open.`);
				throw new ZipError(`“${name}” in this archive is damaged.`);
			}
		} else throw new ZipError(`“${name}” is compressed in a way libelli cannot read.`);
	}
	return files;
}
